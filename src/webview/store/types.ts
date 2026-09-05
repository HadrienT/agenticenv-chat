import type { ComponentHealth, McpServerView } from "../../messages";
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
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      streaming: boolean;
      revision: number;
      /** `SdkEvent.id` / `event_delta.event_id` — relie les deltas à l'événement final. */
      sourceId?: string;
    }
  | {
      kind: "tool";
      id: string;
      toolName: string;
      thought: string;
      args: unknown;
      status: ToolStatus;
      statusLabel?: string;
      toolCallId?: string;
    }
  | { kind: "observation"; id: string; toolName: string; result: unknown }
  | { kind: "error"; id: string; text: string }
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
  workspace: { folder: string | null; path: string | null };
  mcp: { servers: McpServerView[]; selected: string[] };
  health: ComponentHealth[];
  usage: UsageState | null;
  workingSet: WorkingSetFile[];
  notices: Notice[];
  composer: { draft: string };
  panels: Record<PanelId, boolean>;
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
    workspace: { folder: null, path: null },
    mcp: { servers: [], selected: [] },
    health: [],
    usage: null,
    workingSet: [],
    notices: [],
    composer: { draft: "" },
    panels: { health: false, workingSet: true },
  };
}
