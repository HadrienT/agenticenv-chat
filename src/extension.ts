import * as vscode from "vscode";
import { BridgeClient } from "./bridgeClient";
import type { HostToWebview, Outbound, WebviewToHost } from "./protocol";

const VIEW_ID = "agenticenvChat.view";

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

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onWebviewMessage(msg));

    this.bridge = new BridgeClient(this.bridgeUrl(), {
      onState: (state, detail) => this.postToWebview({ type: "connection", state, detail }),
      onMessage: (message) => this.onBridgeMessage(message),
    });
    this.bridge.start();

    const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agenticenvChat.bridgeUrl")) {
        this.bridge?.setUrl(this.bridgeUrl());
      }
    });

    view.onDidDispose(() => {
      cfgSub.dispose();
      this.bridge?.stop();
      this.bridge = undefined;
      this.view = undefined;
    });
  }

  newSession(): void {
    this.postToWebview({ type: "reset" });
    // The webview drives the actual start_session (it owns the MCP selection).
  }

  reconnect(): void {
    this.bridge?.reconnect();
  }

  private onWebviewMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready":
        this.bridge?.send({ type: "list_mcp_servers" });
        break;
      case "startSession":
        this.bridge?.send({ type: "start_session", mcp_servers: msg.mcpServers });
        break;
      case "userMessage":
        this.bridge?.send({ type: "user_message", text: msg.text });
        break;
      case "confirm":
        this.bridge?.send({ type: "confirm_action", accept: msg.accept });
        break;
      case "openDiff":
        void this.openDiff(msg.path);
        break;
    }
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
