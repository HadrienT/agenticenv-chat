import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";
import type { HostToWebview } from "../../src/messages";

const bridge = (message: Outbound, at = 1000) => host({ type: "bridge", message }, at);
const fromHost = (message: HostToWebview, at = 1000) => host(message, at);

function idle(): AppState {
  let s = reduce(initialState(), host({ type: "connection", state: "open" }));
  s = reduce(s, host({ type: "protocol", version: 2, capabilities: ["compact"], degraded: false }));
  s = reduce(s, local({ type: "intent/startSession" }));
  return reduce(
    s,
    bridge({ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }),
  );
}

describe("C13 — budget de contexte & compaction", () => {
  it("`metrics` renseigne la fenêtre avant le premier tour", () => {
    let s = idle();
    expect(s.usage).toBeNull();
    s = reduce(s, fromHost({ type: "metrics", contextWindow: 32768 }));
    expect(s.usage?.contextWindow).toBe(32768);
    expect(s.usage?.promptTokens).toBe(0);
  });

  it("`metrics` avec tokensPerSec conserve la fenêtre déjà connue", () => {
    let s = reduce(idle(), fromHost({ type: "metrics", contextWindow: 16000 }));
    s = reduce(s, fromHost({ type: "metrics", tokensPerSec: 42.5 }));
    expect(s.usage?.contextWindow).toBe(16000);
    expect(s.usage?.tokensPerSec).toBe(42.5);
  });

  it("`context_stats` met à jour l'usage et le drapeau compacted", () => {
    let s = idle();
    s = reduce(
      s,
      bridge({
        type: "context_stats",
        prompt_tokens: 8000,
        context_window: 32768,
        compacted: true,
      }),
    );
    expect(s.usage?.promptTokens).toBe(8000);
    expect(s.usage?.contextWindow).toBe(32768);
    expect(s.compacted).toBe(true);
  });

  it("`history_compacted` ajoute un marqueur consultable dans le fil", () => {
    let s = idle();
    s = reduce(
      s,
      bridge({
        type: "history_compacted",
        turns_summarized: 7,
        summary: "resume des 7 tours",
      }),
    );
    const last = s.items[s.items.length - 1];
    expect(last.kind).toBe("compaction");
    expect(last).toMatchObject({ turns: 7, summary: "resume des 7 tours" });
    expect(s.compacted).toBe(true);
    expect(s.itemIndex[last.id]).toBe(s.items.length - 1);
  });
});
