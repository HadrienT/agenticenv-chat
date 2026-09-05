import type {
  ComponentHealth,
  ContextChip,
  FileHit,
  McpServerView,
  SlashCommand,
} from "../../messages";
import type { GitChangeDTO } from "../../protocol";

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
  | { kind: "awaiting"; conversationId: string; turnId: string }
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
  | { kind: "turn-cancelled"; id: string };

export type NoticeLevel = "info" | "warn" | "error";

export interface Notice {
  id: string;
  level: NoticeLevel;
  text: string;
  dismissible: boolean;
}

export type PanelId = "health" | "workingSet";

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
}

export interface WorkingSetFile {
  path: string;
  status: GitChangeDTO["status"];
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
  health: ComponentHealth[];
  usage: UsageState | null;
  workingSet: WorkingSetFile[];
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
  panels: Record<PanelId, boolean>;
}

const HISTORY_MAX = 50;

/** Clé stable d'un `ContextRef` pour la déduplication et la mémoire de retrait. */
export function refKey(ref: ContextChip["ref"]): string {
  return JSON.stringify(ref);
}

export function pushHistory(history: string[], text: string): string[] {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    return history;
  }
  return [...history.filter((h) => h !== trimmed), trimmed].slice(-HISTORY_MAX);
}

export function initialState(): AppState {
  return {
    connection: { state: "connecting", protocol: null },
    protocol: { version: 2, capabilities: [], degraded: false },
    phase: { kind: "picking" },
    session: null,
    items: [],
    itemIndex: {},
    eventSeq: 0,
    pendingSend: false,
    progress: null,
    workspace: {
      folder: null,
      path: null,
      // Vide jusqu'au message `workspace` de l'hôte : sans racine connue, aucune
      // référence de fichier n'est rendue cliquable.
      sandboxRoot: "",
      editorAvailable: false,
      expandThinking: false,
    },
    mcp: { servers: [], selected: [] },
    health: [],
    usage: null,
    workingSet: [],
    notices: [],
    composer: { draft: "", attachments: [], history: [] },
    autoContext: [],
    dismissedAuto: [],
    contextChips: [],
    fileSearch: null,
    commands: [],
    starters: [],
    panels: { health: false, workingSet: true },
  };
}
