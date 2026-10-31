import { assertNever } from "../../assertNever";
import type { Outbound } from "../../protocol";
import { errorNotice } from "./errorNotice";
import { emptyUsage } from "./initialState";
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
    case "bundle_diff":
    case "checkpoint":
    case "checkpoint_restored":
    case "changes_applied":
    case "pending_action":
    case "todo":
    case "models":
      // Interceptés/traduits par l'hôte. No-op dans le réducteur webview.
      return state;

    case "session_started":
      return {
        ...state,
        session: { llmSource: msg.llm_source },
        phase: { kind: "idle", conversationId: msg.conversation_id },
        startup: null,
        pendingSend: false,
      };

    case "session_progress":
      return state.phase.kind === "starting"
        ? { ...state, startup: { steps: msg.steps, current: msg.current } }
        : state;

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
      // `usage.prompt_tokens` = dépense **cumulée**, pas l'occupation fenêtre
      // (#8). La jauge vient de `context_stats` ; on n'y touche ici qu'en repli
      // v1 (bridge sans `context_stats`).
      const prev = state.usage ?? emptyUsage();
      const usage = {
        ...prev,
        accumulatedCost: msg.accumulated_cost,
        accumulatedPromptTokens: msg.prompt_tokens,
        completionTokens: msg.completion_tokens,
        ...(state.protocol.degraded
          ? {
              promptTokens: msg.prompt_tokens,
              contextWindow: msg.context_window || prev.contextWindow,
            }
          : {}),
      };
      return maybeV1EndTurn({ ...state, usage }, msg);
    }

    case "context_stats": {
      // Source de vérité de la jauge d'occupation (#8) : taille du dernier
      // prompt vs fenêtre réelle. `context_window` peut être 0 si le bridge ne
      // la connaît pas encore → on garde la dernière valeur connue.
      const prev = state.usage ?? emptyUsage();
      const usage = {
        ...prev,
        promptTokens: msg.prompt_tokens,
        contextWindow: msg.context_window || prev.contextWindow,
      };
      return { ...state, usage, compacted: msg.compacted };
    }

    case "history_compacted": {
      const items = [
        ...state.items,
        {
          kind: "compaction" as const,
          id: `compact-${state.eventSeq}`,
          turns: msg.turns_summarized,
          summary: msg.summary,
        },
      ];
      const itemIndex = { ...state.itemIndex, [`compact-${state.eventSeq}`]: items.length - 1 };
      return { ...state, items, itemIndex, eventSeq: state.eventSeq + 1, compacted: true };
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
      // C14 §3 : notice **actionnable** (au moins une action, ou l'aveu qu'il n'y
      // en a pas) ; les erreurs répétées sont regroupées par `withNotice`.
      const withN = withNotice(state, errorNotice(msg.code, msg.message, msg.details, state.llm.profiles));
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
    return { ...state, phase: { kind: "picking" }, startup: null, pendingSend: false, progress: null };
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
