import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { titleFor } from "../../src/webview/store/selectors";
import { initialState, type AppState, type ChatItem } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";

const bridge = (m: Outbound) => host({ type: "bridge", message: m }, 1000);

function withItems(items: ChatItem[], phase: AppState["phase"] = { kind: "idle", conversationId: "c" }): AppState {
  const idx: Record<string, number> = {};
  items.forEach((it, i) => (idx[it.id] = i));
  return { ...initialState(), items, itemIndex: idx, phase };
}

const THREAD: ChatItem[] = [
  { kind: "user", id: "u1", text: "first question" },
  { kind: "assistant", id: "a1", text: "first answer", streaming: false, revision: 0 },
  { kind: "user", id: "u2", text: "second question" },
  { kind: "assistant", id: "a2", text: "second answer", streaming: false, revision: 0 },
];

describe("édition de la conversation (C08 §4)", () => {
  it("truncateFrom retire l'item et les suivants ; branche conservée", () => {
    const s = reduce(withItems(THREAD), local({ type: "thread/truncateFrom", itemId: "u2", at: 5 }));
    expect(s.items.map((i) => i.id)).toEqual(["u1", "a1"]);
    expect(s.branches).toHaveLength(1);
    expect(s.branches[0].removed.map((i) => i.id)).toEqual(["u2", "a2"]);
  });

  it("editMessage change le texte, retire les suivants, garde la branche", () => {
    const s = reduce(
      withItems(THREAD),
      local({ type: "thread/editMessage", itemId: "u1", text: "reworded question", at: 5 }),
    );
    expect(s.items.map((i) => i.id)).toEqual(["u1"]);
    expect((s.items[0] as { text: string }).text).toBe("reworded question");
    expect(s.branches[0].removed.map((i) => i.id)).toEqual(["a1", "u2", "a2"]);
  });

  it("restoreBranch réinjecte la version précédente", () => {
    let s = reduce(withItems(THREAD), local({ type: "thread/truncateFrom", itemId: "u2", at: 5 }));
    s = reduce(s, local({ type: "thread/restoreBranch", index: 0 }));
    expect(s.items.map((i) => i.id)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(s.branches).toEqual([]);
  });

  it("impossible pendant `running`", () => {
    let s = withItems(THREAD, { kind: "running", conversationId: "c", turnId: "t", startedAt: 0 });
    s = reduce(s, local({ type: "thread/truncateFrom", itemId: "u2", at: 5 }));
    expect(s.items).toHaveLength(4);
  });
});

describe("titre auto (selector)", () => {
  it("dérivé sans LLM", () => {
    let s = reduce(initialState(), host({ type: "bridge", message: { type: "session_started", conversation_id: "c", llm_source: "create_payload" } }));
    s = reduce(s, bridge({ type: "event", event: { kind: "MessageEvent", llm_message: { role: "user", content: [{ text: "explain the pricing engine architecture please" }] } } }));
    expect(titleFor(s)).toBe("explain the pricing engine architecture please");
  });
});
