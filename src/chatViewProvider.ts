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
  type SessionMode,
  type WebviewToHost,
} from "./messages";
import { isV1HandshakeRejection } from "./negotiation";
import { DEFAULT_SANDBOX_ROOT, resetMapping, setMapping, toHostUri } from "./paths";
import { appendFeedback } from "./sessions/feedback";
import { ConversationStore, STORE_VERSION, type StoredConversation } from "./sessions/store";
import { toJson, toMarkdown } from "./sessions/export";
import { InstructionLoader } from "./instructions/loader";
import { assembleInstructions } from "./instructions/assemble";
import { substitute } from "./instructions/prompts";
import { Hooks } from "./instructions/hooks";
import { StatusBar } from "./statusBar";
import { CLIENT_ID, CLIENT_PROTOCOL, type Outbound } from "./protocol";
import { destructiveMatches, evaluate } from "./permissions/policy";
import { PermissionStore } from "./permissions/store";
import {
  allowPatternFor,
  synthesizePending,
  toEvalAction,
  type LastAction,
} from "./permissions/synthesize";
import { CheckpointStore } from "./edits/checkpoints";
import { TurnDecorations } from "./edits/decorations";
import { CheckpointContentProvider, SCHEME, openCheckpointDiff } from "./edits/openDiff";
import { revertHunk } from "./edits/hunkRevert";
import { resolveRefs } from "./context";
import { activeFileRef, searchFiles, selectionRef } from "./context/files";
import { searchSymbols } from "./context/symbols";
import { shellIntegrationAvailable } from "./context/terminal";
import { starterPrompts } from "./context/starters";
import type { ContextRef, ContextRefKind } from "./messages";

