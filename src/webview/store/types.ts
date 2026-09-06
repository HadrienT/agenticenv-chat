import type {
  ComponentHealth,
  ContextChip,
  FileHit,
  McpServerView,
  ModelView,
  ModeView,
  PendingActionView,
  SessionMode,
  SlashCommand,
  TodoItemView,
} from "../../messages";
import type { GitChangeDTO } from "../../protocol";
import type { Notice } from "./notice";

/**
 * Machine à états de session (01-ARCHITECTURE §3). Depuis C01 les transitions
 * `idle → running` et `running → idle` sont pilotées **uniquement** par
 * `turn_started` / `turn_finished` (P3). Un bridge v1 (pas de frontière de tour)
 * bascule dans un repli dégradé, cf. `v1Fallback.ts`.
 */
export type SessionPhase =
  | { kind: "picking" }
  | { kind: "starting" }
  | { kind: "idle"; conversationId: string }
  | { kind: "running"; conversationId: string; turnId: string; startedAt: number }
  | { kind: "awaiting"; conversationId: string; turnId: string; pending: PendingActionView | null }
  | { kind: "cancelling"; conversationId: string; turnId: string };

export type ToolStatus = "running" | "ok" | "error";

export type ChatItem =
  | { kind: "user"; id: string; text: string; ts?: number }
  | {
      kind: "assistant";
      id: string;
      text: string;
      streaming: boolean;
      revision: number;
      ts?: number;
      /** `SdkEvent.id` / `event_delta.event_id` — relie les deltas à l'événement final. */
      sourceId?: string;
    }
  | {
      kind: "tool";
      id: string;
      toolName: string;
      thought: string;
      args: Record<string, unknown> | undefined;
      status: ToolStatus;
      statusLabel?: string;
      toolCallId?: string;
      /** Observation fusionnée (C05 §3) : action + observation = un seul item. */
      observation?: unknown;
      /** `true` si l'observation portait une erreur (corps déplié par défaut). */
      observationError?: boolean;
      ts?: number;
    }
  | { kind: "observation"; id: string; toolName: string; result: unknown; ts?: number }
  | { kind: "error"; id: string; text: string; ts?: number }
  | { kind: "turn-cancelled"; id: string }
  | {
      kind: "permission";
      id: string;
      verdict: "allowed" | "denied";
      rule: string;
      summary: string;
      ts?: number;
    }
  | { kind: "hook"; id: string; command: string; ok: boolean; output: string; ts?: number }
  | { kind: "compaction"; id: string; turns: number; summary: string; ts?: number }
  /** L'agent a atteint son cap d'itérations (C09 §5) — carte de continuation. */
  | { kind: "max-iterations"; id: string; turnId: string; resolved?: boolean }
  /** Consigne tapée pendant un tour, en file faute de capability `interrupt` (C09 §4). */
  | { kind: "queued-note"; id: string; text: string; sent?: boolean }
  /** Changement de modèle en cours de session (C12 §2) — change l'interprétation de la suite. */
  | { kind: "model-switch"; id: string; model: string };

export type { Notice, NoticeAction, NoticeActionKind, NoticeLevel } from "./notice";

export type PanelId = "health" | "workingSet" | "todo";

export interface ConnectionState {
  state: "connecting" | "open" | "closed";
  protocol: number | null;
  detail?: string;
}

export interface ProtocolState {
  version: number;
  capabilities: string[];
  /** `true` = bridge v1 (ou négociation échouée) : Stop et diffs indisponibles. */
  degraded: boolean;
}

export interface UsageState {
  accumulatedCost: number;
  promptTokens: number;
  completionTokens: number;
  contextWindow: number;
  /** débit dérivé (`completion_tokens` / durée du dernier tour), ou `null` (C13 §5). */
  tokensPerSec?: number | null;
}

export interface WorkingSetFile {
  path: string;
  status: GitChangeDTO["status"] | "M" | "A" | "D";
  added?: number;
  removed?: number;
  inProgress?: boolean;
  conflict?: boolean;
}

export interface FileDiffState {
  unified: string;
  conflict: boolean;
  error?: string;
}

export interface SessionInfo {
  llmSource: string;
}

export interface AppState {
  connection: ConnectionState;
  protocol: ProtocolState;
  phase: SessionPhase;
  session: SessionInfo | null;
  items: ChatItem[];
  /** id → position dans `items`, pour un patch en O(1). */
  itemIndex: Record<string, number>;
  eventSeq: number;
  /** UI optimiste (item 112) : message envoyé, `turn_started` pas encore reçu. */
  pendingSend: boolean;
  /** Libellé de progression du tour en cours (« Reading black.cpp… »), ou `null`. */
  progress: string | null;
  workspace: {
    folder: string | null;
    path: string | null;
    sandboxRoot: string;
    editorAvailable: boolean;
    expandThinking: boolean;
  };
  mcp: { servers: McpServerView[]; selected: string[] };
  /** Modes de session (`.mode.md`) + sélection avant `startSession` (C10 §4). */
  modes: ModeView[];
  selectedMode: string | null;
  /** Fichiers d'instructions appliqués au dernier envoi (C10 §2, chip composer). */
  instructions: { applied: string[]; ignored: { rel: string; reason: string }[]; truncated: boolean };
  health: ComponentHealth[];
  usage: UsageState | null;
  /** `true` si l'historique a été compacté (bannière + item, C13 §2). */
  compacted: boolean;
  /** Plan/todo **produit par l'agent** (C09 §2). `null` = jamais reçu ⇒ aucun panneau. */
  todo: TodoItemView[] | null;
  /** Mode de session (C12 §3) : `ask`/`plan` forcent `readOnly` ; `plan` a l'écran d'approbation C09 §3. */
  sessionMode: SessionMode;
  /** Modèles chargeables (C12 §2). `null` = le bridge n'expose pas `models` ⇒ aucun sélecteur. */
  models: ModelView[] | null;
  /** Consignes tapées pendant un tour, en file faute de capability `interrupt` (C09 §4). */
  pendingInterrupts: string[];
  workingSet: WorkingSetFile[];
  /** Diffs par fichier (checkpoint → maintenant), chargés à la demande (C06). */
  fileDiffs: Record<string, FileDiffState>;
  checkpointStrategy: string;
  permissions: {
    mode: "ask" | "autoEdit" | "autoAll" | "readOnly";
    trusted: boolean;
  };
  notices: Notice[];
  composer: {
    draft: string;
    /** chips explicitement ajoutées par l'utilisateur (`#`, `＋`, commande). */
    attachments: ContextChip[];
    /** historique des prompts envoyés (max 50, persistant). */
    history: string[];
  };
  /** chips auto (fichier actif, sélection) poussées par l'hôte (C03 §2). */
  autoContext: ContextChip[];
  /** `refKey` des auto-chips retirées — mémorisé pour le tour suivant. */
  dismissedAuto: string[];
  /** Fournis par l'hôte (C04) ; consommés par le composer (C03). */
  contextChips: ContextChip[];
  fileSearch: { requestId: string; results: FileHit[] } | null;
  commands: SlashCommand[];
  starters: string[];
  /** Versions précédentes du fil après « edit & resend » / truncate (C08 §4). */
  branches: { at: number; removed: ChatItem[] }[];
  panels: Record<PanelId, boolean>;
}

/** Réexporté depuis `./initialState` (extrait pour tenir la limite de 200 lignes). */
export { initialState } from "./initialState";
