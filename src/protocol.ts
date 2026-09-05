// Mirror of packages/openhands-bridge/src/openhands_bridge/protocol.py.
// Keep in sync by hand -- the wire format is a small, stable contract.

// --- client -> bridge ---

export interface StartSession {
  type: "start_session";
  mcp_servers: string[];
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

// --- component health (checked by the extension host, not the bridge) ---

export type HealthStatus = "up" | "down" | "degraded" | "unknown";

export interface ComponentHealth {
  /** stable id used for actions */
  id: "bridge" | "llama-server" | "llama-bridge" | "docker" | "agent-server-image" | "gpu";
  label: string;
  status: HealthStatus;
  detail: string;
  /** action ids the client may trigger for this component */
  actions: HealthActionId[];
}

export type HealthActionId = "start" | "stop" | "restart" | "pull";

// --- messages between extension host and webview (postMessage) ---

export type HostToWebview =
  | { type: "connection"; state: "connecting" | "open" | "closed"; detail?: string }
  | { type: "bridge"; message: Outbound }
  | { type: "mcpServers"; servers: { name: string; transport: string; tools: string[] }[] }
  | { type: "health"; components: ComponentHealth[] }
  | { type: "reset" };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "startSession"; mcpServers: string[] }
  | { type: "userMessage"; text: string }
  | { type: "confirm"; accept: boolean }
  | { type: "openDiff"; path: string }
  | { type: "refreshHealth" }
  | { type: "healthAction"; component: ComponentHealth["id"]; action: HealthActionId };
