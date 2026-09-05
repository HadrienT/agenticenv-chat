import { assertNever } from "../../assertNever";
import type { LocalAction } from "./actions";
import { withNotice } from "./reduceHelpers";
import type { AppState } from "./types";

/** Routeur exhaustif des intentions locales (`assertNever` en garde). */
export function applyLocal(state: AppState, action: LocalAction): AppState {
  switch (action.type) {
    case "composer/setDraft":
      return { ...state, composer: { draft: action.draft } };

    case "mcp/toggle": {
      const has = state.mcp.selected.includes(action.name);
      const selected = has
        ? state.mcp.selected.filter((n) => n !== action.name)
        : [...state.mcp.selected, action.name];
      return { ...state, mcp: { ...state.mcp, selected } };
    }

    case "panel/toggle":
      return { ...state, panels: { ...state.panels, [action.id]: !state.panels[action.id] } };

    case "notice/push":
      return withNotice(state, action.notice);

    case "notice/dismiss":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };

    case "intent/startSession":
      return state.phase.kind === "picking" ? { ...state, phase: { kind: "starting" } } : state;

    case "intent/sendMessage": {
      const p = state.phase;
      if (p.kind !== "idle") {
        return state;
      }
      // Optimiste (item 112) : on passe en `running` sans attendre. En C00 il n'y
      // a pas de `turn_id` du bridge — on synthétise un id non vide pour tenir
      // l'invariant I2 (marqué `todo` jusqu'à C01).
      return {
        ...state,
        phase: {
          kind: "running",
          conversationId: p.conversationId,
          turnId: `legacy-${action.at}`,
          startedAt: action.at,
        },
      };
    }

    case "intent/confirm": {
      const p = state.phase;
      if (p.kind !== "awaiting") {
        return state;
      }
      if (!action.accept) {
        return { ...state, phase: { kind: "idle", conversationId: p.conversationId } };
      }
      return {
        ...state,
        phase: {
          kind: "running",
          conversationId: p.conversationId,
          turnId: p.turnId,
          startedAt: action.at,
        },
      };
    }

    default:
      return assertNever(action, "LocalAction");
  }
}
