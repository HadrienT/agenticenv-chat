import * as vscode from "vscode";
import { BridgeClient, type BridgeState } from "./bridgeClient";
import { actionCommand, checkHealth, type HealthContext } from "./health";
import { log } from "./logging";
import {
  isWebviewToHost,
  type ComponentId,
  type HealthActionId,
  type HostToWebview,
  type WebviewToHost,
} from "./messages";
import { DEFAULT_SANDBOX_ROOT, resetMapping, setMapping, toHostUri } from "./paths";
import type { Outbound } from "./protocol";
import { assertNever } from "./assertNever";

const HEALTH_POLL_MS = 8000;
/** Debounce: un restart d'extension-host ou un blip de 1 s ne doit pas flasher la bannière. */
const CLOSED_DEBOUNCE_MS = 2500;

/**
 * `WebviewViewProvider` : HTML+CSP, routage `WebviewToHost`, cycle de vie du
 * bridge et sondage santé. Extrait de `extension.ts` par C00 (§ 02-REPOSITORY-TREE).
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private bridge: BridgeClient | undefined;
  private healthTimer: NodeJS.Timeout | undefined;
  private healthInFlight = false;
  private closedTimer: NodeJS.Timeout | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    // resolveWebviewView peut être rappelée (déplacement du panneau). On coupe le
    // bridge précédent d'abord pour ne jamais lancer deux clients contre le
    // bridge mono-session (C00 §8).
    this.bridge?.stop();

    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((raw: unknown) => {
      if (!isWebviewToHost(raw)) {
        log.warn("webview -> unknown message shape, dropped:", raw);
        return;
      }
      this.onWebviewMessage(raw);
    });

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

  newSession(): void {
    resetMapping();
    this.postToWebview({ type: "reset" });
    // La webview pilote le start_session réel (elle détient la sélection MCP).
  }

  reconnect(): void {
    this.bridge?.reconnect();
  }

  // --- bridge ------------------------------------------------------------

  private onBridgeState(state: BridgeState, detail?: string): void {
    if (this.closedTimer) {
      clearTimeout(this.closedTimer);
      this.closedTimer = undefined;
    }
    if (state === "closed") {
      this.closedTimer = setTimeout(() => {
        this.postToWebview({ type: "connection", state: "closed", detail });
      }, CLOSED_DEBOUNCE_MS);
      return;
    }
    this.postToWebview({ type: "connection", state, detail });
    if (state === "open") {
      // Re-demander ce dont une connexion fraîche a besoin : le premier
      // list_mcp_servers de la webview a pu courir contre un socket non ouvert
      // (AgenticEnv WP08c §3).
      this.bridge?.send({ type: "list_mcp_servers" });
    }
    void this.pollHealth();
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

  // --- webview -> hôte -------------------------------------------------

  private onWebviewMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready":
        log.debug("webview ready, stateVersion", msg.stateVersion);
        this.bridge?.send({ type: "list_mcp_servers" });
        this.sendWorkspace();
        break;
      case "startSession": {
        const projectPath = this.projectPath();
        setMapping({
          sandboxRoot: DEFAULT_SANDBOX_ROOT,
          hostRoot: projectPath ? vscode.Uri.file(projectPath) : null,
        });
        this.sendOrNotify(
          { type: "start_session", mcp_servers: msg.mcpServers, project_path: projectPath },
          "start a session",
        );
        break;
      }
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
      default:
        assertNever(msg, "WebviewToHost");
    }
  }

  /** Envoie au bridge ; prévient la webview si le socket n'était pas ouvert. */
  private sendOrNotify(inbound: Parameters<BridgeClient["send"]>[0], what: string): void {
    if (!this.bridge?.send(inbound)) {
      this.postToWebview({
        type: "hostError",
        text: `Can't ${what} — not connected to the bridge. Start it from the Components panel.`,
      });
    }
  }

  // --- santé ---------------------------------------------------------

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
    } catch (err) {
      log.debug("health poll failed, retrying next tick:", err);
    } finally {
      this.healthInFlight = false;
    }
  }

  private runHealthAction(component: ComponentId, action: HealthActionId): void {
    const cmd = actionCommand(component, action, this.healthContext());
    if (!cmd) {
      return;
    }
    const term =
      vscode.window.terminals.find((t) => t.name === "AgenticEnv") ??
      vscode.window.createTerminal("AgenticEnv");
    term.show();
    term.sendText(cmd, true);
    setTimeout(() => void this.pollHealth(), 4000);
  }

  private healthContext(): HealthContext {
    const cfg = vscode.workspace.getConfiguration("agenticenvChat");
    return {
      bridgeUrl: cfg.get<string>("bridgeUrl", "ws://127.0.0.1:8300"),
      agenticEnvPath: cfg.get<string>("agenticEnvPath", "~/AgenticEnv"),
    };
  }

  // --- workspace & diff -------------------------------------------

  private projectPath(): string | null {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder && folder.uri.scheme === "file" ? folder.uri.fsPath : null;
  }

  private sendWorkspace(): void {
    const folder = vscode.workspace.workspaceFolders?.[0];
    this.postToWebview({
      type: "workspace",
      folder: folder ? folder.name : null,
      path: this.projectPath(),
    });
  }

  private async openDiff(agentPath: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      log.debug("openDiff: no folder open");
      return;
    }
    // Chemin conteneur absolu → URI hôte via le traducteur unique ; sinon on le
    // traite comme relatif au dossier ouvert (chemins v1 de files_changed).
    const uri = toHostUri(agentPath) ?? vscode.Uri.joinPath(folder.uri, agentPath);
    try {
      await vscode.commands.executeCommand("git.openChange", uri);
    } catch (err) {
      log.debug("git.openChange unavailable, opening file directly:", err);
      await vscode.window.showTextDocument(uri);
    }
  }

  // --- plumbing --------------------------------------------------

  private postToWebview(msg: HostToWebview): void {
    void this.view?.webview.postMessage(msg);
  }

  private bridgeUrl(): string {
    return vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<string>("bridgeUrl", "ws://127.0.0.1:8300");
  }

  private html(webview: vscode.Webview): string {
    const asset = (file: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", file));
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${asset("webview.css")}" rel="stylesheet" />
    <title>AgenticEnv Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${asset("webview.js")}"></script>
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
