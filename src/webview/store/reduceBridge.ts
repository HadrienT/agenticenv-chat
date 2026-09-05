import { assertNever } from "../../assertNever";
import type { Outbound } from "../../protocol";
import { withNotice } from "./reduceHelpers";
import {
  applyEvent,
  applyEventDelta,
  applyProgress,
  applyToolStatus,
  finishTurn,
  maybeV1EndTurn,
  startTurn,
} from "./reduceTurn";
import type { AppState } from "./types";

/** Routeur exhaustif du fil bridge (`assertNever` en garde). */
export function applyBridge(state: AppState, msg: Outbound, at: number): AppState {
  switch (msg.type) {
    case "welcome":
    case "resumed":
    case "file_diff":
    case "checkpoint":
    case "pending_action":
      // Interceptés/traduits par l'hôte. No-op dans le réducteur webview.
      return state;

    case "session_started":
      return {
        ...state,
        session: { llmSource: msg.llm_source },
        phase: { kind: "idle", conversationId: msg.conversation_id },
        pendingSend: false,
      };

    case "turn_started":
      return startTurn(state, msg, at);

    case "turn_finished":
      return finishTurn(state, msg);

    case "event":
      return applyEvent(state, msg, at);

    case "event_delta":
      return applyEventDelta(state, msg, at);

    case "tool_status":
      return applyToolStatus(state, msg);

    case "progress":
      return applyProgress(state, msg);

    case "files_changed": {
      const workingSet = msg.changes.map((c) => ({ path: c.path, status: c.status }));
      return maybeV1EndTurn({ ...state, workingSet }, msg);
    }

    case "usage": {
      const usage = {
        accumulatedCost: msg.accumulated_cost,
        promptTokens: msg.prompt_tokens,
        completionTokens: msg.completion_tokens,
        contextWindow: msg.context_window,
      };
      return maybeV1EndTurn({ ...state, usage }, msg);
    }

    case "awaiting_confirmation": {
      const p = state.phase;
      // La charge utile (pending_action) arrive via un message hôte `pendingAction` ;
      // ici on bascule juste la phase (compat v1 : bridge sans détail).
      return p.kind === "running"
        ? {
            ...state,
            phase: { kind: "awaiting", conversationId: p.conversationId, turnId: p.turnId, pending: null },
          }
        : state;
    }

    case "error": {
      const fatal = msg.code !== "PROJECT_READONLY";
      const withN = withNotice(state, {
        id: `bridge-${msg.code}`,
        level: fatal ? "error" : "warn",
        text: `${msg.code}: ${msg.message}`,
        dismissible: msg.code !== "PROJECT_READONLY",
      });
      // En v2 une `error` fatale est suivie de `turn_finished{reason:"error"}` :
      // on laisse la machine à `turn_finished`. En v1 (dégradé) il faut rendre la
      // main ici, sinon le tour ne se termine jamais.
      return fatal ? endTurnOnError(withN, state.protocol.degraded) : withN;
    }

    case "mcp_servers": {
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

/** `starting → picking` toujours ; `running/awaiting/cancelling → idle` si `endActive`. */
export function endTurnOnError(state: AppState, endActive: boolean): AppState {
  const p = state.phase;
  if (p.kind === "starting") {
    return { ...state, phase: { kind: "picking" }, pendingSend: false, progress: null };
  }
  if (endActive && (p.kind === "running" || p.kind === "awaiting" || p.kind === "cancelling")) {
    const items = state.items.map((it) =>
      it.kind === "assistant" && it.streaming ? { ...it, streaming: false } : it,
    );
    return {
      ...state,
      items,
      phase: { kind: "idle", conversationId: p.conversationId },
      pendingSend: false,
      progress: null,
    };
  }
  return { ...state, pendingSend: false };
}
