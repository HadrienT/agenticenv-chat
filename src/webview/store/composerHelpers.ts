import type { ContextRef } from "../../messages";

const HISTORY_MAX = 50;

/** Clé stable d'un `ContextRef` pour la déduplication et la mémoire de retrait. */
export function refKey(ref: ContextRef): string {
  return JSON.stringify(ref);
}

/** Ajoute un prompt à l'historique (dédupliqué, plafonné, item 9). */
export function pushHistory(history: string[], text: string): string[] {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    return history;
  }
  return [...history.filter((h) => h !== trimmed), trimmed].slice(-HISTORY_MAX);
}
