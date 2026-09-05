import { afterEach, describe, expect, it } from "vitest";
import { BridgeClient } from "../../src/bridgeClient";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { composerButton } from "../../src/webview/store/selectors";
import { initialState, type AppState } from "../../src/webview/store/types";
import { startFakeBridge, type FakeBridge } from "../fake-bridge/server";
import type { Outbound } from "../../src/protocol";

let fake: FakeBridge | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (pred()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error("timeout"));
      setTimeout(tick, 15);
    };
    tick();
  });
}

/**
 * Bout-en-bout : faux bridge v2 → BridgeClient (WS réel) → réducteur. Le rejeu
 * passe par le **même** réducteur que le direct (C01 §6).
 */
describe("cycle de tour v2 contre le faux bridge", () => {
  it("tour nominal : idle → running → idle, un seul item assistant, deltas puis final", async () => {
    fake = await startFakeBridge({
      onMessage: (m) => {
        if ((m as { type?: string }).type !== "user_message") return [];
        return [
          { type: "turn_started", turn_id: "t1", seq: 1 },
          { type: "progress", turn_id: "t1", label: "thinking…", seq: 2 },
          { type: "event_delta", turn_id: "t1", event_id: "e1", text: "Hel", seq: 3 },
          { type: "event_delta", turn_id: "t1", event_id: "e1", text: "lo", seq: 4 },
          {
            type: "event",
            event: { kind: "MessageEvent", id: "e1", llm_message: { role: "assistant", content: [{ text: "Hello!" }] } },
            seq: 5,
          },
          { type: "usage", accumulated_cost: 0.02, prompt_tokens: 42, completion_tokens: 3, context_window: 8000, seq: 6 },
          { type: "turn_finished", turn_id: "t1", reason: "completed", seq: 7 },
        ] satisfies Outbound[];
      },
    });

    let state: AppState = reduce(initialState(), host({ type: "connection", state: "open" }));
    state = reduce(state, host({ type: "protocol", version: 2, capabilities: ["turns", "deltas"], degraded: false }));
    state = reduce(state, host({ type: "bridge", message: { type: "session_started", conversation_id: "c1", llm_source: "create_payload" } }));

    const client = new BridgeClient(fake.url, {
      onState: () => undefined,
      onMessage: (m) => {
        state = reduce(state, host({ type: "bridge", message: m }));
      },
    });
    client.start();
    await waitFor(() => client.send({ type: "user_message", text: "hi" }));
    await waitFor(() => state.phase.kind === "idle" && state.usage !== null);

    const assistants = state.items.filter((i) => i.kind === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]).toMatchObject({ text: "Hello!", streaming: false });
    expect(state.usage?.promptTokens).toBe(42);
    expect(state.progress).toBeNull();
    client.stop();
  });

  it("`usage` en milieu de tour ne termine pas le tour (le bug v1 corrigé)", async () => {
    fake = await startFakeBridge({
      onMessage: (m) =>
        (m as { type?: string }).type === "user_message"
          ? ([
              { type: "turn_started", turn_id: "t1", seq: 1 },
              { type: "usage", accumulated_cost: 0, prompt_tokens: 1, completion_tokens: 1, context_window: 8000, seq: 2 },
            ] satisfies Outbound[])
          : [],
    });

    let state: AppState = reduce(initialState(), host({ type: "protocol", version: 2, capabilities: [], degraded: false }));
    state = reduce(state, host({ type: "bridge", message: { type: "session_started", conversation_id: "c1", llm_source: "create_payload" } }));
    const client = new BridgeClient(fake.url, {
      onState: () => undefined,
      onMessage: (m) => {
        state = reduce(state, host({ type: "bridge", message: m }));
      },
    });
    client.start();
    await waitFor(() => client.send({ type: "user_message", text: "hi" }));
    await waitFor(() => state.phase.kind === "running");
    await new Promise((r) => setTimeout(r, 100));
    expect(state.phase.kind).toBe("running"); // usage n'a rien changé
    expect(composerButton(state)).toBe("stop");
    client.stop();
  });
});
