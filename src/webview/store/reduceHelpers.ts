import { legacyInferTurnEnd } from "./legacyTurn";
import type { AppState, ChatItem, Notice } from "./types";
import { initialState } from "./types";
import type { Outbound } from "../../protocol";

/** Le fil est append-only sauf `patchItem` sur un `id` existant (I8). */
export function appendItems(state: AppState, newItems: ChatItem[]): AppState {
  if (newItems.length === 0) {
    return state;
  }
  const items = state.items.slice();
  const itemIndex = { ...state.itemIndex };
  for (const it of newItems) {
    itemIndex[it.id] = items.length;
    items.push(it);
  }
  return { ...state, items, itemIndex };
}

export function patchItem(state: AppState, id: string, patch: Partial<ChatItem>): AppState {
  const idx = state.itemIndex[id];
  if (idx === undefined) {
    return state;
  }
  const items = state.items.slice();
  items[idx] = { ...items[idx], ...patch } as ChatItem;
  return { ...state, items };
}

export function maybeLegacyEndTurn(state: AppState, msg: Outbound): AppState {
  return legacyInferTurnEnd(msg) ? endActiveTurn(state) : state;
}

export function endActiveTurn(state: AppState): AppState {
  const p = state.phase;
  if (p.kind === "running" || p.kind === "awaiting" || p.kind === "cancelling") {
    return { ...state, phase: { kind: "idle", conversationId: p.conversationId } };
  }
  return state;
}

/** Une erreur (bridge fatale, ou erreur hôte) rend la main : running→idle, starting→picking. */
export function endTurnOnError(state: AppState): AppState {
  return state.phase.kind === "starting"
    ? { ...state, phase: { kind: "picking" } }
    : endActiveTurn(state);
}

export function withNotice(state: AppState, notice: Notice): AppState {
  return { ...state, notices: [...state.notices.filter((n) => n.id !== notice.id), notice] };
}

export function resetState(state: AppState): AppState {
  const fresh = initialState();
  return {
    ...fresh,
    connection: state.connection,
    health: state.health,
    workspace: state.workspace,
    mcp: state.mcp,
    notices: state.notices,
    composer: state.composer,
    panels: state.panels,
  };
}

export function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
