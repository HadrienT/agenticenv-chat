import type { AppState, ChatItem } from "./types";

/**
 * Édition de la conversation (C08 §4) — opérations **destructives sur le fil**.
 * Les items retirés ne sont pas perdus : ils partent dans `state.branches`,
 * récupérables par « show previous version ». Une troncature n'annule **pas** les
 * fichiers écrits (opération sur le dialogue, pas sur le disque).
 *
 * Bloqué pendant `running` : l'appelant propose Stop d'abord.
 */

function reindex(items: ChatItem[]): Record<string, number> {
  const idx: Record<string, number> = {};
  items.forEach((it, i) => (idx[it.id] = i));
  return idx;
}

export function truncateFrom(state: AppState, itemId: string, at: number): AppState {
  if (state.phase.kind === "running" || state.phase.kind === "cancelling") {
    return state;
  }
  const cut = state.itemIndex[itemId];
  if (cut === undefined) {
    return state;
  }
  const removed = state.items.slice(cut);
  const items = state.items.slice(0, cut);
  return {
    ...state,
    items,
    itemIndex: reindex(items),
    branches: [...state.branches, { at, removed }],
  };
}

/** Edit & resend : l'item utilisateur redevient le dernier, avec le nouveau texte. */
export function editMessage(state: AppState, itemId: string, text: string, at: number): AppState {
  if (state.phase.kind === "running" || state.phase.kind === "cancelling") {
    return state;
  }
  const at0 = state.itemIndex[itemId];
  const item = at0 !== undefined ? state.items[at0] : undefined;
  if (!item || item.kind !== "user") {
    return state;
  }
  const removed = state.items.slice(at0 + 1);
  const items = [...state.items.slice(0, at0), { ...item, text }];
  return {
    ...state,
    items,
    itemIndex: reindex(items),
    branches: removed.length ? [...state.branches, { at, removed }] : state.branches,
  };
}

export function restoreBranch(state: AppState, index: number): AppState {
  const branch = state.branches[index];
  if (!branch) {
    return state;
  }
  const seen = new Set(state.items.map((i) => i.id));
  const items = [...state.items, ...branch.removed.filter((i) => !seen.has(i.id))];
  return {
    ...state,
    items,
    itemIndex: reindex(items),
    branches: state.branches.filter((_, i) => i !== index),
  };
}
