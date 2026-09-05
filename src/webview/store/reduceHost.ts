import { assertNever } from "../../assertNever";
import type { HostToWebview } from "../../messages";
import type { Outbound } from "../../protocol";
import { eventToItems } from "./eventItems";
import {
  appendItems,
  endTurnOnError,
  hash,
  maybeLegacyEndTurn,
  resetState,
  withNotice,
} from "./reduceHelpers";
import type { AppState } from "./types";

/** Routeur exhaustif des messages hôte → webview (`assertNever` en garde). */
export function applyHost(state: AppState, msg: HostToWebview): AppState {
  switch (msg.type) {
    case "connection": {
      const connection = {
        state: msg.state,
        protocol: msg.protocol ?? state.connection.protocol,
        detail: msg.detail,
      };
      // I4 : une déconnexion ne touche ni `items` ni le brouillon. Le
      // `disconnected` explicite et le `resume` sont C01.
      const notices =
        msg.state === "open" ? state.notices.filter((n) => n.id !== "connection") : state.notices;
      return { ...state, connection, notices };
    }

    case "bridge":
      return applyBridge(state, msg.message);

    case "mcpServers": {
      const names = new Set(msg.servers.map((s) => s.name));
      return {
        ...state,
        mcp: { servers: msg.servers, selected: state.mcp.selected.filter((n) => names.has(n)) },
      };
    }

    case "health":
      return { ...state, health: msg.components };

    case "hostError":
      return withNotice(endTurnOnError(state), {
        id: `host-${hash(msg.text)}`,
        level: "error",
        text: msg.text,
        dismissible: true,
      });

    case "workspace":
      return { ...state, workspace: { folder: msg.folder, path: msg.path } };

    case "reset":
      return resetState(state);

    default:
      return assertNever(msg, "HostToWebview");
  }
}

/** Routeur exhaustif du fil bridge (`assertNever` en garde). */
function applyBridge(state: AppState, msg: Outbound): AppState {
  switch (msg.type) {
    case "session_started":
      return {
        ...state,
        session: { llmSource: msg.llm_source },
        phase: { kind: "idle", conversationId: msg.conversation_id },
      };

    case "event": {
      const items = eventToItems(msg.event, state.eventSeq);
      return { ...appendItems(state, items), eventSeq: state.eventSeq + 1 };
    }

    case "files_changed": {
      const workingSet = msg.changes.map((c) => ({ path: c.path, status: c.status }));
      return maybeLegacyEndTurn({ ...state, workingSet }, msg);
    }

    case "usage": {
      const usage = {
        accumulatedCost: msg.accumulated_cost,
        promptTokens: msg.prompt_tokens,
        completionTokens: msg.completion_tokens,
        contextWindow: msg.context_window,
      };
      return maybeLegacyEndTurn({ ...state, usage }, msg);
    }

    case "awaiting_confirmation": {
      const p = state.phase;
      return p.kind === "running"
        ? { ...state, phase: { kind: "awaiting", conversationId: p.conversationId, turnId: p.turnId } }
        : state;
    }

    case "error": {
      const withN = withNotice(state, {
        id: `bridge-${msg.code}`,
        level: msg.code === "PROJECT_READONLY" ? "warn" : "error",
        text: `${msg.code}: ${msg.message}`,
        dismissible: msg.code !== "PROJECT_READONLY",
      });
      // PROJECT_READONLY est un avis non fatal sur la session : ne pas toucher la
      // phase (comportement v1 constant).
      return msg.code === "PROJECT_READONLY" ? withN : endTurnOnError(withN);
    }

    case "mcp_servers": {
      // Normalement intercepté par l'hôte ; toléré ici par robustesse.
      const servers = msg.servers.map((s) => ({
        name: s.name,
        transport: s.transport,
        tools: s.tools_allowlist,
      }));
      const names = new Set(servers.map((s) => s.name));
      return {
        ...state,
        mcp: { servers, selected: state.mcp.selected.filter((n) => names.has(n)) },
      };
    }

    default:
      return assertNever(msg, "Outbound");
  }
}
