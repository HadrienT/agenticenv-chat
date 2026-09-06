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
// WP08d : copie jetable du projet côté sandbox + `apply_changes` de retour vers
// le vrai dépôt, `request_bundle_diff`/`bundle_diff`, `discard_changes`,
// `checkpoint_restored`, `start_session.mode`.
// Les messages v2 non encore branchés côté AgenticEnv sont marqués « [v2] »
// (le bridge annonce aujourd'hui : turns, cancel, diffs, checkpoints, apply).

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
  /**
   * Host path bind-mounted **read-only** into the sandbox at `/workspace/source`
   * (WP08d) ; l'agent travaille sur une copie jetable. L'hôte le renseigne.
   */
  project_path?: string | null;
  /**
   * `"agent"` (défaut) autorise `apply_changes` ; `"read_only"` (modes Ask /
   * Plan) le refuse — l'agent peut quand même expérimenter dans la copie jetable.
   */
  mode?: "agent" | "read_only";
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

/** Demande le diff baseline→maintenant d'un fichier de la copie sandbox. Réponse : `file_diff`. */
export interface RequestDiff {
  type: "request_diff";
  path: string;
}

/** WP08d : diff unifié de tous les fichiers changés dans la copie sandbox. Réponse : `bundle_diff`. */
export interface RequestBundleDiff {
  type: "request_bundle_diff";
}

/** Restaure un checkpoint (tout le tour) dans la copie sandbox. Réponse : `checkpoint_restored`. */
export interface RestoreCheckpoint {
  type: "restore_checkpoint";
  checkpoint_id: string;
}

/**
 * WP08d : écrit les fichiers changés de la copie sandbox dans le vrai dépôt.
 * `paths` absent → tous les fichiers changés. `force` outrepasse la détection de
 * conflit (fichier hôte modifié depuis le début de session). Réponse :
 * `changes_applied`.
 */
export interface ApplyChanges {
  type: "apply_changes";
  paths?: string[] | null;
  force?: boolean;
}

/** WP08d : remet des fichiers de la copie sandbox à la baseline de session. */
export interface DiscardChanges {
  type: "discard_changes";
  paths?: string[] | null;
}

/** [v2] Demande au bridge de compacter l'historique (C13 §2). Le client ne résume jamais lui-même. */
export interface Compact {
  type: "compact";
}

/**
 * [v2] Consigne injectée **pendant** un tour sans l'arrêter (C09 §4). N'est émis
 * que si le bridge annonce la capability `interrupt` ; sinon le client met la
 * consigne en file et l'envoie comme `user_message` au `turn_finished`.
 */
export interface Interrupt {
  type: "interrupt";
  turn_id: string;
  text: string;
}

export interface ListMcpServers {
  type: "list_mcp_servers";
}

/** [v2] Liste les modèles chargeables (C12 §2). Réponse : `models`. */
export interface ListModels {
  type: "list_models";
}

/**
 * [v2] Change le modèle actif (C12 §2). Le rechargement `llama-server` peut
 * durer des minutes et échouer en VRAM — l'état passe par le panneau Components,
 * pas par un spinner opaque.
 */
export interface SetModel {
  type: "set_model";
  model_id: string;
}

export type Inbound =
  | Hello
  | StartSession
  | UserMessage
  | ConfirmAction
  | CancelTurn
  | Resume
  | RequestDiff
  | RequestBundleDiff
  | RestoreCheckpoint
  | ApplyChanges
  | DiscardChanges
  | Compact
  | Interrupt
  | ListModels
  | SetModel
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
  /** WP08d : mode négocié (défaut `"agent"` si le bridge ne le renvoie pas). */
  mode?: "agent" | "read_only";
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

/** Diff unifié d'un fichier, calculé côté sandbox (baseline de session → maintenant). */
export interface FileDiffMessage extends Seq {
  type: "file_diff";
  path: string;
  unified: string;
  truncated: boolean;
}

