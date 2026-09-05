// Miroir **manuel** de packages/openhands-bridge/src/openhands_bridge/protocol.py
// (décision D4 du primer). Un test de dérive est obligatoire — voir
// test/discipline/protocol-drift.test.ts et 05-TESTING §4.
//
// Ce fichier ne contient QUE le fil bridge (snake_case, JSON sur WebSocket). Le
// contrat interne hôte↔webview vit dans src/messages.ts.
//
// v2 (03-PROTOCOL §2) : négociation `hello`/`welcome`, frontières de tour
// (`turn_started`/`turn_finished`), deltas (`event_delta`), annulation
// (`cancel_turn`), `tool_status`, `progress`, `seq` monotone + `resume`.
// Les messages v2 non encore branchés côté AgenticEnv sont marqués « [v2] ».

export const CLIENT_ID = "agenticenv-chat/0.4.0";
export const CLIENT_PROTOCOL = 2;

// --- client -> bridge ---

export interface Hello {
  type: "hello";
  protocol: number;
  client: string;
}

export interface StartSession {
  type: "start_session";
  mcp_servers: string[];
  /** Host path bind-mounted into the sandbox; the extension host fills this in. */
  project_path?: string | null;
}

export interface UserMessage {
  type: "user_message";
  text: string;
  /** [v2] contenu de contexte résolu par l'hôte (C04). Remplace la concaténation dans `text`. */
  context?: ResolvedContext[];
}

export interface ConfirmAction {
  type: "confirm_action";
  accept: boolean;
  /** [v2] identifiant de l'action approuvée (C07). */
  action_id?: string;
  /** [v2] mémorisation de la décision (C07). */
  remember?: "session" | "workspace";
  /** [v2] commande modifiée avant approbation (C07 §1). Best effort côté bridge. */
  edited_command?: string;
}

export interface CancelTurn {
  type: "cancel_turn";
  turn_id: string;
}

export interface Resume {
  type: "resume";
  conversation_id: string;
  last_seq: number;
}

/** [v2] Demande le diff checkpoint→maintenant d'un fichier. Réponse : `file_diff`. */
export interface RequestDiff {
  type: "request_diff";
  path: string;
}

/** [v2] Restaure un checkpoint (tout le tour). */
export interface RestoreCheckpoint {
  type: "restore_checkpoint";
  checkpoint_id: string;
}

/** [v2] Demande au bridge de compacter l'historique (C13 §2). Le client ne résume jamais lui-même. */
export interface Compact {
  type: "compact";
}

export interface ListMcpServers {
  type: "list_mcp_servers";
}

export type Inbound =
  | Hello
  | StartSession
  | UserMessage
  | ConfirmAction
  | CancelTurn
  | Resume
  | RequestDiff
  | RestoreCheckpoint
  | Compact
  | ListMcpServers;

// --- bridge -> client ---

/** Tout message v2 porte un `seq` monotone (connexion + conversation) pour `resume`. */
export interface Seq {
  seq?: number;
}

export interface Welcome extends Seq {
  type: "welcome";
  protocol: number;
  capabilities: string[];
}

export interface Resumed extends Seq {
  type: "resumed";
}

export interface SessionStarted extends Seq {
  type: "session_started";
  conversation_id: string;
  llm_source: "create_payload" | "switch_llm";
}

/** One openhands.sdk Event, already serialized (model_dump(mode="json")). */
export interface EventMessage extends Seq {
  type: "event";
  event: SdkEvent;
}

export interface TurnStarted extends Seq {
  type: "turn_started";
  turn_id: string;
}

export type TurnFinishedReason = "completed" | "cancelled" | "error" | "max_iterations";

export interface TurnFinished extends Seq {
  type: "turn_finished";
  turn_id: string;
  reason: TurnFinishedReason;
}

/** Fragment de texte à concaténer sur l'événement `event_id` du tour `turn_id`. */
export interface EventDelta extends Seq {
  type: "event_delta";
  turn_id: string;
  event_id: string;
  text: string;
}

export interface ToolStatus extends Seq {
  type: "tool_status";
  tool_call_id: string;
  state: "running" | "ok" | "error";
  label?: string;
}

/** Libellé humain de progression (« Reading black.cpp… »). Jamais inventé côté client. */
export interface Progress extends Seq {
  type: "progress";
  turn_id: string;
  label: string;
}

/** [v2] Action risquée en attente d'approbation — porte enfin de quoi décider (C07 §1). */
export interface PendingActionMessage extends Seq {
  type: "pending_action";
  action_id: string;
  kind: "command" | "edit" | "network" | "other";
  summary: string;
  command?: string;
  path?: string;
  diff?: string;
}

/** [v2] Diff unifié d'un fichier, calculé côté sandbox (checkpoint → maintenant). */
export interface FileDiffMessage extends Seq {
  type: "file_diff";
  path: string;
  unified: string;
  truncated: boolean;
}

