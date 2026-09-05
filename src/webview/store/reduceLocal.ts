import { assertNever } from "../../assertNever";
import type { LocalAction } from "./actions";
import { withNotice } from "./reduceHelpers";
import { pushHistory, type AppState } from "./types";

/** Routeur exhaustif des intentions locales (`assertNever` en garde). */
export function applyLocal(state: AppState, action: LocalAction): AppState {
  switch (action.type) {
    case "composer/setDraft":
      return { ...state, composer: { ...state.composer, draft: action.draft } };

    case "composer/addAttachment": {
      const exists = state.composer.attachments.some(
        (a) => JSON.stringify(a.ref) === JSON.stringify(action.chip.ref),
      );
      return exists
        ? state
        : {
            ...state,
            composer: {
              ...state.composer,
              attachments: [...state.composer.attachments, action.chip],
            },
          };
    }

    case "composer/removeAttachment":
      return {
        ...state,
        composer: {
          ...state.composer,
          attachments: state.composer.attachments.filter((_, i) => i !== action.index),
        },
      };

    case "composer/clearAttachments":
      return { ...state, composer: { ...state.composer, attachments: [] } };

    case "composer/dismissAuto":
      return state.dismissedAuto.includes(action.refKey)
        ? state
        : { ...state, dismissedAuto: [...state.dismissedAuto, action.refKey] };

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
      return state.phase.kind === "picking"
        ? { ...state, phase: { kind: "starting" }, pendingSend: false }
        : state;

    case "intent/sendMessage": {
      // I2 / C01 §9 : **aucun** passage en `running` ici — seul `turn_started` le
      // fait. L'UI optimiste (item 112) se limite à `pendingSend` : le composer se
      // verrouille et affiche « sending… » jusqu'au `turn_started`.
      if (state.phase.kind !== "idle") {
        return state;
      }
      return {
        ...state,
        pendingSend: true,
        composer: {
          ...state.composer,
          attachments: [],
          history: pushHistory(state.composer.history, action.text),
        },
        // `dismissedAuto` est conservé : un retrait d'auto-chip vaut pour les
        // tours suivants aussi (C03 §2).
      };
    }

    case "intent/confirm": {
      const p = state.phase;
      if (p.kind !== "awaiting") {
        return state;
      }
      // Accepter comme refuser **résout** l'action : le tour reprend, le bridge
      // enverra les événements suivants puis `turn_finished`.
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

    case "intent/cancelTurn": {
      const p = state.phase;
      if (state.protocol.degraded || p.kind !== "running") {
        return state;
      }
      return {
        ...state,
        phase: { kind: "cancelling", conversationId: p.conversationId, turnId: p.turnId },
        progress: "stopping…",
      };
    }

    default:
      return assertNever(action, "LocalAction");
  }
}
