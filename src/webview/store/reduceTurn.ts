import type {
  EventDelta,
  EventMessage,
  Outbound,
  Progress,
  ToolStatus,
  TurnFinished,
  TurnStarted,
} from "../../protocol";
import { eventToItems } from "./eventItems";
import { appendItems, replaceAt, withNotice } from "./reduceHelpers";
import { v1FallbackTurnEnd } from "./v1Fallback";
import type { AppState, ChatItem } from "./types";

/** `idle → running` — uniquement sur `turn_started` (I2). */
export function startTurn(state: AppState, msg: TurnStarted, at: number): AppState {
  const p = state.phase;
  if (p.kind === "idle") {
    return {
      ...state,
      phase: { kind: "running", conversationId: p.conversationId, turnId: msg.turn_id, startedAt: at },
      pendingSend: false,
      progress: null,
    };
  }
  if ((p.kind === "running" || p.kind === "awaiting" || p.kind === "cancelling") && p.turnId !== msg.turn_id) {
    // I6 : deux `turn_started` sans `turn_finished` → le second est ignoré + notice
    // (bug bridge, rendu visible).
    return withNotice(state, {
      id: "turn-overlap",
      level: "warn",
      text: `Bridge started turn ${msg.turn_id} while ${p.turnId} was still running — the second was ignored.`,
      dismissible: true,
    });
  }
  return state;
}

/** `running/awaiting/cancelling → idle` — uniquement sur `turn_finished` (I1). */
export function finishTurn(state: AppState, msg: TurnFinished): AppState {
  const p = state.phase;
  if (p.kind !== "running" && p.kind !== "awaiting" && p.kind !== "cancelling") {
    return state;
  }
  if (p.turnId !== msg.turn_id) {
    // I3 : `turn_finished` avec un `turn_id` inconnu est ignoré (log via notice discrète).
    return withNotice(state, {
      id: "turn-unknown-finish",
      level: "info",
      text: `Ignored turn_finished for unknown turn ${msg.turn_id}.`,
      dismissible: true,
    });
  }
  const stopStreaming = state.items.map((it) =>
    it.kind === "assistant" && it.streaming ? { ...it, streaming: false } : it,
  );
  const next: AppState = {
    ...state,
    items: stopStreaming,
    phase: { kind: "idle", conversationId: p.conversationId },
    pendingSend: false,
    progress: null,
  };
  if (msg.reason === "cancelled") {
    // C01 §3 : un tour annulé reste dans le fil, marqué « cancelled », avec ce
    // qui avait déjà été produit.
    return appendItems(next, [{ kind: "turn-cancelled", id: `turn-cancelled-${msg.turn_id}` }]);
  }
  if (msg.reason === "max_iterations") {
    return withNotice(next, {
      id: `turn-max-${msg.turn_id}`,
      level: "warn",
      text: "The agent hit its iteration limit and stopped. Send another message to continue.",
      dismissible: true,
    });
  }
  return next;
}

/** `event_delta` : concatène sur l'item assistant `sourceId`, incrémente `revision`. */
export function applyEventDelta(state: AppState, msg: EventDelta, at: number): AppState {
  const idx = state.items.findIndex((i) => i.kind === "assistant" && i.sourceId === msg.event_id);
  if (idx >= 0) {
    const cur = state.items[idx] as Extract<ChatItem, { kind: "assistant" }>;
    if (!cur.streaming) {
      // L'`event` final est déjà arrivé et a figé cet item : un delta en retard
      // ne corrompt pas le résultat (C01 §4, « le final gagne »).
      return state;
    }
    return replaceAt(state, idx, {
      ...cur,
      text: cur.text + msg.text,
      revision: cur.revision + 1,
    });
  }
  const id = `ev-${state.eventSeq}`;
  const item: ChatItem = {
    kind: "assistant",
    id,
    text: msg.text,
    streaming: true,
    revision: 1,
    ts: at,
    sourceId: msg.event_id,
  };
  return { ...appendItems(state, [item]), eventSeq: state.eventSeq + 1 };
}

/**
 * `event` : l'événement final **écrase** le texte accumulé (un delta perdu ne
 * corrompt pas le rendu). Si un jumeau en streaming existe, on le remplace au
 * lieu d'ajouter un doublon.
 */
export function applyEvent(state: AppState, msg: EventMessage, at: number): AppState {
  const items = eventToItems(msg.event, state.eventSeq, at);
  const first = items[0];
  if (items.length === 1 && first.kind === "assistant" && first.sourceId) {
    const sourceId = first.sourceId;
    const twinIdx = state.items.findIndex(
      (i) => i.kind === "assistant" && i.sourceId === sourceId,
    );
    if (twinIdx >= 0) {
      const prev = state.items[twinIdx] as Extract<ChatItem, { kind: "assistant" }>;
      return {
        ...replaceAt(state, twinIdx, { ...first, id: prev.id, revision: prev.revision + 1 }),
        eventSeq: state.eventSeq + 1,
      };
    }
  }
  return { ...appendItems(state, items), eventSeq: state.eventSeq + 1 };
}

/** `tool_status` : pilote l'icône (⟳ / ✓ / ✗) de l'item outil `tool_call_id`. */
export function applyToolStatus(state: AppState, msg: ToolStatus): AppState {
  const idx = state.items.findIndex((i) => i.kind === "tool" && i.toolCallId === msg.tool_call_id);
  if (idx < 0) {
    return state;
  }
  const cur = state.items[idx] as Extract<ChatItem, { kind: "tool" }>;
  return replaceAt(state, idx, { ...cur, status: msg.state, statusLabel: msg.label });
}

/** `progress` : libellé humain, seulement pendant le tour concerné. */
export function applyProgress(state: AppState, msg: Progress): AppState {
  const p = state.phase;
  if ((p.kind === "running" || p.kind === "awaiting") && p.turnId === msg.turn_id) {
    return { ...state, progress: msg.label };
  }
  return state;
}

/** Repli bridge v1 : `files_changed`/`usage` terminent le tour, faute de mieux. */
export function maybeV1EndTurn(state: AppState, msg: Outbound): AppState {
  if (!state.protocol.degraded || !v1FallbackTurnEnd(msg)) {
    return state;
  }
  const p = state.phase;
  if (p.kind === "running" || p.kind === "awaiting" || p.kind === "cancelling") {
    return { ...state, phase: { kind: "idle", conversationId: p.conversationId }, progress: null };
  }
  return state;
}