/** WP08d : diff unifié de toute la copie sandbox (réponse à `request_bundle_diff`). */
export interface BundleDiffMessage extends Seq {
  type: "bundle_diff";
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

export type TodoState = "pending" | "active" | "done" | "skipped";

export interface TodoItemWire {
  id: string;
  text: string;
  state: TodoState;
}

/**
 * [v2] Plan/todo **produit par l'agent** (C09 §2, items 54/124). Toujours un état
 * **complet** (03-PROTOCOL §3.3), jamais un patch. Le client n'infère aucune
 * étape : sans ce message, aucun panneau n'apparaît.
 */
export interface TodoMessage extends Seq {
  type: "todo";
  items: TodoItemWire[];
}

/** Checkpoint pris par le bridge avant un tour (sur la copie sandbox). */
export interface CheckpointMessage extends Seq {
  type: "checkpoint";
  checkpoint_id: string;
  turn_id: string;
  created_at: string;
  files: string[];
}

/** WP08d : accusé de restauration d'un checkpoint (réponse à `restore_checkpoint`). */
export interface CheckpointRestored extends Seq {
  type: "checkpoint_restored";
  checkpoint_id: string;
}

export interface GitChangeDTO {
  status: "ADDED" | "DELETED" | "UPDATED" | "MOVED";
  path: string;
}

export interface AppliedEntry {
  path: string;
  status: "ADDED" | "DELETED" | "UPDATED" | "MOVED";
}

export interface SkippedEntry {
  path: string;
  reason: string;
}

/**
 * WP08d : résultat d'`apply_changes`. `skipped` porte la raison (conflit hôte,
 * fichier disparu de la copie, chemin hors workspace) — affichée telle quelle.
 */
export interface ChangesApplied extends Seq {
  type: "changes_applied";
  applied: AppliedEntry[];
  skipped: SkippedEntry[];
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

export interface ModelEntry {
  id: string;
  label: string;
  context_window: number;
  current: boolean;
  /** État de chargement `llama-server` (C12 §2) ; `error` porte le message brut. */
  state?: "ready" | "loading" | "error";
  error?: string;
}

/** [v2] Modèles chargeables + modèle courant (C12 §2). */
export interface Models extends Seq {
  type: "models";
  models: ModelEntry[];
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
  | TodoMessage
  | FileDiffMessage
  | BundleDiffMessage
  | CheckpointMessage
  | CheckpointRestored
  | ChangesApplied
  | FilesChanged
  | Usage
  | AwaitingConfirmation
  | ErrorMessage
  | McpServers
  | Models;

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
  "todo",
  "file_diff",
  "bundle_diff",
  "checkpoint",
  "checkpoint_restored",
  "changes_applied",
  "files_changed",
  "usage",
  "awaiting_confirmation",
  "error",
  "mcp_servers",
  "models",
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
  "request_bundle_diff",
  "restore_checkpoint",
  "apply_changes",
  "discard_changes",
  "compact",
  "interrupt",
  "list_models",
  "set_model",
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
  // Le bridge implémente désormais (welcome annonce turns/cancel/diffs/
  // checkpoints/apply) : hello, welcome, turn_started, turn_finished,
  // cancel_turn, tool_status, progress, context_stats, request_diff, file_diff,
  // request_bundle_diff, bundle_diff, checkpoint, restore_checkpoint,
  // checkpoint_restored, apply_changes, changes_applied, discard_changes.
  // Restent « client en avance » (capabilities non annoncées) :
  "resume",
  "resumed",
  "compact",
  "interrupt",
  "event_delta",
  "pending_action",
  "history_compacted",
  "todo",
  "list_models",
  "set_model",
  "models",
] as const;

/** Capabilities v2 qu'un bridge peut annoncer dans `welcome`. */
export type Capability =
  | "turns"
  | "deltas"
  | "cancel"
  | "diffs"
  | "todo"
  | "checkpoints"
  | "apply"
  | "compact"
  | "interrupt"
  | "resume"
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