const VIEW_ID = "agenticenvChat.view";
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
  private lastTurnId: string | undefined;
  private llmSource: string | undefined;
  private lastSeq = 0;
  private readonly checkpoints = new CheckpointStore();
  private readonly turnDecorations = new TurnDecorations();
  private readonly diffProvider = new CheckpointContentProvider();
  private readonly permissions: PermissionStore;
  private lastAction: LastAction | null = null;
  private pendingActionSeq = 0;
  private conversations: ConversationStore | undefined;
  private snapshot: Omit<StoredConversation, "version" | "createdAt" | "workspacePath"> | undefined;
  private turnStartMs = 0;
  private readonly instructions = new InstructionLoader(() => {
    void this.sendCommandsAndModes();
    this.postToWebview({ type: "hostError", text: "Instruction files changed — applied on the next turn." });
  });
  private hooks: Hooks | undefined;
  private filesChangedThisTurn = false;
  /** Capabilities annoncées par le bridge dans `welcome` (C09 : `interrupt`). */
  private capabilities: string[] = [];
  /** Mode de session (C12 §3) : `ask`/`plan` forcent `readOnly` en attendant un vrai mode sandbox. */
  private sessionMode: SessionMode = "agent";
  /** Consignes mid-turn en file quand le bridge n'a pas la capability `interrupt`. */
  private queuedInterrupts: string[] = [];
  /** Capture du texte final d'un tour lancé par un point d'accroche éditeur (C11 §3/§4). */
  private capture: { buf: string; resolve: (text: string | null) => void } | undefined;
  private readonly statusBar = new StatusBar();
  private status = {
    session: false,
    phase: "idle" as "idle" | "running" | "awaiting" | "other",
    model: "local",
    contextPct: null as number | null,
    cost: 0,
    turnStartMs: 0,
    mode: "ask",
  };

  private pushStatus(patch: Partial<typeof this.status>): void {
    this.status = { ...this.status, ...patch };
    this.statusBar.update(this.status);
  }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.permissions = new PermissionStore(context);
    this.hooks = new Hooks(this.permissions, (r) =>
      this.postToWebview({ type: "hookResult", command: r.command, ok: r.ok, output: r.output }),
    );
    if (context.storageUri) {
      this.conversations = new ConversationStore(context.storageUri.fsPath);
      void this.conversations.purge().then((r) => {
        if (r.purged.length) {
          log.info(`purged ${r.purged.length} old conversation(s) (retention 100 / 90 days)`);
        }
      });
    }
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(SCHEME, this.diffProvider),
      this.diffProvider,
      this.turnDecorations,
      vscode.window.onDidChangeVisibleTextEditors(() => this.turnDecorations.refresh()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.sendPermissionMode()),
      this.statusBar,
    );
  }

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

    this.instructions.watch(this.context);

    const editorSub = vscode.window.onDidChangeActiveTextEditor(() => {
      this.sendWorkspace();
      this.sendAutoContext();
    });
    const selSub = vscode.window.onDidChangeTextEditorSelection(() => this.sendAutoContext());
    const wsSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.sendWorkspace();
      void this.sendStarters();
    });

    view.onDidChangeVisibility(() => this.updateHealthPolling(view.visible));
    this.updateHealthPolling(view.visible);

    view.onDidDispose(() => {
      cfgSub.dispose();
      editorSub.dispose();
      selSub.dispose();
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
    this.lastTurnId = undefined;
    this.turnDecorations.clear();
    this.llmSource = undefined;
    this.lastSeq = 0;
    void this.context.workspaceState.update(K_CONVERSATION, undefined);
    void this.context.workspaceState.update(K_LAST_SEQ, undefined);
    this.setContextKey("turnRunning", false);
    this.setContextKey("awaitingConfirmation", false);
    this.setContextKey("hasCheckpoint", false);
    this.finishCapture(true);
    this.postToWebview({ type: "reset" });
  }

  reconnect(): void {
    this.bridge?.reconnect();
  }

  /** Commande `agenticenvChat.stop` (raccourci Esc, C11 §5). */
  stopTurn(): void {
    if (this.currentTurnId) {
      this.sendOrNotify({ type: "cancel_turn", turn_id: this.currentTurnId }, "stop the turn");
    }
  }

  /** Commande `agenticenvChat.history`. */
  history(): void {
    void this.openHistory();
  }

  /** Commande `agenticenvChat.remember`. */
  remember(): void {
    void vscode.window.showInputBox({ prompt: "Note to add to AGENTS.md (agent memory)" }).then((text) => {
      if (text) {
        void this.instructions.remember(text).then((r) =>
          this.postToWebview({ type: "hostError", text: r.message }),
        );
      }
    });
  }

  /** Commande `agenticenvChat.exportConversation`. */
  export(): void {
    void vscode.window
      .showQuickPick(["markdown", "json"], { placeHolder: "Export format" })
      .then((f) => {
        if (f) {
          void this.exportConversation(f as "markdown" | "json");
        }
      });
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
    // `list_mcp_servers` est valide en v1 comme en v2 : toujours envoyé, pour que
    // l'écran de sélection ait sa liste même si la reprise échoue.
    this.bridge?.enqueue({ type: "list_mcp_servers" });
    if (this.conversationId) {
      // [v2] Resynchronisation après coupure : le bridge rejoue seq > last_seq
      // (C01 §6). Rejeté par un bridge v1 → `fallbackToV1` efface la session.
      this.bridge?.enqueue({
        type: "resume",
        conversation_id: this.conversationId,
        last_seq: this.lastSeq,
      });
    }
    // `list_models` est un message v2 : il n'est émis qu'après un `welcome` qui
    // annonce la capability `models` (sinon un bridge v1 le rejette — C12).
    this.negotiationTimer = setTimeout(() => this.onNegotiationTimeout(), NEGOTIATION_MS);
  }

  private onNegotiationTimeout(): void {
    if (this.negotiated) {
      this.negotiationTimer = undefined;
      return;
    }
    this.fallbackToV1("bridge did not answer `hello`");
  }

  /**
   * Bascule en mode v1 dégradé (03-PROTOCOL §2.1) : soit le `welcome` n'est
   * jamais arrivé, soit le bridge v1 a rejeté nos messages v2 par un
   * `VALIDATION_ERROR`. Dans les deux cas on n'émet plus rien de v2 et on ne
   * transforme pas ça en notice d'erreur visible.
   */
  private fallbackToV1(reason: string): void {
    this.clearNegotiationTimer();
    if (this.negotiated) {
      return;
    }
    this.negotiated = true;
    this.capabilities = [];
    log.warn(`${reason} — falling back to protocol v1 (degraded)`);
    this.postToWebview({ type: "protocol", version: 1, capabilities: [], degraded: true });
    // Un bridge v1 n'a pas de `resume` : une conversation persistée ne peut pas
    // reprendre. On efface la session périmée et on ramène la webview à l'écran
    // de sélection — sinon elle affiche un composer qui écrit dans le vide.
    if (this.conversationId) {
      this.conversationId = undefined;
      this.lastSeq = 0;
      void this.context.workspaceState.update(K_CONVERSATION, undefined);
      void this.context.workspaceState.update(K_LAST_SEQ, undefined);
      this.postToWebview({ type: "reset" });
    }
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
        this.capabilities = message.capabilities;
        this.postToWebview({
          type: "protocol",
          version: message.protocol,
          capabilities: message.capabilities,
          degraded: message.protocol < 2,
        });
        // Messages v2 gatés sur capability, émis seulement une fois `welcome` reçu.
        if (message.capabilities.includes("models")) {
          this.bridge?.enqueue({ type: "list_models" });
        }
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

      case "models": {
        const models = message.models.map((m) => ({
          id: m.id,
          label: m.label,
          contextWindow: m.context_window,
          current: m.current,
          state: m.state,
          error: m.error,
        }));
        this.postToWebview({ type: "models", models });
        const current = models.find((m) => m.current);
        if (current) {
          this.pushStatus({ model: current.label });
          if (current.contextWindow > 0) {
            this.postToWebview({ type: "metrics", contextWindow: current.contextWindow });
          }
        }
        return;
      }

      case "session_started":
        this.conversationId = message.conversation_id;
        this.llmSource = message.llm_source;
        this.pushStatus({ session: true, phase: "idle", model: message.llm_source });
        this.postToWebview({ type: "metrics", contextWindow: this.defaultContextWindow() });
        this.permissions.resetSession();
        void this.context.workspaceState.update(K_CONVERSATION, this.conversationId);
        this.sendPermissionMode();
        this.postToWebview({ type: "bridge", message });
        return;

      case "event": {
        const ev = message.event;
        if (ev.kind === "ActionEvent") {
          this.lastAction = {
            toolName: ev.tool_name ?? "tool",
            args: (ev.action as Record<string, unknown>) ?? {},
          };
        }
        if (this.capture && ev.kind === "MessageEvent" && ev.llm_message?.role === "assistant") {
          for (const part of ev.llm_message.content ?? []) {
            if (typeof part.text === "string") {
              this.capture.buf += part.text;
            }
          }
        }
        this.postToWebview({ type: "bridge", message });
        return;
      }

      case "awaiting_confirmation":
        void this.handlePendingAction(null);
        return;

      case "pending_action":
        void this.handlePendingAction(message);
        return;

      case "turn_started":
        this.currentTurnId = message.turn_id;
        this.lastTurnId = message.turn_id;
        this.turnStartMs = Date.now();
        this.filesChangedThisTurn = false;
        void this.hooks?.run("onTurnStarted", { filesChanged: false, cwd: this.projectPath() });
        this.pushStatus({ phase: "running", turnStartMs: this.turnStartMs });
        this.setContextKey("turnRunning", true);
        this.setBadge("running");
        this.autoOpened.clear();
        this.turnDecorations.clear();
        void this.checkpoints.beginTurn(message.turn_id);
        this.postToWebview({ type: "bridge", message });
        return;

      case "turn_finished":
        if (this.currentTurnId === message.turn_id) {
          this.currentTurnId = undefined;
        }
        void this.checkpoints.finishTurn(message.turn_id).then(() => this.sendWorkingSet());
        void this.hooks?.run("onTurnFinished", {
          filesChanged: this.filesChangedThisTurn,
          cwd: this.projectPath(),
        });
        this.setBadge("idle");
        this.pushStatus({ phase: "idle" });
        this.setContextKey("turnRunning", false);
        this.setContextKey("awaitingConfirmation", false);
        this.setContextKey("hasCheckpoint", true);
        this.maybeNotify("turn-done");
        void this.persistConversation();
        this.postToWebview({ type: "bridge", message });
        this.flushQueuedInterrupts();
        this.finishCapture(message.reason === "error");
        return;

      case "files_changed":
        this.lastChangedPath = message.changes[message.changes.length - 1]?.path;
        this.filesChangedThisTurn = true;
        void this.hooks?.run("onFilesChanged", { filesChanged: true, cwd: this.projectPath() });
        void this.sendWorkingSet();
        void this.maybeAutoOpen(message.changes.map((c) => c.path));
        this.postToWebview({ type: "bridge", message });
        return;

      case "usage": {
        const secs = (Date.now() - this.turnStartMs) / 1000;
        const tps = secs > 1 && message.completion_tokens > 0 ? message.completion_tokens / secs : null;
        const window = message.context_window || this.defaultContextWindow();
        this.pushStatus({
          cost: message.accumulated_cost,
          contextPct: window > 0 ? (message.prompt_tokens / window) * 100 : null,
        });
        this.postToWebview({ type: "metrics", contextWindow: window, tokensPerSec: tps });
        this.postToWebview({ type: "bridge", message });
        return;
      }

      case "context_stats":
        this.pushStatus({
          contextPct:
            message.context_window > 0 ? (message.prompt_tokens / message.context_window) * 100 : null,
        });
        this.postToWebview({ type: "bridge", message });
        return;

      case "todo":
        // État complet produit par l'agent (C09 §2) — traduit wire → vue (formes
        // identiques). Le client n'en fabrique aucune étape.
        this.postToWebview({ type: "todo", items: message.items });
        return;

      case "error":
        // Un bridge v1 rejette chacun de nos messages v2 (`hello`, `resume`, …)
        // par un `VALIDATION_ERROR` `union_tag_invalid`. C'est toujours un
        // décalage de version de protocole, jamais une erreur sur laquelle
        // l'utilisateur peut agir : on l'avale (et on bascule en dégradé si ce
        // n'est pas déjà fait) plutôt que d'empiler des notices.
        if (isV1HandshakeRejection(message)) {
          if (!this.negotiated) {
            this.fallbackToV1("bridge rejected the v2 handshake");
          } else {
            log.debug("bridge rejected a v2 message (protocol mismatch), ignored:", message.code);
          }
          return;
        }
        if (message.code === "UNKNOWN_CONVERSATION") {
          this.conversationId = undefined;
          void this.context.workspaceState.update(K_CONVERSATION, undefined);
          this.postToWebview({ type: "reset" });
          return;
        }
        this.postToWebview({ type: "bridge", message });
        return;

      default:
        this.postToWebview({ type: "bridge", message });
    }
  }

  // --- instructions / prompts / modes (C10) --------------------

  private async sendCommandsAndModes(): Promise<void> {
    const [prompts, modes] = await Promise.all([
      this.instructions.loadPrompts(),
      this.instructions.loadModes(),
    ]);
    this.postToWebview({
      type: "commands",
      commands: prompts.map((p) => ({
        name: p.name,
        description: p.description,
        source: "prompt" as const,
        argsHint: p.argsHint,
      })),
    });
    this.postToWebview({
      type: "modes",
      modes: modes.map((m) => ({ name: m.name, permissions: m.permissions, mcp: m.mcp, model: m.model })),
    });
  }

  private modeInstructions: string | null = null;
  /** Restriction du `.mode.md` courant, réappliquée quand le mode plan bascule. */
  private modePermissions: string | undefined;

  /** Applique un `.mode.md` : restreint les permissions, retourne sa liste MCP si définie. */
  private async applyMode(name: string | undefined): Promise<string[] | null> {
    this.modeInstructions = null;
    if (!name) {
      this.modePermissions = undefined;
      this.applyPermissionOverride();
      return null;
    }
    const mode = (await this.instructions.loadModes()).find((m) => m.name === name);
    if (!mode) {
      return null;
    }
    this.modePermissions = mode.permissions;
    this.modeInstructions = mode.instructions || null;
    this.applyPermissionOverride();
    return mode.mcp.length ? mode.mcp : null;
  }

  /**
   * L'override de permissions effectif = le plus strict de (`.mode.md`, mode de
   * session). `ask` et `plan` (C12 §3 / C09 §3) forcent `readOnly` : protection
   * réelle en attendant un mode lecture seule côté sandbox — un préfixe de
   * prompt ne garantit rien face à un modèle local.
   */
  private applyPermissionOverride(): void {
    const modeReadOnly = this.sessionMode === "ask" || this.sessionMode === "plan";
    this.permissions.setModeOverride(modeReadOnly ? "readOnly" : this.modePermissions);
    this.sendPermissionMode();
  }

  private setSessionMode(mode: SessionMode): void {
    this.sessionMode = mode;
    this.applyPermissionOverride();
    this.postToWebview({
      type: "sessionMode",
      mode,
      interruptCapable: this.capabilities.includes("interrupt"),
    });
  }

  private onInterrupt(text: string): void {
    const t = text.trim();
    if (!t) {
      return;
    }
    if (this.currentTurnId && this.capabilities.includes("interrupt")) {
      this.sendOrNotify(
        { type: "interrupt", turn_id: this.currentTurnId, text: t },
        "add a note to the turn",
      );
      return;
    }
    // Pas de capability `interrupt` : la consigne part comme `user_message` au
    // prochain `turn_finished` (C09 §4). Jamais silencieusement retardée — la
    // webview l'affiche « en attente ».
    this.queuedInterrupts.push(t);
  }

  private flushQueuedInterrupts(): void {
    if (this.queuedInterrupts.length === 0) {
      return;
    }
    const text = this.queuedInterrupts.join("\n\n");
    this.queuedInterrupts = [];
    this.sendOrNotify({ type: "user_message", text }, "send the queued note");
  }

  /** Résout une `/`-commande de prompt (C10 §3) : substitution + préremplissage. */
  private async resolvePromptCommand(name: string, args: string): Promise<boolean> {
    const prompt = (await this.instructions.loadPrompts()).find((p) => p.name === name);
    if (!prompt) {
      return false;
    }
    const editor = vscode.window.activeTextEditor;
    const folder = vscode.workspace.workspaceFolders?.[0];
    const { text, missing } = substitute(prompt.body, {
      arg: args,
      selection: editor?.document.getText(editor.selection) ?? "",
      file: editor ? vscode.workspace.asRelativePath(editor.document.uri) : "",
      workspaceFolder: folder?.name ?? "",
    });
    if (missing.length) {
      this.postToWebview({
        type: "hostError",
        text: `/${name}: missing ${missing.join(", ")}${prompt.argsHint ? ` (expects ${prompt.argsHint})` : ""}`,
      });
      return true;
    }
    this.postToWebview({ type: "commandResult", command: name, prefill: text });
    return true;
  }

  private async buildInstructionsContext(): Promise<
    { block: string; applied: string[]; ignored: { rel: string; reason: string }[]; truncated: boolean } | null
  > {
    const [roots, scoped] = await Promise.all([
      this.instructions.loadRoots(),
      this.instructions.loadScoped(),
    ]);
    if (roots.length === 0 && scoped.length === 0) {
      return null;
    }
    const attached = vscode.window.activeTextEditor
      ? [vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri)]
      : [];
    const r = assembleInstructions(roots, scoped, this.modeInstructions, attached);
    return { block: r.text, applied: r.applied, ignored: r.ignored, truncated: r.truncated };
  }

  // --- sessions / history (C08) ---------------------------------

  private async persistConversation(): Promise<void> {
    if (!this.conversations || !this.snapshot || !this.conversationId) {
      return;
    }
    const existing = await this.conversations.load(this.conversationId);
    const conv: StoredConversation = {
      version: STORE_VERSION,
      createdAt: existing?.createdAt ?? Date.now(),
      workspacePath: this.projectPath(),
      ...this.snapshot,
      id: this.conversationId,
      title: existing?.titleManual ? existing.title : this.snapshot.title,
      titleManual: existing?.titleManual,
    };
    await this.conversations.save(conv).catch((err) => log.warn("persistConversation failed:", err));
  }

  private async openHistory(): Promise<void> {
    if (!this.conversations) {
      return;
    }
    const query = await vscode.window.showInputBox({
      prompt: "Search conversations (title + messages) — leave empty to list all",
    });
    if (query === undefined) {
      return;
    }
    const entries = await this.conversations.search(this.projectPath(), query);
    if (entries.length === 0) {
      void vscode.window.showInformationMessage("No matching conversations in this folder.");
      return;
    }
    const pick = await vscode.window.showQuickPick(
      entries.map((e) => ({
        label: e.title ?? "(untitled)",
        description: `${new Date(e.updatedAt).toLocaleString()} · ${e.turns} turns · $${e.cost.toFixed(3)}`,
        detail: e.version !== STORE_VERSION ? "⚠ saved by a different version — cannot open" : undefined,
        entry: e,
      })),
      { placeHolder: "Open a past conversation (read-only)" },
    );
    if (pick && pick.entry.version === STORE_VERSION) {
      await this.restoreConversation(pick.entry.id);
    }
  }

  private async restoreConversation(id: string): Promise<void> {
    const conv = await this.conversations?.load(id);
    if (!conv) {
      return;
    }
    this.postToWebview({ type: "reset" });
    for (const item of conv.items) {
      this.postToWebview({ type: "bridge", message: { type: "event", event: reconstructEvent(item) } });
    }
    this.postToWebview({
      type: "hostError",
      text: "Opened a past conversation (read-only). \"Resume\" needs a bridge that can reattach; otherwise start a new session.",
    });
  }

  private async exportConversation(format: "markdown" | "json"): Promise<void> {
    if (!this.snapshot) {
      return;
    }
    const conv: StoredConversation = {
      version: STORE_VERSION,
      createdAt: Date.now(),
      workspacePath: this.projectPath(),
      ...this.snapshot,
    };
    const body = format === "json" ? toJson(conv) : toMarkdown(conv, DEFAULT_SANDBOX_ROOT);
    const doc = await vscode.workspace.openTextDocument({
      content: body,
      language: format === "json" ? "json" : "markdown",
    });
    await vscode.window.showTextDocument(doc);
  }

  private maybeNotify(reason: "turn-done" | "awaiting"): void {
    const mode = vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<"never" | "awaiting" | "always">("notifications", "awaiting");
    if (mode === "never") {
      return;
    }
    const visible = this.view?.visible ?? false;
    if (reason === "awaiting") {
      if (!visible || mode === "always") {
        void vscode.window
          .showWarningMessage("The agent is waiting for your approval.", "Show")
          .then((a) => a === "Show" && vscode.commands.executeCommand(`${VIEW_ID}.focus`));
      }
      return;
    }
    const longEnough = Date.now() - this.turnStartMs > 30_000;
    if ((!visible && longEnough) || mode === "always") {
      void vscode.window
        .showInformationMessage("The agent finished a turn.", "Show")
        .then((a) => a === "Show" && vscode.commands.executeCommand(`${VIEW_ID}.focus`));
    }
  }

  // --- permissions (C07) -------------------------------------------

  private sendPermissionMode(): void {
    const pol = this.permissions.effective();
    this.postToWebview({
      type: "permissionMode",
      mode: pol.mode,
      trusted: vscode.workspace.isTrusted,
    });
    this.pushStatus({ mode: pol.mode });
  }

  private async handlePendingAction(
    bridgeMsg: Extract<Outbound, { type: "pending_action" }> | null,
  ): Promise<void> {
    const actionId = bridgeMsg?.action_id ?? `pa-${this.pendingActionSeq++}`;
    const pending = bridgeMsg
      ? {
          actionId,
          kind: bridgeMsg.kind,
          summary: bridgeMsg.summary,
          command: bridgeMsg.command,
          path: bridgeMsg.path,
          diff: bridgeMsg.diff,
          warnings: bridgeMsg.command ? destructiveMatches(bridgeMsg.command) : [],
          blind: false,
        }
      : synthesizePending(this.lastAction, actionId);

    const policy = this.permissions.effective();
    const { decision, invalidRules } = evaluate(
      toEvalAction(pending),
      policy,
      (p) => this.permissions.isSensitivePath(p),
    );
    for (const bad of invalidRules) {
      this.postToWebview({ type: "hostError", text: `Ignored invalid permission regex: ${bad}` });
    }

    if (decision.verdict === "allow") {
      this.permissions.logDecision(pending.summary, decision.rule, "allow");
      this.postToWebview({ type: "permissionOutcome", verdict: "allowed", rule: decision.rule, summary: pending.summary });
      this.postToWebview({ type: "pendingAction", action: null });
      this.bridge?.send({ type: "confirm_action", accept: true, action_id: actionId });
      return;
    }
    if (decision.verdict === "deny") {
      this.permissions.logDecision(pending.summary, decision.rule, "deny");
      this.postToWebview({ type: "permissionOutcome", verdict: "denied", rule: decision.rule, summary: pending.summary });
      this.postToWebview({ type: "pendingAction", action: null });
      this.bridge?.send({ type: "confirm_action", accept: false, action_id: actionId });
      return;
    }
    // ask
    this.postToWebview({ type: "pendingAction", action: pending });
    this.setBadge("awaiting");
    this.pushStatus({ phase: "awaiting" });
    this.setContextKey("awaitingConfirmation", true);
    this.maybeNotify("awaiting");
  }

  /** Clé de contexte VS Code (C11 §5) : miroir de la machine à états, pas dupliquée. */
  private setContextKey(key: "turnRunning" | "awaitingConfirmation" | "hasCheckpoint", value: boolean): void {
    void vscode.commands.executeCommand("setContext", `agenticenvChat.${key}`, value);
  }

  private finishCapture(errored: boolean): void {
    if (!this.capture) {
      return;
    }
    const { buf, resolve } = this.capture;
    this.capture = undefined;
    resolve(errored ? null : buf.trim() || null);
  }

  /**
   * Lance un tour depuis un point d'accroche éditeur (C11 §3/§4) et **capture**
   * son texte final. Le tour est visible dans le panneau comme n'importe quel
   * autre (progression, annulation) ; on ne masque rien.
   */
  async runCapturedTurn(text: string): Promise<string | null> {
    if (!this.conversationId) {
      void vscode.window.showWarningMessage("Start an AgenticEnv session first.");
      return null;
    }
    if (this.currentTurnId || this.capture) {
      void vscode.window.showWarningMessage("A turn is already running — wait for it to finish.");
      return null;
    }
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finishCapture(true), 15 * 60_000);
      this.capture = {
        buf: "",
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
      };
      void this.sendUserMessage(text, []);
    });
  }

  /** Ouvre le panneau avec un message prérempli (C11 §2) ; n'envoie pas le tour. */
  async openWithMessage(text: string, autoSend: boolean): Promise<void> {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    if (autoSend && this.conversationId && !this.currentTurnId) {
      void this.sendUserMessage(text, []);
    } else {
      this.postToWebview({ type: "commandResult", command: "editor", prefill: text });
    }
  }

  private defaultContextWindow(): number {
    return vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<number>("defaultContextWindow", 32768);
  }

  /** Badge sur l'icône de l'activity bar (items 105) : activité / alerte. */
  private setBadge(phase: "running" | "awaiting" | "idle"): void {
    if (!this.view) {
      return;
    }
    this.view.badge =
      phase === "awaiting"
        ? { value: 1, tooltip: "AgenticEnv: approval needed" }
        : phase === "running"
          ? { value: 0, tooltip: "AgenticEnv: the agent is working" }
          : undefined;
  }

  private onConfirm(msg: Extract<WebviewToHost, { type: "confirm" }>): void {
    if (msg.accept && msg.remember && this.lastAction) {
      const pattern = allowPatternFor(synthesizePending(this.lastAction, msg.actionId ?? ""));
      if (pattern) {
        this.permissions.addAllow(pattern, msg.remember);
        this.sendPermissionMode();
      }
    }
    this.sendOrNotify(
      {
        type: "confirm_action",
        accept: msg.accept,
        action_id: msg.actionId,
        remember: msg.remember,
        edited_command: msg.editedCommand,
      },
      "answer",
    );
    this.postToWebview({ type: "pendingAction", action: null });
    this.setContextKey("awaitingConfirmation", false);
  }

  // --- webview -> hôte ------------------------------------------------

  private onWebviewMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready":
        log.debug("webview ready, stateVersion", msg.stateVersion);
        this.sendWorkspace();
        this.sendAutoContext();
        this.sendPermissionMode();
        void this.sendStarters();
        void this.sendCommandsAndModes();
        this.bridge?.enqueue({ type: "list_mcp_servers" });
        // Jauge de contexte utile avant même le premier tour (C13 §1).
        this.postToWebview({ type: "metrics", contextWindow: this.defaultContextWindow() });
        break;
      case "compact":
        // v2 : demande au bridge de compacter l'historique. Gaté sur la capability
        // `compact` côté webview ; ici on relaie tel quel (no-op si bridge v1).
        this.sendOrNotify({ type: "compact" }, "compact the history");
        break;
      case "remember":
        void this.instructions.remember(msg.text).then((r) =>
          this.postToWebview({ type: "hostError", text: r.message }),
        );
        break;
      case "startSession": {
        if (!vscode.workspace.isTrusted) {
          this.postToWebview({
            type: "hostError",
            text: "This folder is not trusted — the session is read-only and cannot start. Use \"Trust folder\" to enable it.",
          });
          this.postToWebview({ type: "reset" });
          return;
        }
        const projectPath = this.projectPath();
        setMapping({
          sandboxRoot: DEFAULT_SANDBOX_ROOT,
          hostRoot: projectPath ? vscode.Uri.file(projectPath) : null,
        });
        this.checkpoints.setRoot(projectPath);
        void this.applyMode(msg.mode).then((mcp) => {
          this.sendOrNotify(
            { type: "start_session", mcp_servers: mcp ?? msg.mcpServers, project_path: projectPath },
            "start a session",
          );
        });
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
      case "resolveCommand":
        void this.runCommand(msg.command, msg.args);
        break;
      case "dismissAuto":
        // mémorisé côté webview ; l'hôte n'a rien à faire de plus ici.
        log.trace("auto-context dismissed:", msg.refKey);
        break;
      case "cancelTurn":
        if (this.currentTurnId) {
          this.sendOrNotify({ type: "cancel_turn", turn_id: this.currentTurnId }, "stop the turn");
        } else {
          log.debug("cancelTurn with no active turn id");
        }
        break;
      case "interrupt":
        this.onInterrupt(msg.text);
        break;
      case "setSessionMode":
        this.setSessionMode(msg.mode);
        break;
      case "setModel":
        if (this.currentTurnId) {
          this.postToWebview({
            type: "hostError",
            text: "Can't switch model while a turn is running — stop it first.",
          });
        } else {
          this.sendOrNotify({ type: "set_model", model_id: msg.modelId }, "switch the model");
        }
        break;
      case "continueTurn":
        // C09 §5 : continuation après cap d'itérations — ne reformule jamais la
        // demande initiale.
        this.sendOrNotify(
          { type: "user_message", text: msg.guidance?.trim() || "Continue." },
          "continue the turn",
        );
        break;
      case "reconnect":
        this.bridge?.reconnect();
        break;
      case "openSettings":
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "agenticenvChat",
        );
        break;
      case "forceNewSession":
        // Pas de message bridge pour relancer la sandbox : on repart d'une
        // nouvelle conversation et on reconnecte le socket.
        this.newSession();
        this.bridge?.reconnect();
        break;
      case "confirm":
        this.onConfirm(msg);
        break;
      case "openDiff":
        void this.openDiff(msg.path);
        break;
      case "requestFileDiff":
        void this.sendFileDiff(msg.path);
        break;
      case "openFileDiff":
        void this.openTurnFileDiff(msg.path);
        break;
      case "revertFile":
        void this.revertFile(msg.path);
        break;
      case "revertHunk":
        void this.revertHunk(msg.path, msg.hunkHeader);
        break;
      case "undoTurn":
        void this.undoTurn();
        break;
      case "editMessage":
      case "regenerate":
        // La webview a déjà tronqué son fil ; on renvoie le message au bridge.
        this.sendOrNotify({ type: "user_message", text: msg.text }, "resend the message");
        void this.persistConversation();
        break;
      case "truncateFrom":
        void this.persistConversation();
        break;
      case "openHistory":
        void this.openHistory();
        break;
      case "exportConversation":
        void this.exportConversation(msg.format);
        break;
      case "persistSnapshot":
        this.snapshot = {
          id: this.conversationId ?? "unsaved",
          title: msg.title,
          updatedAt: Date.now(),
          model: this.llmSource ?? null,
          items: msg.items as Record<string, unknown>[],
          branches: msg.branches as { at: number; removed: Record<string, unknown>[] }[],
          usage: { cost: msg.cost, promptTokens: msg.promptTokens, completionTokens: msg.completionTokens },
          mcpServers: [],
        };
        void this.persistConversation();
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
    let context: { kind: string; label: string; body: string; truncated: boolean }[] = [];
    try {
      context = await resolveRefs(refs);
    } catch (err) {
      log.warn("context resolution failed, sending without context:", err);
    }
    // Instructions du dépôt (C10 §7) : en **tête** du contexte, kind "instructions",
    // jamais concaténées dans `text`. Elles ne sont pas tronquées avant le reste.
    try {
      const instr = await this.buildInstructionsContext();
      if (instr) {
        context.unshift({
          kind: "instructions",
          label: `instructions (${instr.applied.join(", ")})`,
          body: instr.block,
          truncated: instr.truncated,
        });
        this.postToWebview({
          type: "instructionsInfo",
          applied: instr.applied,
          ignored: instr.ignored,
          truncated: instr.truncated,
        });
        for (const ig of instr.ignored) {
          this.postToWebview({ type: "hostError", text: `Instruction file ignored — ${ig.rel}: ${ig.reason}` });
        }
      }
    } catch (err) {
      log.debug("instructions assembly failed:", err);
    }
    this.sendOrNotify(
      { type: "user_message", text, ...(context.length ? { context } : {}) },
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

  private sendAutoContext(): void {
    const chips = [activeFileRef(), selectionRef()].filter((c): c is NonNullable<typeof c> => c !== null);
    this.postToWebview({ type: "autoContext", chips });
  }

  private async sendStarters(): Promise<void> {
    try {
      this.postToWebview({ type: "starters", prompts: await starterPrompts() });
    } catch (err) {
      log.debug("starters failed:", err);
    }
  }

  private async runCommand(command: string, args: string): Promise<void> {
    switch (command) {
      case "new":
        this.newSession();
        return;
      case "clear":
        this.postToWebview({ type: "clearThread" });
        return;
      case "stop":
        if (this.currentTurnId) {
          this.sendOrNotify({ type: "cancel_turn", turn_id: this.currentTurnId }, "stop the turn");
        }
        return;
      case "help":
        this.postToWebview({
          type: "commandResult",
          command,
          note: "Enter sends · Shift+Enter newline · # references · / commands · ↑ recalls previous prompts",
        });
        return;
      default:
        if (await this.resolvePromptCommand(command, args)) {
          return;
        }
        // Prompt MCP (C12) : non branché ici, on préremplit le nom pour ne rien perdre.
        this.postToWebview({
          type: "commandResult",
          command,
          prefill: args ? `/${command} ${args}` : `/${command}`,
        });
    }
  }

  private async runPickContext(kind: ContextRefKind | "menu"): Promise<void> {
    if (kind === "menu") {
      const picked = await vscode.window.showQuickPick(
        [
          { label: "$(file) File", ctxKind: "file" as const },
          { label: "$(selection) Selection", ctxKind: "selection" as const },
          { label: "$(symbol-method) Symbol", ctxKind: "symbol" as const },
          { label: "$(warning) Problems", ctxKind: "diagnostics" as const },
          { label: "$(terminal) Terminal", ctxKind: "terminal" as const },
          { label: "$(git-branch) Git", ctxKind: "git" as const },
        ],
        { placeHolder: "Add context…" },
      );
      if (picked) {
        await this.runPickContext(picked.ctxKind);
      }
      return;
    }
    if (kind === "file") {
      const query = await vscode.window.showInputBox({ prompt: "File (fuzzy)" });
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!query || !folder) {
        const active = activeFileRef();
        if (active) {
          this.postToWebview({ type: "attachContext", chip: active });
        }
        return;
      }
      const hits = await searchFiles(query, folder.uri).catch(() => []);
      const pick = await vscode.window.showQuickPick(
        hits.map((h) => ({ label: h.rel, uri: h.uri })),
        { placeHolder: "Attach file" },
      );
      if (pick) {
        this.postToWebview({
          type: "attachContext",
          chip: { ref: { kind: "file", uri: pick.uri }, label: pick.label, estBytes: 0 },
        });
      }
      return;
    }
    if (kind === "image") {
      this.postToWebview({ type: "hostError", text: "Image context needs a vision model (unavailable)." });
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
      bridgeLive: this.bridge?.state,
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
    // Le bouton Run passe par la MÊME politique que l'agent (C07 §6). Un
    // raccourci d'UI ne contourne pas l'allowlist.
    const { decision } = evaluate(
      { kind: "command", command },
      this.permissions.effective(),
      (p) => this.permissions.isSensitivePath(p),
    );
    if (decision.verdict === "deny") {
      this.postToWebview({ type: "hostError", text: `Blocked by rule ${decision.rule}: ${command}` });
      return;
    }
    if (decision.verdict === "ask") {
      const warn = destructiveMatches(command)
        .map((w) => `⛔ ${w.message}`)
        .join("\n");
      const ok = await vscode.window.showWarningMessage(
        `Run on YOUR machine (not the sandbox)?\n\n$ ${command}${warn ? `\n\n${warn}` : ""}`,
        { modal: true },
        "Run",
      );
      if (ok !== "Run") {
        return;
      }
    }
    const term =
      vscode.window.terminals.find((t) => t.name === "AgenticEnv Chat") ??
      vscode.window.createTerminal("AgenticEnv Chat");
    term.show();
    term.sendText(command, false);
  }

  // --- working set & checkpoints (C06) ---------------------------

  private turnForEdits(): string | undefined {
    return this.currentTurnId ?? this.lastTurnId;
  }

  private async sendWorkingSet(): Promise<void> {
    const turnId = this.turnForEdits();
    if (!turnId) {
      return;
    }
    const files = await this.checkpoints.changedFiles(turnId).catch(() => []);
    this.postToWebview({
      type: "workingSet",
      strategy: this.checkpoints.strategyLabel(),
      files: files.map((f) => ({
        path: f.path,
        status: f.status,
        added: f.added,
        removed: f.removed,
        inProgress: this.currentTurnId !== undefined && f.path === this.lastChangedPath,
      })),
    });
  }

  private lastChangedPath: string | undefined;

  private async sendFileDiff(relPath: string): Promise<void> {
    const turnId = this.turnForEdits();
    if (!turnId) {
      this.postToWebview({ type: "fileDiff", path: relPath, unified: "", conflict: false, error: "no active turn" });
      return;
    }
    const unified = (await this.checkpoints.diffFile(turnId, relPath).catch(() => null)) ?? "";
    const conflict = await this.checkpoints.hasConflict(turnId, relPath).catch(() => false);
    this.postToWebview({
      type: "fileDiff",
      path: relPath,
      unified,
      conflict,
      error: unified ? undefined : "diff unavailable (checkpoints need a git repo)",
    });
    if (unified && this.root()) {
      this.turnDecorations.setFromDiff(
        vscode.Uri.joinPath(vscode.Uri.file(this.root() as string), relPath).fsPath,
        unified,
      );
    }
  }

  private root(): string | null {
    return this.projectPath();
  }

  private async openTurnFileDiff(relPath: string): Promise<void> {
    const turnId = this.turnForEdits();
    const root = this.root();
    if (!turnId || !root) {
      return;
    }
    await openCheckpointDiff(this.diffProvider, this.checkpoints, turnId, root, relPath).catch((err) =>
      log.debug("openCheckpointDiff failed:", err),
    );
  }

  private async revertFile(relPath: string): Promise<void> {
    const turnId = this.turnForEdits();
    if (!turnId) {
      return;
    }
    const res = await this.checkpoints.restoreFile(turnId, relPath);
    if (res === "conflict") {
      this.postToWebview({
        type: "hostError",
        text: `${relPath} was changed after the turn — revert refused. Open the diff to resolve it.`,
      });
    } else if (res === "unavailable") {
      this.postToWebview({ type: "hostError", text: "Revert needs a git checkpoint (open the folder as a git repo)." });
    } else {
      void this.sendWorkingSet();
    }
  }

  private async revertHunk(relPath: string, hunkHeader: string): Promise<void> {
    const turnId = this.turnForEdits();
    const root = this.root();
    if (!turnId || !root) {
      return;
    }
    const unified = (await this.checkpoints.diffFile(turnId, relPath)) ?? "";
    const uri = vscode.Uri.joinPath(vscode.Uri.file(root), relPath);
    const res = await revertHunk(uri, unified, hunkHeader);
    if (res === "shifted") {
      this.postToWebview({
        type: "hostError",
        text: `${relPath} moved since the diff — hunk revert refused. Reload the diff and retry.`,
      });
    } else if (res === "ok") {
      void this.sendFileDiff(relPath);
      void this.sendWorkingSet();
    }
  }

  async undoTurn(): Promise<void> {
    const turnId = this.turnForEdits();
    if (!turnId) {
      this.postToWebview({ type: "hostError", text: "No turn to undo." });
      return;
    }
    const dry = await this.checkpoints.restoreTurn(turnId);
    if (dry.conflicts.length && dry.restored.length === 0) {
      const ok = await vscode.window.showWarningMessage(
        `${dry.conflicts.length} file(s) changed since the turn: ${dry.conflicts.join(", ")}. Restore anyway?`,
        { modal: true },
        "Restore anyway",
      );
      if (ok !== "Restore anyway") {
        return;
      }
      await this.checkpoints.restoreTurn(turnId, true);
    }
    this.turnDecorations.clear();
    void this.sendWorkingSet();
    void vscode.window.showInformationMessage("Restored to the checkpoint before this turn.");
  }

  async openTurnDiff(): Promise<void> {
    const turnId = this.turnForEdits();
    if (!turnId) {
      return;
    }
    for (const f of await this.checkpoints.changedFiles(turnId)) {
      await this.openTurnFileDiff(f.path);
    }
  }

  private autoOpened = new Set<string>();

  private async maybeAutoOpen(relPaths: string[]): Promise<void> {
    const mode = vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<"never" | "first" | "all">("edits.autoOpen", "never");
    const root = this.root();
    if (mode === "never" || !root) {
      return;
    }
    const fresh = relPaths.filter((p) => !this.autoOpened.has(p) && !/(^|\/)(\.git|conversations)\//.test(p));
    const pick = mode === "first" ? fresh.slice(0, this.autoOpened.size === 0 ? 1 : 0) : fresh.slice(0, 10);
    for (const p of pick) {
      this.autoOpened.add(p);
      await vscode.commands
        .executeCommand("vscode.open", vscode.Uri.joinPath(vscode.Uri.file(root), p), { preview: true })
        .then(undefined, (err) => log.debug("autoOpen failed:", err));
    }
    if (mode === "all" && fresh.length > 10) {
      this.postToWebview({ type: "hostError", text: `${fresh.length} files changed — opened the first 10.` });
    }
  }

  purgeCheckpoints(): void {
    // Le store purge déjà (20 / 7 j) ; ici on force un cycle et on informe.
    void vscode.window.showInformationMessage(
      `Checkpoints: ${this.checkpoints.turnIds().length} kept (auto-purged at 20 / 7 days).`,
    );
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

/** Rebuild un `SdkEvent` minimal depuis un `ChatItem` stocké (relecture d'archive). */
function reconstructEvent(item: Record<string, unknown>): Record<string, unknown> {
  const kind = item.kind;
  if (kind === "user" || kind === "assistant") {
    return {
      kind: "MessageEvent",
      llm_message: { role: kind, content: [{ text: String(item.text ?? "") }] },
    };
  }
  if (kind === "tool") {
    return {
      kind: "ActionEvent",
      tool_name: item.toolName,
      tool_call_id: item.toolCallId,
      action: item.args,
    };
  }
  if (kind === "error") {
    return { kind: "AgentErrorEvent", error: String(item.text ?? "") };
  }
  return { kind: "unknown" };
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