/** [v2] État du contexte, poussé **pendant** le tour (C13 §1), pas seulement à la fin. */
export interface ContextStats extends Seq {
  type: "context_stats";
  prompt_tokens: number;
  context_window: number;
  compacted: boolean;
}

/** [v2] Compaction effectuée par le bridge (item 65). Le résumé est consultable. */
export interface HistoryCompacted extends Seq {
  type: "history_compacted";
  turns_summarized: number;
  summary: string;
}

/** [v2] Checkpoint pris par le bridge avant un tour. */
export interface CheckpointMessage extends Seq {
  type: "checkpoint";
  checkpoint_id: string;
  turn_id: string;
  created_at: string;
  files: string[];
}

export interface GitChangeDTO {
  status: "ADDED" | "DELETED" | "UPDATED" | "MOVED";
  path: string;
}

export interface FilesChanged extends Seq {
  type: "files_changed";
  changes: GitChangeDTO[];
}

export interface Usage extends Seq {
  type: "usage";
  accumulated_cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  context_window: number;
}

export interface AwaitingConfirmation extends Seq {
  type: "awaiting_confirmation";
  conversation_id: string;
}

export interface ErrorMessage extends Seq {
  type: "error";
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface McpServerEntry {
  name: string;
  transport: string;
  tools_allowlist: string[];
}

export interface McpServers extends Seq {
  type: "mcp_servers";
  servers: McpServerEntry[];
}

export type Outbound =
  | Welcome
  | Resumed
  | SessionStarted
  | EventMessage
  | TurnStarted
  | TurnFinished
  | EventDelta
  | ToolStatus
  | Progress
  | PendingActionMessage
  | ContextStats
  | HistoryCompacted
  | FileDiffMessage
  | CheckpointMessage
  | FilesChanged
  | Usage
  | AwaitingConfirmation
  | ErrorMessage
  | McpServers;

/** Discriminants `type` de tous les messages bridge → client (pour le test de dérive). */
export const OUTBOUND_TYPES = [
  "welcome",
  "resumed",
  "session_started",
  "event",
  "turn_started",
  "turn_finished",
  "event_delta",
  "tool_status",
  "progress",
  "pending_action",
  "context_stats",
  "history_compacted",
  "file_diff",
  "checkpoint",
  "files_changed",
  "usage",
  "awaiting_confirmation",
  "error",
  "mcp_servers",
] as const;

/** Discriminants `type` de tous les messages client → bridge. */
export const INBOUND_TYPES = [
  "hello",
  "start_session",
  "user_message",
  "confirm_action",
  "cancel_turn",
  "resume",
  "request_diff",
  "restore_checkpoint",
  "compact",
  "list_mcp_servers",
] as const;

/**
 * Messages v2 supportés par le **client** mais pas encore par le bridge
 * AgenticEnv (déploiement progressif — 03-PROTOCOL §2, « moitié AgenticEnv »).
 *
 * Ils sont **inertes** contre un bridge v1 : la négociation `hello`/`welcome`
 * échoue, le client bascule en mode dégradé et ne les émet jamais. Le test de
 * dérive (`test/discipline/protocol-drift.test.ts`) tolère ces entrées comme
 * « client en avance » ; il continue de détecter toute autre divergence.
 *
 * À vider au fur et à mesure que `packages/openhands-bridge` rattrape (commits
 * croisés, 04-CONVENTIONS §7).
 */
export const CLIENT_AHEAD_OF_BRIDGE = [
  "hello",
  "cancel_turn",
  "resume",
  "request_diff",
  "restore_checkpoint",
  "compact",
  "welcome",
  "resumed",
  "turn_started",
  "turn_finished",
  "event_delta",
  "tool_status",
  "progress",
  "pending_action",
  "context_stats",
  "history_compacted",
  "file_diff",
  "checkpoint",
] as const;

/** Capabilities v2 qu'un bridge peut annoncer dans `welcome`. */
export type Capability =
  | "turns"
  | "deltas"
  | "cancel"
  | "diffs"
  | "todo"
  | "checkpoints"
  | "compact"
  | "models";

// --- contexte résolu (hôte → bridge), défini ici car il transite sur le fil ---

export interface ResolvedContext {
  kind: string;
  label: string;
  body: string;
  truncated: boolean;
}

// --- a loose shape for the SDK Event payloads we actually render ---
// The bridge forwards `Event.model_dump(mode="json")` verbatim; we only read a
// few fields. `kind` discriminates (MessageEvent / ActionEvent / ObservationEvent
// / AgentErrorEvent / ...).

export interface SdkEvent {
  kind?: string;
  source?: string;
  timestamp?: string;
  id?: string;
  // MessageEvent
  llm_message?: { role?: string; content?: { type?: string; text?: string }[] };
  activated_skills?: string[];
  // ActionEvent
  thought?: { text?: string }[] | string;
  tool_name?: string;
  tool_call_id?: string;
  action?: Record<string, unknown>;
  // ObservationEvent
  observation?: Record<string, unknown>;
  // AgentErrorEvent
  error?: string;
  [key: string]: unknown;
}
