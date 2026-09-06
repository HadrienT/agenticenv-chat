import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState, type ChatItem } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";
import type { HostToWebview, TodoItemView } from "../../src/messages";

const bridge = (message: Outbound, at = 1000) => host({ type: "bridge", message }, at);
const fromHost = (message: HostToWebview, at = 1000) => host(message, at);

function running(caps: string[] = []): AppState {
  let s = reduce(initialState(), host({ type: "connection", state: "open" }));
  s = reduce(s, host({ type: "protocol", version: 2, capabilities: caps, degraded: false }));
  s = reduce(s, local({ type: "intent/startSession" }));
  s = reduce(s, bridge({ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }));
  s = reduce(s, local({ type: "intent/sendMessage", text: "go" }));
  return reduce(s, bridge({ type: "turn_started", turn_id: "t1" }, 2000));
}

describe("C09 — plan / todo / pilotage boucle agent", () => {
  it("`todo` remplace l'état complet, jamais de fusion", () => {
    let s = reduce(running(), fromHost({ type: "todo", items: [
      { id: "a", text: "step a", state: "done" },
      { id: "b", text: "step b", state: "active" },
    ] }));
    expect(s.todo).toHaveLength(2);
    expect(s.panels.todo).toBe(true);

    s = reduce(s, fromHost({ type: "todo", items: [{ id: "b", text: "step b", state: "done" }] }));
    expect(s.todo).toEqual([{ id: "b", text: "step b", state: "done" }]);
  });

  it("sans `todo`, aucun panneau (todo reste null)", () => {
    const s = running();
    expect(s.todo).toBeNull();
  });

  it("une étape `skipped` reste dans l'état", () => {
    const s = reduce(running(), fromHost({ type: "todo", items: [
      { id: "a", text: "skip me", state: "skipped" },
    ] }));
    expect(s.todo?.[0].state).toBe("skipped");
  });

  it("interruption avec capability : note marquée envoyée, rien en file", () => {
    const s = reduce(running(["interrupt"]), local({ type: "intent/interrupt", text: "focus on tests", capable: true }));
    const note = s.items[s.items.length - 1] as Extract<ChatItem, { kind: "queued-note" }>;
    expect(note.kind).toBe("queued-note");
    expect(note.sent).toBe(true);
    expect(s.pendingInterrupts).toEqual([]);
  });

  it("interruption sans capability : note en attente + texte en file", () => {
    const s = reduce(running(), local({ type: "intent/interrupt", text: "also update the changelog", capable: false }));
    const note = s.items[s.items.length - 1] as Extract<ChatItem, { kind: "queued-note" }>;
    expect(note.sent).toBe(false);
    expect(s.pendingInterrupts).toEqual(["also update the changelog"]);
  });

  it("`turn_finished` vide la file et marque les notes envoyées", () => {
    let s = reduce(running(), local({ type: "intent/interrupt", text: "note", capable: false }));
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t1", reason: "completed" }, 5000));
    expect(s.pendingInterrupts).toEqual([]);
    const note = s.items.find((i) => i.kind === "queued-note") as Extract<ChatItem, { kind: "queued-note" }>;
    expect(note.sent).toBe(true);
  });

  it("`max_iterations` ajoute une carte de continuation, pas une simple notice", () => {
    const s = reduce(running(), bridge({ type: "turn_finished", turn_id: "t1", reason: "max_iterations" }, 5000));
    const last = s.items[s.items.length - 1];
    expect(last.kind).toBe("max-iterations");
    expect(s.notices.find((n) => n.id.startsWith("turn-max"))).toBeUndefined();
  });

  it("résoudre la carte `max-iterations` la marque traitée", () => {
    let s = reduce(running(), bridge({ type: "turn_finished", turn_id: "t1", reason: "max_iterations" }, 5000));
    const id = s.items[s.items.length - 1].id;
    s = reduce(s, local({ type: "intent/resolveMaxIterations", itemId: id }));
    const item = s.items.find((i) => i.id === id) as Extract<ChatItem, { kind: "max-iterations" }>;
    expect(item.resolved).toBe(true);
  });

  it("`plan/set` bascule le mode plan", () => {
    let s = reduce(running(), local({ type: "plan/set", enabled: true }));
    expect(s.planMode).toBe(true);
    s = reduce(s, local({ type: "plan/set", enabled: false }));
    expect(s.planMode).toBe(false);
  });
});
