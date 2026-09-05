import type { ComponentHealth, McpServerView } from "../../messages";
import type { GitChangeDTO } from "../../protocol";

/**
 * Machine à états de session (01-ARCHITECTURE §3).
 *
 * En C00 les transitions restent pilotées par l'heuristique v1 isolée dans
 * `legacyInferTurnEnd` (comportement constant). C01 branche
 * `turn_started`/`turn_finished` et rend les invariants I2/I3/I6 actifs.
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
  | { kind: "assistant"; id: string; text: string; streaming: boolean; revision: number }
  | {
      kind: "tool";
      id: string;
      toolName: string;
      thought: string;
      args: unknown;
      status: ToolStatus;
    }
  | { kind: "observation"; id: string; toolName: string; result: unknown }
  | { kind: "error"; id: string; text: string };

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
  phase: SessionPhase;
  session: SessionInfo | null;
  items: ChatItem[];
  /** id → position dans `items`, pour un patch en O(1) (indispensable à C01). */
  itemIndex: Record<string, number>;
  eventSeq: number;
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
    phase: { kind: "picking" },
    session: null,
    items: [],
    itemIndex: {},
    eventSeq: 0,
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
