// Contrat **interne** hôte ↔ webview (camelCase, postMessage). Séparé du fil
// bridge (src/protocol.ts) — il est libre d'évoluer sans changement côté
// AgenticEnv (03-PROTOCOL §3).
//
// Les deux routeurs (hôte et webview) traitent ces unions de façon exhaustive
// avec `assertNever` — un `type` ajouté sans être traité ne compile pas. Un test
// de discipline le vérifie (05-TESTING §5).

import type { Outbound } from "./protocol";

// --- santé des composants (sondée par l'hôte, pas par le bridge) ---

export type HealthStatus = "up" | "down" | "degraded" | "unknown";

export type ComponentId =
  | "bridge"
  | "llama-server"
  | "llama-bridge"
  | "docker"
  | "agent-server-image"
  | "gpu";

export type HealthActionId = "start" | "stop" | "restart" | "pull";

export interface ComponentHealth {
  id: ComponentId;
  label: string;
  status: HealthStatus;
  detail: string;
  /** action ids the client may trigger for this component */
  actions: HealthActionId[];
}

// --- vues légères poussées vers la webview ---

export interface McpServerView {
  name: string;
  transport: string;
  tools: string[];
}

/**
 * Référence de contexte — **légère, sérialisable, affichable en chip** (01-ARCH
 * §6). La webview manipule des références, jamais du contenu ; l'hôte résout au
 * moment de l'envoi via `context/`.
 */
export type ContextRef =
  | { kind: "file"; uri: string }
  | { kind: "selection"; uri: string; range: [number, number] }
  | { kind: "symbol"; uri: string; name: string }
  | { kind: "diagnostics"; scope: "file" | "workspace"; uri?: string }
  | { kind: "terminal"; which: "lastCommand" | "selection" }
  | { kind: "git"; what: "status" | "diff" | "log" }
  | { kind: "image"; id: string };

export type ContextRefKind = ContextRef["kind"];

/** Chip affichée dans le composer : ce que `describe()` d'un provider renvoie. */
export interface ContextChip {
  ref: ContextRef;
  label: string;
  detail?: string;
  /** octets estimés, sans lire tout le contenu si évitable. */
  estBytes: number;
  /** `true` si la ref pointe un fichier sensible (`.env`, clé…) — avertissement C07. */
  sensitive?: boolean;
  /** message d'indisponibilité (git absent, shell integration absente…). */
  unavailable?: string;
}

export interface FileHit {
  uri: string;
  /** chemin relatif au dossier, pour l'affichage. */
  rel: string;
}

export interface PendingActionView {
  actionId: string;
  kind: "command" | "edit" | "network" | "other";
  summary: string;
  command?: string;
  cwd?: string;
  path?: string;
  diff?: string;
  /** avertissements de commande destructrice, non bloquants (item 114). */
  warnings: { pattern: string; message: string }[];
  /** `true` si le bridge n'a fourni aucun détail (v1) — aveu honnête. */
  blind: boolean;
}

export interface WorkingSetView {
  path: string;
  status: "M" | "A" | "D" | "ADDED" | "DELETED" | "UPDATED" | "MOVED";
  added?: number;
  removed?: number;
  inProgress?: boolean;
  conflict?: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
  source: "builtin" | "prompt" | "mcp";
  /** `true` si c'est une action locale (pas de texte à préremplir). */
  local?: boolean;
  argsHint?: string;
}

export interface ModeView {
  name: string;
  permissions?: string;
  mcp: string[];
  model?: string;
}

/** Étape de plan/todo **produite par l'agent** (C09 §2). Le client n'en fabrique aucune. */
export interface TodoItemView {
  id: string;
  text: string;
  state: "pending" | "active" | "done" | "skipped";
}

// --- hôte → webview ---

export type HostToWebview =
  | { type: "connection"; state: "connecting" | "open" | "closed"; protocol?: number | null; detail?: string }
  | { type: "protocol"; version: number; capabilities: string[]; degraded: boolean }
  | { type: "bridge"; message: Outbound }
  | { type: "mcpServers"; servers: McpServerView[] }
  | { type: "health"; components: ComponentHealth[] }
  | { type: "hostError"; text: string }
  | { type: "fileResults"; requestId: string; results: FileHit[] }
  | { type: "contextChips"; chips: ContextChip[] }
  | { type: "attachContext"; chip: ContextChip }
  | { type: "autoContext"; chips: ContextChip[] }
  | { type: "commands"; commands: SlashCommand[] }
  | { type: "modes"; modes: ModeView[] }
  | { type: "instructionsInfo"; applied: string[]; ignored: { rel: string; reason: string }[]; truncated: boolean }
  | { type: "starters"; prompts: string[] }
  | { type: "commandResult"; command: string; prefill?: string; note?: string }
  | { type: "clearThread" }
  | { type: "workingSet"; files: WorkingSetView[]; strategy: string }
  | { type: "fileDiff"; path: string; unified: string; conflict: boolean; error?: string }
  | { type: "pendingAction"; action: PendingActionView | null }
  | { type: "permissionMode"; mode: "ask" | "autoEdit" | "autoAll" | "readOnly"; trusted: boolean }
  | { type: "permissionOutcome"; verdict: "allowed" | "denied"; rule: string; summary: string }
  | { type: "hookResult"; command: string; ok: boolean; output: string }
  | { type: "metrics"; contextWindow?: number; tokensPerSec?: number | null }
  | { type: "todo"; items: TodoItemView[] }
  | { type: "planMode"; enabled: boolean; interruptCapable: boolean }
  | {
      type: "workspace";
      folder: string | null;
      path: string | null;
      sandboxRoot: string;
      editorAvailable: boolean;
      expandThinking: boolean;
    }
  | { type: "reset" };

