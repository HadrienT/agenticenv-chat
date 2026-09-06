import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { Outbound, SdkEvent } from "../../src/protocol";

const bridge = (message: Outbound, at = 1000) => host({ type: "bridge", message }, at);

function running(): AppState {
  let s = reduce(initialState(), host({ type: "connection", state: "open" }));
  s = reduce(s, host({ type: "protocol", version: 2, capabilities: [], degraded: false }));
  s = reduce(s, local({ type: "intent/startSession" }));
  s = reduce(s, bridge({ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }));
  s = reduce(s, local({ type: "intent/sendMessage", text: "go" }));
  return reduce(s, bridge({ type: "turn_started", turn_id: "t1" }, 2000));
}

const msgEvent = (i: number): SdkEvent => ({
  kind: "MessageEvent",
  id: `e${i}`,
  source: "agent",
  llm_message: { role: "assistant", content: [{ type: "text", text: `line ${i}` }] },
});

describe("C14 §5 — robustesse", () => {
  it("un fil de 2000 items reste cohérent (index aligné, pas de doublon)", () => {
    // NB : le réducteur copie `items` à chaque append (O(n²)) — acceptable
    // jusqu'à la virtualisation (C14 §1, différée). Ici on vérifie la
    // **cohérence**, pas la perf brute.
    let s = running();
    for (let i = 0; i < 2000; i++) {
      s = reduce(s, bridge({ type: "event", event: msgEvent(i) }, 3000 + i));
    }
    expect(s.items.length).toBe(2000);
    expect(Object.keys(s.itemIndex).length).toBe(2000);
    const last = s.items[s.items.length - 1];
    expect(s.itemIndex[last.id]).toBe(s.items.length - 1);
  });

  it("`turn_finished` avec un turn_id inconnu ne casse pas la machine", () => {
    let s = running();
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "ghost", reason: "completed" }, 4000));
    expect(s.phase.kind).toBe("running");
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t1", reason: "completed" }, 5000));
    expect(s.phase.kind).toBe("idle");
  });

  it("deux `turn_started` sans `turn_finished` : le second est ignoré + notice", () => {
    let s = running();
    s = reduce(s, bridge({ type: "turn_started", turn_id: "t2" }, 3000));
    expect(s.phase.kind === "running" && s.phase.turnId).toBe("t1");
    expect(s.notices.some((n) => n.id === "turn-overlap")).toBe(true);
  });
});
