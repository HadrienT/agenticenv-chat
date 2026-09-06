import { assertNever } from "../../assertNever";
import type { LocalAction } from "./actions";
import { appendItems, patchItem, withNotice } from "./reduceHelpers";
import type { AppState } from "./types";
import { pushHistory } from "./composerHelpers";
import { editMessage, restoreBranch, truncateFrom } from "./reduceThread";

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

    case "mode/select":
      return { ...state, selectedMode: action.name };

    case "panel/toggle":
      return { ...state, panels: { ...state.panels, [action.id]: !state.panels[action.id] } };

    case "panel/set":
      return { ...state, panels: { ...state.panels, [action.id]: action.open } };

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

    case "intent/interrupt": {
      // Le composer reste actif pendant `running` (C03 §6). Avec la capability
      // `interrupt` la consigne est injectée dans le tour ; sinon elle est mise
      // en file et partira au `turn_finished` — **jamais** silencieusement.
      if (
        !state.pendingSend &&
        state.phase.kind !== "running" &&
        state.phase.kind !== "awaiting" &&
        state.phase.kind !== "cancelling"
      ) {
        return state;
      }
      const id = `note-${state.eventSeq}`;
      const next = appendItems(state, [
        { kind: "queued-note", id, text: action.text, sent: action.capable },
      ]);
      return {
        ...next,
        eventSeq: state.eventSeq + 1,
        pendingInterrupts: action.capable
          ? state.pendingInterrupts
          : [...state.pendingInterrupts, action.text],
        composer: { ...state.composer, draft: "" },
      };
    }

    case "intent/resolveMaxIterations":
      return patchItem(state, action.itemId, { resolved: true });

    case "session/setMode":
      // Optimiste : l'hôte confirme via `sessionMode` + `permissionMode` (readOnly).
      return { ...state, sessionMode: action.mode };

    case "thread/truncateFrom":
      return truncateFrom(state, action.itemId, action.at);

    case "thread/editMessage":
      return editMessage(state, action.itemId, action.text, action.at);

    case "thread/restoreBranch":
      return restoreBranch(state, action.index);

    default:
      return assertNever(action, "LocalAction");
  }
}
