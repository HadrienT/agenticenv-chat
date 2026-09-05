import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { patchItem, reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";

const bridge = (message: Outbound) => host({ type: "bridge", message });

function connected(): AppState {
  return reduce(initialState(), host({ type: "connection", state: "open", protocol: 2 }));
}

function idle(conversationId = "c1"): AppState {
  let s = connected();
  s = reduce(s, local({ type: "intent/startSession" }));
  s = reduce(
    s,
    bridge({ type: "session_started", conversation_id: conversationId, llm_source: "create_payload" }),
  );
  return s;
}

function running(conversationId = "c1"): AppState {
  return reduce(idle(conversationId), local({ type: "intent/sendMessage", at: 1000 }));
}

describe("reducer — machine à états (01-ARCHITECTURE §3)", () => {
  it("picking → starting → idle", () => {
    let s = connected();
    expect(s.phase.kind).toBe("picking");
    s = reduce(s, local({ type: "intent/startSession" }));
    expect(s.phase.kind).toBe("starting");
    s = reduce(
      s,
      bridge({ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }),
    );
    expect(s.phase).toEqual({ kind: "idle", conversationId: "c1" });
    expect(s.session).toEqual({ llmSource: "create_payload" });
  });

  it("idle → running sur intention d'envoi (optimiste, item 112)", () => {
    const s = running();
    expect(s.phase.kind).toBe("running");
    if (s.phase.kind === "running") {
      expect(s.phase.turnId).not.toBe("");
      expect(s.phase.conversationId).toBe("c1");
    }
  });

  it("I5 — awaiting ne s'atteint que depuis running", () => {
    // depuis idle : ignoré
    let s = idle();
    s = reduce(s, bridge({ type: "awaiting_confirmation", conversation_id: "c1" }));
    expect(s.phase.kind).toBe("idle");

    // depuis running : accepté
    s = running();
    s = reduce(s, bridge({ type: "awaiting_confirmation", conversation_id: "c1" }));
    expect(s.phase.kind).toBe("awaiting");

    // confirm accept → running
    s = reduce(s, local({ type: "intent/confirm", accept: true, at: 2000 }));
    expect(s.phase.kind).toBe("running");
  });

  it("confirm reject depuis awaiting → idle", () => {
    let s = reduce(running(), bridge({ type: "awaiting_confirmation", conversation_id: "c1" }));
    s = reduce(s, local({ type: "intent/confirm", accept: false, at: 2000 }));
    expect(s.phase).toEqual({ kind: "idle", conversationId: "c1" });
  });

  it("I4 — une déconnexion préserve items et brouillon", () => {
    let s = running();
    s = reduce(s, local({ type: "composer/setDraft", draft: "half-written" }));
    s = reduce(s, bridge({ type: "event", event: userEvent("hi") }));
    const beforeItems = s.items;
    s = reduce(s, host({ type: "connection", state: "closed", detail: "socket" }));
    expect(s.connection.state).toBe("closed");
    expect(s.items).toEqual(beforeItems);
    expect(s.composer.draft).toBe("half-written");
  });

  it("I8 — le fil est append-only sauf patchItem sur un id existant", () => {
    let s = idle();
    s = reduce(s, bridge({ type: "event", event: assistantEvent("one") }));
    s = reduce(s, bridge({ type: "event", event: assistantEvent("two") }));
    expect(s.items.map((i) => i.id)).toEqual(["ev-0", "ev-1"]);
    expect(s.itemIndex).toEqual({ "ev-0": 0, "ev-1": 1 });

    const patched = patchItem(s, "ev-1", { text: "TWO" } as Partial<AppState["items"][number]>);
    expect(patched.items).toHaveLength(2);
    expect(patched.items[1]).toMatchObject({ id: "ev-1", text: "TWO" });

    // id inconnu : no-op
    expect(patchItem(s, "ev-999", { text: "x" } as Partial<AppState["items"][number]>)).toBe(s);
  });

  it("reset conserve connexion / santé / mcp / notices, vide le fil", () => {
    let s = running("c1");
    s = reduce(s, bridge({ type: "event", event: assistantEvent("hi") }));
    s = reduce(s, host({ type: "health", components: [] }));
    s = reduce(s, host({ type: "reset" }));
    expect(s.phase.kind).toBe("picking");
    expect(s.items).toEqual([]);
    expect(s.connection.state).toBe("open");
  });

  it("mcpServers élague la sélection aux serveurs encore présents", () => {
    let s = connected();
    s = reduce(s, local({ type: "mcp/toggle", name: "kbase" }));
    s = reduce(s, local({ type: "mcp/toggle", name: "gone" }));
    s = reduce(s, host({ type: "mcpServers", servers: [{ name: "kbase", transport: "stdio", tools: [] }] }));
    expect(s.mcp.selected).toEqual(["kbase"]);
  });

  it("notices : liste, pas chaîne unique — deux erreurs coexistent, dismiss cible l'id", () => {
    let s = idle();
    s = reduce(s, bridge({ type: "error", code: "PROJECT_READONLY", message: "ro", details: {} }));
    s = reduce(s, bridge({ type: "error", code: "TIMEOUT", message: "slow", details: {} }));
    expect(s.notices).toHaveLength(2);
    s = reduce(s, local({ type: "notice/dismiss", id: "bridge-TIMEOUT" }));
    expect(s.notices.map((n) => n.id)).toEqual(["bridge-PROJECT_READONLY"]);
  });

  describe("heuristique v1 (C00) — remplacée en C01", () => {
    it("files_changed termine le tour (comportement v1 constant)", () => {
      let s = running();
      s = reduce(s, bridge({ type: "files_changed", changes: [{ status: "UPDATED", path: "a.cpp" }] }));
      expect(s.phase.kind).toBe("idle");
      expect(s.workingSet).toEqual([{ status: "UPDATED", path: "a.cpp" }]);
    });

    it("usage termine le tour (comportement v1 constant)", () => {
      let s = running();
      s = reduce(s, bridge(usage()));
      expect(s.phase.kind).toBe("idle");
      expect(s.usage?.promptTokens).toBe(10);
    });
  });

  // --- invariants activés seulement en C01 (branchement turn_started/finished) ---
  it.todo("I1 — usage et files_changed ne changent jamais phase");
  it.todo("I2 — running implique un turnId issu d'un turn_started");
  it.todo("I3 — turn_finished avec un turn_id inconnu est ignoré");
  it.todo("I6 — deux turn_started consécutifs : le second est ignoré + notice");
});

// --- helpers d'événements (synthétiques, clairement étiquetés — les fixtures
// capturées du vrai bridge arrivent avec C01/C02, cf. test/fixtures/events/README.md) ---

function userEvent(text: string) {
  return { kind: "MessageEvent", llm_message: { role: "user", content: [{ text }] } };
}
function assistantEvent(text: string) {
  return { kind: "MessageEvent", llm_message: { role: "assistant", content: [{ text }] } };
}
function usage(): Outbound {
  return {
    type: "usage",
    accumulated_cost: 0.01,
    prompt_tokens: 10,
    completion_tokens: 5,
    context_window: 8000,
  };
}
