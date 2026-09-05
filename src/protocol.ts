// Miroir **manuel** de packages/openhands-bridge/src/openhands_bridge/protocol.py
// (décision D4 du primer). Un test de dérive est obligatoire — voir
// test/discipline/protocol-drift.test.ts et 05-TESTING §4.
//
// Ce fichier ne contient QUE le fil bridge (snake_case, JSON sur WebSocket). Le
// contrat interne hôte↔webview vit dans src/messages.ts.

// --- client -> bridge ---

export interface StartSession {
  type: "start_session";
  mcp_servers: string[];
  /** Host path bind-mounted into the sandbox; the extension host fills this in. */
  project_path?: string | null;
}

export interface UserMessage {
  type: "user_message";
  text: string;
}

export interface ConfirmAction {
  type: "confirm_action";
  accept: boolean;
}

export interface ListMcpServers {
  type: "list_mcp_servers";
}

export type Inbound = StartSession | UserMessage | ConfirmAction | ListMcpServers;

// --- bridge -> client ---

export interface SessionStarted {
  type: "session_started";
  conversation_id: string;
  llm_source: "create_payload" | "switch_llm";
}

/** One openhands.sdk Event, already serialized (model_dump(mode="json")). */
export interface EventMessage {
  type: "event";
  event: SdkEvent;
}

export interface GitChangeDTO {
  status: "ADDED" | "DELETED" | "UPDATED" | "MOVED";
  path: string;
}

export interface FilesChanged {
  type: "files_changed";
  changes: GitChangeDTO[];
}

export interface Usage {
  type: "usage";
  accumulated_cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  context_window: number;
}

export interface AwaitingConfirmation {
  type: "awaiting_confirmation";
  conversation_id: string;
}

export interface ErrorMessage {
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

export interface McpServers {
  type: "mcp_servers";
  servers: McpServerEntry[];
}

export type Outbound =
  | SessionStarted
  | EventMessage
  | FilesChanged
  | Usage
  | AwaitingConfirmation
  | ErrorMessage
  | McpServers;

/** Discriminants `type` de tous les messages bridge → client (pour le test de dérive). */
export const OUTBOUND_TYPES = [
  "session_started",
  "event",
  "files_changed",
  "usage",
  "awaiting_confirmation",
  "error",
  "mcp_servers",
] as const;

/** Discriminants `type` de tous les messages client → bridge. */
export const INBOUND_TYPES = [
  "start_session",
  "user_message",
  "confirm_action",
  "list_mcp_servers",
] as const;

// --- a loose shape for the SDK Event payloads we actually render ---
// The bridge forwards `Event.model_dump(mode="json")` verbatim; we only read a
// few fields. `kind` discriminates (MessageEvent / ActionEvent / ObservationEvent
// / AgentErrorEvent / ...).

export interface SdkEvent {
  kind?: string;
  source?: string;
  timestamp?: string;
  // MessageEvent
  llm_message?: { role?: string; content?: { type?: string; text?: string }[] };
  activated_skills?: string[];
  // ActionEvent
  thought?: { text?: string }[] | string;
  tool_name?: string;
  action?: Record<string, unknown>;
  // ObservationEvent
  observation?: Record<string, unknown>;
  tool_call_id?: string;
  // AgentErrorEvent
  error?: string;
  [key: string]: unknown;
}
