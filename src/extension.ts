import * as vscode from "vscode";
import { BridgeClient } from "./bridgeClient";
import { actionCommand, checkHealth, type HealthContext } from "./health";
import type {
  ComponentHealth,
  HealthActionId,
  HostToWebview,
  Outbound,
  WebviewToHost,
} from "./protocol";

const VIEW_ID = "agenticenvChat.view";
const HEALTH_POLL_MS = 8000;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("agenticenvChat.newSession", () => provider.newSession()),
    vscode.commands.registerCommand("agenticenvChat.reconnect", () => provider.reconnect()),
  );
}

export function deactivate(): void {
  // BridgeClient is stopped via the view's onDidDispose.
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private bridge: BridgeClient | undefined;
  private healthTimer: NodeJS.Timeout | undefined;
  private healthInFlight = false;
  private closedTimer: NodeJS.Timeout | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    // resolveWebviewView can be called again (e.g. the view is moved between
    // sidebar and panel). Tear the previous bridge down first so we never run
    // two clients against the one-session bridge.
    this.bridge?.stop();

    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onWebviewMessage(msg));

    this.bridge = new BridgeClient(this.bridgeUrl(), {
      onState: (state, detail) => this.onBridgeState(state, detail),
      onMessage: (message) => this.onBridgeMessage(message),
    });
    this.bridge.start();

    const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agenticenvChat.bridgeUrl")) {
        this.bridge?.setUrl(this.bridgeUrl());
      }
      if (e.affectsConfiguration("agenticenvChat")) {
        void this.pollHealth();
      }
    });

    view.onDidChangeVisibility(() => this.updateHealthPolling(view.visible));
    this.updateHealthPolling(view.visible);

    view.onDidDispose(() => {
      cfgSub.dispose();
      this.updateHealthPolling(false);
      if (this.closedTimer) {
        clearTimeout(this.closedTimer);
      }
      this.bridge?.stop();
      this.bridge = undefined;
      this.view = undefined;
    });
  }

  private onBridgeState(state: "connecting" | "open" | "closed", detail?: string): void {
    if (this.closedTimer) {
      clearTimeout(this.closedTimer);
      this.closedTimer = undefined;
    }
    if (state === "closed") {
      // Debounce: a VS Code extension-host restart or a 1s reconnect blip
      // should not flash the banner red. Only report "closed" if it sticks.
      this.closedTimer = setTimeout(() => {
        this.postToWebview({ type: "connection", state: "closed", detail });
      }, 2500);
      return;
    }
    this.postToWebview({ type: "connection", state, detail });
    if (state === "open") {
      // Re-request whatever a fresh connection needs; the first `list_mcp_servers`
      // sent on webview load may have raced an unconnected socket.
      this.bridge?.send({ type: "list_mcp_servers" });
    }
    void this.pollHealth();
  }

  private updateHealthPolling(active: boolean): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
    if (active) {
      void this.pollHealth();
      this.healthTimer = setInterval(() => void this.pollHealth(), HEALTH_POLL_MS);
    }
  }

  private async pollHealth(): Promise<void> {
    if (this.healthInFlight || !this.view) {
      return;
    }
    this.healthInFlight = true;
    try {
      const components = await checkHealth(this.healthContext());
      this.postToWebview({ type: "health", components });
    } catch {
      // best-effort; next tick retries
    } finally {
      this.healthInFlight = false;
    }
  }

  private healthContext(): HealthContext {
    const cfg = vscode.workspace.getConfiguration("agenticenvChat");
    return {
      bridgeUrl: cfg.get<string>("bridgeUrl", "ws://127.0.0.1:8300"),
      agenticEnvPath: cfg.get<string>("agenticEnvPath", "~/AgenticEnv"),
    };
  }

  newSession(): void {
    this.postToWebview({ type: "reset" });
    // The webview drives the actual start_session (it owns the MCP selection).
  }

  reconnect(): void {
    this.bridge?.reconnect();
  }

  /** Sends to the bridge; tells the webview if the socket wasn't open. */
  private sendOrNotify(inbound: Parameters<BridgeClient["send"]>[0], what: string): void {
    if (!this.bridge?.send(inbound)) {
      this.postToWebview({
        type: "hostError",
        text: `Can't ${what} — not connected to the bridge. Start it from the Components panel.`,
      });
    }
  }

  private onWebviewMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready":
        this.bridge?.send({ type: "list_mcp_servers" });
        break;
      case "startSession":
        this.sendOrNotify({ type: "start_session", mcp_servers: msg.mcpServers }, "start a session");
        break;
      case "userMessage":
        this.sendOrNotify({ type: "user_message", text: msg.text }, "send the message");
        break;
      case "confirm":
        this.sendOrNotify({ type: "confirm_action", accept: msg.accept }, "answer");
        break;
      case "openDiff":
        void this.openDiff(msg.path);
        break;
      case "refreshHealth":
        void this.pollHealth();
        break;
      case "healthAction":
        this.runHealthAction(msg.component, msg.action);
        break;
    }
  }

  private runHealthAction(component: ComponentHealth["id"], action: HealthActionId): void {
    const cmd = actionCommand(component, action, this.healthContext());
    if (!cmd) {
      return;
    }
    const term =
      vscode.window.terminals.find((t) => t.name === "AgenticEnv") ??
      vscode.window.createTerminal("AgenticEnv");
    term.show();
    term.sendText(cmd, true);
    // Re-check shortly after so the panel reflects the result.
    setTimeout(() => void this.pollHealth(), 4000);
  }

  private onBridgeMessage(message: Outbound): void {
    if (message.type === "mcp_servers") {
      this.postToWebview({
        type: "mcpServers",
        servers: message.servers.map((s) => ({
          name: s.name,
          transport: s.transport,
          tools: s.tools_allowlist,
        })),
      });
      return;
    }
    this.postToWebview({ type: "bridge", message });
  }

  private async openDiff(relPath: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }
    const uri = vscode.Uri.joinPath(folder.uri, relPath);
    // Best-effort: show the file against its last committed version via the
    // built-in git extension's URI scheme; fall back to just opening it.
    try {
      await vscode.commands.executeCommand("git.openChange", uri);
    } catch {
      await vscode.window.showTextDocument(uri);
    }
  }

  private postToWebview(msg: HostToWebview): void {
    void this.view?.webview.postMessage(msg);
  }

  private bridgeUrl(): string {
    return vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<string>("bridgeUrl", "ws://127.0.0.1:8300");
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    );
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgenticEnv Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
