import * as vscode from "vscode";
import { assertNever } from "./assertNever";
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
import { appendFeedback } from "./sessions/feedback";
import { CLIENT_ID, CLIENT_PROTOCOL, type Outbound } from "./protocol";
import { resolveRefs } from "./context";
import { activeFileRef, searchFiles, selectionRef } from "./context/files";
import { searchSymbols } from "./context/symbols";
import { shellIntegrationAvailable } from "./context/terminal";
import type { ContextRef, ContextRefKind } from "./messages";

const HEALTH_POLL_MS = 8000;
/** Debounce: un restart d'extension-host ou un blip de 1 s ne doit pas flasher la bannière. */
const CLOSED_DEBOUNCE_MS = 2500;
/** Délai après lequel l'absence de `welcome` fait basculer en mode v1 dégradé (03-PROTOCOL §2.1). */
const NEGOTIATION_MS = 2000;

const K_CONVERSATION = "agenticenvChat.conversationId";
const K_LAST_SEQ = "agenticenvChat.lastSeq";

/**
 * `WebviewViewProvider` : HTML+CSP, routage `WebviewToHost`, cycle de vie du
 * bridge (négociation v2, `resume` après coupure), sondage santé.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private bridge: BridgeClient | undefined;
  private healthTimer: NodeJS.Timeout | undefined;
  private healthInFlight = false;
  private closedTimer: NodeJS.Timeout | undefined;
  private negotiationTimer: NodeJS.Timeout | undefined;
  private negotiated = false;
  private conversationId: string | undefined;
  private currentTurnId: string | undefined;
  private llmSource: string | undefined;
  private lastSeq = 0;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    // resolveWebviewView peut être rappelée (déplacement du panneau) : on coupe le
    // bridge précédent d'abord (C00 §8).
    this.bridge?.stop();
    this.clearNegotiationTimer();

    this.conversationId = this.context.workspaceState.get<string>(K_CONVERSATION);
    this.lastSeq = this.context.workspaceState.get<number>(K_LAST_SEQ, 0);

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
      if (e.affectsConfiguration("agenticenvChat.thread.expandThinking")) {
        this.sendWorkspace();
      }
      if (e.affectsConfiguration("agenticenvChat")) {
        void this.pollHealth();
      }
    });

    const editorSub = vscode.window.onDidChangeActiveTextEditor(() => this.sendWorkspace());
    const wsSub = vscode.workspace.onDidChangeWorkspaceFolders(() => this.sendWorkspace());

    view.onDidChangeVisibility(() => this.updateHealthPolling(view.visible));
    this.updateHealthPolling(view.visible);

    view.onDidDispose(() => {
      cfgSub.dispose();
      editorSub.dispose();
      wsSub.dispose();
      this.updateHealthPolling(false);
      if (this.closedTimer) {
        clearTimeout(this.closedTimer);
      }
      this.clearNegotiationTimer();
      this.bridge?.stop();
      this.bridge = undefined;
      this.view = undefined;
    });
  }

  newSession(): void {
    resetMapping();
    this.conversationId = undefined;
    this.currentTurnId = undefined;
    this.llmSource = undefined;
    this.lastSeq = 0;
    void this.context.workspaceState.update(K_CONVERSATION, undefined);
    void this.context.workspaceState.update(K_LAST_SEQ, undefined);
    this.postToWebview({ type: "reset" });
  }

  reconnect(): void {
    this.bridge?.reconnect();
  }

  // --- bridge ----------------------------------------------------------

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
      this.beginNegotiation();
    }
    void this.pollHealth();
  }

  private beginNegotiation(): void {
    this.negotiated = false;
    this.clearNegotiationTimer();
    // `hello` en premier (send direct, socket ouvert), puis le reste en file.
    this.bridge?.send({ type: "hello", protocol: CLIENT_PROTOCOL, client: CLIENT_ID });
    if (this.conversationId) {
      // Resynchronisation après coupure : le bridge rejoue seq > last_seq (C01 §6).
      this.bridge?.enqueue({
        type: "resume",
        conversation_id: this.conversationId,
        last_seq: this.lastSeq,
      });
    } else {
      this.bridge?.enqueue({ type: "list_mcp_servers" });
    }
    this.negotiationTimer = setTimeout(() => this.onNegotiationTimeout(), NEGOTIATION_MS);
  }

  private onNegotiationTimeout(): void {
    this.negotiationTimer = undefined;
    if (this.negotiated) {
      return;
    }
    log.warn("bridge did not answer `hello` — falling back to protocol v1 (degraded)");
    this.postToWebview({ type: "protocol", version: 1, capabilities: [], degraded: true });
  }

  private clearNegotiationTimer(): void {
    if (this.negotiationTimer) {
      clearTimeout(this.negotiationTimer);
      this.negotiationTimer = undefined;
    }
  }

  private onBridgeMessage(message: Outbound): void {
    if (typeof message.seq === "number" && message.seq > this.lastSeq) {
      this.lastSeq = message.seq;
      void this.context.workspaceState.update(K_LAST_SEQ, this.lastSeq);
    }

    switch (message.type) {
      case "welcome":
        this.negotiated = true;
        this.clearNegotiationTimer();
        this.postToWebview({
          type: "protocol",
          version: message.protocol,
          capabilities: message.capabilities,
          degraded: message.protocol < 2,
        });
        return;

      case "resumed":
        log.info("bridge resumed conversation at seq", message.seq ?? this.lastSeq);
        return;

      case "mcp_servers":
        this.postToWebview({
          type: "mcpServers",
          servers: message.servers.map((s) => ({
            name: s.name,
            transport: s.transport,
            tools: s.tools_allowlist,
          })),
        });
        return;

      case "session_started":
        this.conversationId = message.conversation_id;
        this.llmSource = message.llm_source;
        void this.context.workspaceState.update(K_CONVERSATION, this.conversationId);
        this.postToWebview({ type: "bridge", message });
        return;

      case "turn_started":
        this.currentTurnId = message.turn_id;
        this.postToWebview({ type: "bridge", message });
        return;

      case "turn_finished":
        if (this.currentTurnId === message.turn_id) {
          this.currentTurnId = undefined;
        }
        this.postToWebview({ type: "bridge", message });
        return;

      case "error":
        if (message.code === "UNKNOWN_CONVERSATION") {
          this.conversationId = undefined;
          void this.context.workspaceState.update(K_CONVERSATION, undefined);
        }
        this.postToWebview({ type: "bridge", message });
        return;

      default:
        this.postToWebview({ type: "bridge", message });
    }
  }

  // --- webview -> hôte ------------------------------------------------

  private onWebviewMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready":
        log.debug("webview ready, stateVersion", msg.stateVersion);
        this.sendWorkspace();
        this.bridge?.enqueue({ type: "list_mcp_servers" });
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
        void this.sendUserMessage(msg.text, msg.context);
        break;
      case "searchFiles":
        void this.runFileSearch(msg.query, msg.requestId);
        break;
      case "pickContext":
        void this.runPickContext(msg.kind);
        break;
      case "cancelTurn":
        if (this.currentTurnId) {
          this.sendOrNotify({ type: "cancel_turn", turn_id: this.currentTurnId }, "stop the turn");
        } else {
          log.debug("cancelTurn with no active turn id");
        }
        break;
      case "forceNewSession":
        // Pas de message bridge pour relancer la sandbox : on repart d'une
        // nouvelle conversation et on reconnecte le socket.
        this.newSession();
        this.bridge?.reconnect();
        break;
      case "confirm":
        this.sendOrNotify({ type: "confirm_action", accept: msg.accept }, "answer");
        break;
      case "openDiff":
        void this.openDiff(msg.path);
        break;
      case "openFile":
        void this.openFile(msg.path, msg.line);
        break;
      case "copy":
        void vscode.env.clipboard.writeText(msg.text);
        break;
      case "insertAtCursor":
        void this.insertAtCursor(msg.text);
        break;
      case "createFile":
        void this.createUntitled(msg.suggestedName, msg.content);
        break;
      case "runInTerminal":
        void this.runInTerminal(msg.command);
        break;
      case "feedback":
        void appendFeedback(this.context, {
          itemId: msg.itemId,
          value: msg.value,
          conversationId: this.conversationId,
          llmSource: this.llmSource,
        });
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

  /** Résout les `ContextRef` **à l'envoi** (C04) puis transmet au bridge. */
  private async sendUserMessage(text: string, refs: ContextRef[]): Promise<void> {
    let context;
    try {
      context = await resolveRefs(refs);
    } catch (err) {
      log.warn("context resolution failed, sending without context:", err);
      context = undefined;
    }
    this.sendOrNotify(
      { type: "user_message", text, ...(context && context.length ? { context } : {}) },
      "send the message",
    );
  }

  private async runFileSearch(query: string, requestId: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.postToWebview({ type: "fileResults", requestId, results: [] });
      return;
    }
    try {
      const results = await searchFiles(query, folder.uri);
      this.postToWebview({ type: "fileResults", requestId, results });
    } catch (err) {
      log.debug("file search failed:", err);
      this.postToWebview({ type: "fileResults", requestId, results: [] });
    }
  }

  private async runPickContext(kind: ContextRefKind): Promise<void> {
    if (kind === "file") {
      const active = activeFileRef();
      if (active) {
        this.postToWebview({ type: "attachContext", chip: active });
      }
      return;
    }
    if (kind === "selection") {
      const sel = selectionRef();
      if (sel) {
        this.postToWebview({ type: "attachContext", chip: sel });
      } else {
        this.postToWebview({ type: "hostError", text: "No selection in the active editor." });
      }
      return;
    }
    if (kind === "diagnostics") {
      this.postToWebview({
        type: "attachContext",
        chip: {
          ref: { kind: "diagnostics", scope: "workspace" },
          label: "diagnostics: workspace",
          estBytes: 4000,
        },
      });
      return;
    }
    if (kind === "git") {
      const pick = await vscode.window.showQuickPick(["status", "diff", "log"], {
        placeHolder: "Attach git…",
      });
      if (pick) {
        this.postToWebview({
          type: "attachContext",
          chip: {
            ref: { kind: "git", what: pick as "status" | "diff" | "log" },
            label: `git ${pick}`,
            estBytes: 4000,
          },
        });
      }
      return;
    }
    if (kind === "terminal") {
      const options = shellIntegrationAvailable()
        ? ["lastCommand", "selection"]
        : ["selection"];
      const pick = await vscode.window.showQuickPick(options, {
        placeHolder: shellIntegrationAvailable()
          ? "Attach terminal…"
          : "Attach terminal… (shell integration inactive: last command unavailable)",
      });
      if (pick) {
        this.postToWebview({
          type: "attachContext",
          chip: {
            ref: { kind: "terminal", which: pick as "lastCommand" | "selection" },
            label: `terminal ${pick}`,
            estBytes: 3000,
          },
        });
      }
      return;
    }
    if (kind === "symbol") {
      const query = await vscode.window.showInputBox({ prompt: "Symbol name" });
      if (!query) {
        return;
      }
      const chips = await searchSymbols(query);
      const picked = await vscode.window.showQuickPick(
        chips.map((c) => ({ label: c.label, description: c.detail, chip: c })),
        { placeHolder: "Attach symbol definition" },
      );
      if (picked) {
        this.postToWebview({ type: "attachContext", chip: picked.chip });
      }
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

  // --- workspace & diff --------------------------------------------

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
      sandboxRoot: DEFAULT_SANDBOX_ROOT,
      editorAvailable: vscode.window.activeTextEditor !== undefined,
      expandThinking: vscode.workspace
        .getConfiguration("agenticenvChat")
        .get<boolean>("thread.expandThinking", false),
    });
  }

  private async openFile(agentPath: string, line?: number): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const uri =
      toHostUri(agentPath) ?? (folder ? vscode.Uri.joinPath(folder.uri, agentPath) : null);
    if (!uri) {
      log.debug("openFile: path not translatable, ignored:", agentPath);
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      if (line && line > 0) {
        const pos = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    } catch (err) {
      log.debug("openFile failed:", err);
    }
  }

  private async insertAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.postToWebview({ type: "hostError", text: "No active editor to insert into." });
      return;
    }
    await editor.edit((b) => {
      for (const sel of editor.selections) {
        b.replace(sel, text);
      }
    });
  }

  private async createUntitled(name: string, content: string): Promise<void> {
    const ext = name.includes(".") ? name.split(".").pop() : undefined;
    const langByExt: Record<string, string> = {
      cpp: "cpp", c: "c", h: "cpp", hpp: "cpp", ts: "typescript", js: "javascript",
      py: "python", json: "json", yaml: "yaml", yml: "yaml", sh: "shellscript",
      sql: "sql", md: "markdown", cmake: "cmake",
    };
    const doc = await vscode.workspace.openTextDocument({
      content,
      language: ext ? langByExt[ext] : undefined,
    });
    await vscode.window.showTextDocument(doc);
  }

  private async runInTerminal(command: string): Promise<void> {
    // C07 remplacera cette confirmation par la politique d'allowlist.
    const ok = await vscode.window.showWarningMessage(
      `Run this command in a terminal?\n\n${command}`,
      { modal: true },
      "Run",
    );
    if (ok !== "Run") {
      return;
    }
    const term =
      vscode.window.terminals.find((t) => t.name === "AgenticEnv Chat") ??
      vscode.window.createTerminal("AgenticEnv Chat");
    term.show();
    term.sendText(command, false);
  }

  private async openDiff(agentPath: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      log.debug("openDiff: no folder open");
      return;
    }
    const uri = toHostUri(agentPath) ?? vscode.Uri.joinPath(folder.uri, agentPath);
    try {
      await vscode.commands.executeCommand("git.openChange", uri);
    } catch (err) {
      log.debug("git.openChange unavailable, opening file directly:", err);
      await vscode.window.showTextDocument(uri);
    }
  }

  // --- plumbing ---------------------------------------------------

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
