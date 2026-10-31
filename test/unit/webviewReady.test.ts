import { describe, expect, it } from "vitest";
import { ChatViewProvider } from "../../src/chatViewProvider";
import type { HostToWebview } from "../../src/messages";

type Host = {
  conversationId?: string;
  postToWebview(m: HostToWebview): void;
  onWebviewMessage(m: unknown): void;
};

/** Le vrai provider, sans constructeur : ni webview montée, ni services. */
function host(conversationId?: string): { provider: Host; delivered: HostToWebview[] } {
  const delivered: HostToWebview[] = [];
  const noop = (): void => undefined;
  const provider = Object.assign(Object.create(ChatViewProvider.prototype) as Host, {
    conversationId,
    webviewReady: false,
    beforeReady: [],
    view: { webview: { postMessage: (m: HostToWebview) => delivered.push(m) } },
    sendWorkspace: noop,
    sendAutoContext: noop,
    sendPermissionMode: noop,
    sendStarters: noop,
    sendCommandsAndModes: noop,
    defaultContextWindow: noop,
  });
  return { provider, delivered };
}

const READY = { type: "ready", stateVersion: 1 };
const OPEN: HostToWebview = { type: "connection", state: "open" };

describe("webview ready", () => {
  it("rien ne part avant `ready` : la webview n'écoute pas encore", () => {
    const { provider, delivered } = host("c1");
    provider.postToWebview(OPEN);
    expect(delivered).toEqual([]);
  });

  it("une connexion ouverte avant `ready` arrive quand même", () => {
    const { provider, delivered } = host("c1");
    provider.postToWebview(OPEN);
    provider.onWebviewMessage(READY);
    expect(delivered).toContainEqual(OPEN);
  });

  it("sans session côté hôte, `reset` passe avant les messages en attente", () => {
    const { provider, delivered } = host();
    provider.postToWebview({ type: "models", models: [] });
    provider.onWebviewMessage(READY);
    expect(delivered.map((m) => m.type).slice(0, 2)).toEqual(["reset", "models"]);
  });

  it("avec une session vivante, ne touche pas au fil", () => {
    const { provider, delivered } = host("c1");
    provider.onWebviewMessage(READY);
    expect(delivered.map((m) => m.type)).not.toContain("reset");
  });

  it("après `ready`, les messages partent directement", () => {
    const { provider, delivered } = host("c1");
    provider.onWebviewMessage(READY);
    provider.postToWebview(OPEN);
    expect(delivered).toContainEqual(OPEN);
  });
});