export const HOST_TO_WEBVIEW_TYPES = [
  "connection",
  "protocol",
  "bridge",
  "mcpServers",
  "health",
  "hostError",
  "fileResults",
  "contextChips",
  "attachContext",
  "autoContext",
  "commands",
  "modes",
  "instructionsInfo",
  "starters",
  "commandResult",
  "clearThread",
  "workingSet",
  "fileDiff",
  "pendingAction",
  "permissionMode",
  "permissionOutcome",
  "hookResult",
  "metrics",
  "todo",
  "planMode",
  "workspace",
  "reset",
] as const;

// --- webview → hôte ---

export type WebviewToHost =
  | { type: "ready"; stateVersion: number }
  | { type: "startSession"; mcpServers: string[]; mode?: string }
  | { type: "userMessage"; text: string; context: ContextRef[] }
  | { type: "searchFiles"; query: string; requestId: string }
  | { type: "pickContext"; kind: ContextRefKind | "menu" }
  | { type: "resolveCommand"; command: string; args: string }
  | { type: "remember"; text: string }
  | { type: "dismissAuto"; refKey: string }
  | { type: "cancelTurn" }
  | { type: "interrupt"; text: string }
  | { type: "setPlanMode"; enabled: boolean }
  | { type: "continueTurn"; guidance?: string }
  | { type: "forceNewSession" }
  | { type: "confirm"; accept: boolean; actionId?: string; remember?: "session" | "workspace"; editedCommand?: string }
  | { type: "openDiff"; path: string }
  | { type: "requestFileDiff"; path: string }
  | { type: "openFileDiff"; path: string }
  | { type: "revertFile"; path: string }
  | { type: "revertHunk"; path: string; hunkHeader: string }
  | { type: "undoTurn" }
  | { type: "editMessage"; itemId: string; text: string }
  | { type: "regenerate"; itemId: string; text: string }
  | { type: "truncateFrom"; itemId: string; count: number }
  | { type: "openHistory" }
  | { type: "compact" }
  | { type: "exportConversation"; format: "markdown" | "json" }
  | {
      type: "persistSnapshot";
      items: unknown[];
      branches: unknown[];
      title: string | null;
      cost: number;
      promptTokens: number;
      completionTokens: number;
    }
  | { type: "openFile"; path: string; line?: number }
  | { type: "copy"; text: string }
  | { type: "insertAtCursor"; text: string }
  | { type: "createFile"; suggestedName: string; content: string }
  | { type: "runInTerminal"; command: string }
  | { type: "feedback"; itemId: string; value: "up" | "down" }
  | { type: "refreshHealth" }
  | { type: "healthAction"; component: ComponentId; action: HealthActionId };

export const WEBVIEW_TO_HOST_TYPES = [
  "ready",
  "startSession",
  "userMessage",
  "searchFiles",
  "pickContext",
  "resolveCommand",
  "remember",
  "dismissAuto",
  "cancelTurn",
  "interrupt",
  "setPlanMode",
  "continueTurn",
  "forceNewSession",
  "confirm",
  "openDiff",
  "requestFileDiff",
  "openFileDiff",
  "revertFile",
  "revertHunk",
  "undoTurn",
  "editMessage",
  "regenerate",
  "truncateFrom",
  "openHistory",
  "compact",
  "exportConversation",
  "persistSnapshot",
  "openFile",
  "copy",
  "insertAtCursor",
  "createFile",
  "runInTerminal",
  "feedback",
  "refreshHealth",
  "healthAction",
] as const;

/**
 * Garde de forme à l'entrée d'un routeur : vérifie qu'un message reçu a bien un
 * discriminant connu (03-PROTOCOL §3.3 : « validés à l'entrée, forme pas
 * identité »). Une webview compromise ne doit pas faire crasher l'hôte.
 */
export function isWebviewToHost(value: unknown): value is WebviewToHost {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (WEBVIEW_TO_HOST_TYPES as readonly string[]).includes((value as { type: string }).type)
  );
}

export function isHostToWebview(value: unknown): value is HostToWebview {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (HOST_TO_WEBVIEW_TYPES as readonly string[]).includes((value as { type: string }).type)
  );
}
