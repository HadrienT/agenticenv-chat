import type { AppState, ChatItem, Notice } from "./types";
import { initialState } from "./types";

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

/** Remplace l'item à `idx` (interne : les callers savent que l'index est valide). */
export function replaceAt(state: AppState, idx: number, item: ChatItem): AppState {
  const items = state.items.slice();
  items[idx] = item;
  return { ...state, items };
}

export function withNotice(state: AppState, notice: Notice): AppState {
  // Erreur répétée : on regroupe (« ×4 ») au lieu d'empiler (C14 §3).
  const existing = state.notices.find((n) => n.id === notice.id);
  const merged = existing ? { ...notice, count: (existing.count ?? 1) + 1 } : notice;
  return { ...state, notices: [...state.notices.filter((n) => n.id !== notice.id), merged] };
}

export function resetState(state: AppState): AppState {
  const fresh = initialState();
  return {
    ...fresh,
    connection: state.connection,
    protocol: state.protocol,
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
