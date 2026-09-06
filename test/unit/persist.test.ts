import { describe, expect, it } from "vitest";
import {
  PERSIST_VERSION,
  fromPersisted,
  toPersisted,
  type PersistedState,
} from "../../src/webview/store/persist";
import { initialState, type AppState } from "../../src/webview/store/types";

function sample(): AppState {
  const s = initialState();
  return {
    ...s,
    phase: { kind: "idle", conversationId: "conv-7" },
    items: [
      { kind: "user", id: "ev-0", text: "hi" },
      { kind: "assistant", id: "ev-1", text: "hello", streaming: false, revision: 0 },
    ],
    itemIndex: { "ev-0": 0, "ev-1": 1 },
    eventSeq: 2,
    composer: {
      draft: "unsent draft",
      attachments: [{ ref: { kind: "file", uri: "file:///x/a.cpp" }, label: "a.cpp", estBytes: 100 }],
      history: ["earlier prompt"],
    },
    panels: { health: true, workingSet: false, todo: true },
    todo: [{ id: "t1", text: "Read the failing test", state: "done" }],
    planMode: true,
  };
}

describe("persist — round-trip (03-PROTOCOL §4)", () => {
  it("sérialise puis réhydrate à l'identique le sous-ensemble persisté", () => {
    const persisted = toPersisted(sample());
    expect(persisted.version).toBe(PERSIST_VERSION);

    const res = fromPersisted(persisted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.items).toEqual(sample().items);
    expect(res.state.composer.draft).toBe("unsent draft");
    expect(res.state.composer.attachments).toHaveLength(1);
    expect(res.state.panels).toEqual({ health: true, workingSet: false, todo: true });
    expect(res.state.phase).toEqual({ kind: "idle", conversationId: "conv-7" });
    expect(res.state.itemIndex).toEqual({ "ev-0": 0, "ev-1": 1 });
    // C09 : le plan produit par l'agent et le mode plan survivent au reload.
    expect(res.state.todo).toEqual([{ id: "t1", text: "Read the failing test", state: "done" }]);
    expect(res.state.planMode).toBe(true);
  });

  it("I7 — version inconnue ⇒ état vierge, jamais partiel", () => {
    const stale: PersistedState = { ...toPersisted(sample()), version: 999 };
    const res = fromPersisted(stale);
    expect(res).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("état absent ⇒ empty", () => {
    expect(fromPersisted(null)).toEqual({ ok: false, reason: "empty" });
    expect(fromPersisted(undefined)).toEqual({ ok: false, reason: "empty" });
  });

  it("objet sans `version` ⇒ traité comme inconnu", () => {
    expect(fromPersisted({ items: [] })).toEqual({ ok: false, reason: "unknown-version" });
  });

  it("filtre les items mal formés à l'hydratation", () => {
    const res = fromPersisted({
      version: PERSIST_VERSION,
      conversationId: null,
      items: [{ kind: "user", id: "ev-0", text: "ok" }, { kind: "bogus" }, 42, null],
      composerDraft: "",
      panels: { health: false, workingSet: true },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.items).toHaveLength(1);
    expect(res.state.phase).toEqual({ kind: "picking" });
  });

  it("tronque aux 200 derniers items", () => {
    const many = initialState();
    many.items = Array.from({ length: 350 }, (_, i) => ({
      kind: "user" as const,
      id: `ev-${i}`,
      text: `m${i}`,
    }));
    expect(toPersisted(many).items).toHaveLength(200);
    expect(toPersisted(many).items[0].id).toBe("ev-150");
  });
});
