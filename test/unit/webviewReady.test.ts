import { describe, expect, it } from "vitest";
import { ChatViewProvider } from "../../src/chatViewProvider";
import type { HostToWebview } from "../../src/messages";

/** Rejoue `ready` sur le vrai handler, sans monter de webview ni ses services. */
function ready(conversationId?: string): HostToWebview[] {
  const posted: HostToWebview[] = [];
  const noop = (): void => undefined;
  const host = {
    conversationId,
    postToWebview: (m: HostToWebview) => posted.push(m),
    sendWorkspace: noop,
    sendAutoContext: noop,
    sendPermissionMode: noop,
    sendStarters: noop,
    sendCommandsAndModes: noop,
    defaultContextWindow: noop,
  };
  const handler = (ChatViewProvider.prototype as never as { onWebviewMessage(m: unknown): void })
    .onWebviewMessage;
  handler.call(host, { type: "ready", stateVersion: 1 });
  return posted;
}

describe("webview ready", () => {
  it("sans session côté hôte, rejoue `reset` pour quitter un `idle` restauré", () => {
    expect(ready()[0]).toEqual({ type: "reset" });
  });

  it("avec une session vivante, ne touche pas au fil", () => {
    expect(ready("c1").map((m) => m.type)).not.toContain("reset");
  });
});
