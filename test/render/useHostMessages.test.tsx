import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHostMessages } from "../../src/webview/store/useHostMessages";
import type { Action } from "../../src/webview/store/actions";

function post(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

describe("useHostMessages", () => {
  it("les deltas en attente d'une image passent avant le message qui les suit", () => {
    const seen: string[] = [];
    const dispatch = vi.fn((action: Action) => {
      if (action.source === "host" && action.message.type === "bridge") {
        seen.push(action.message.message.type);
      }
    });
    renderHook(() => useHostMessages(dispatch, () => undefined));

    const bridge = (message: unknown): unknown => ({ type: "bridge", message });
    post(bridge({ type: "event_delta", turn_id: "t", event_id: "s", text: "a" }));
    post(bridge({ type: "turn_finished", turn_id: "t", reason: "completed" }));

    expect(seen).toEqual(["event_delta", "turn_finished"]);
  });
});
