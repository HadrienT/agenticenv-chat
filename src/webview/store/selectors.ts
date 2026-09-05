import type { AppState, ChatItem } from "./types";

/**
 * Dérivations pures du store. Bon marché : pas de mémoïsation ici, les vues
 * mémoïsent au niveau composant si besoin (04-CONVENTIONS §6).
 */

export function canStartSession(s: AppState): boolean {
  return s.connection.state === "open" && s.phase.kind === "picking";
}

export function canSendMessage(s: AppState): boolean {
  return s.connection.state === "open" && s.phase.kind === "idle";
}

/** Un tour est en cours (running / awaiting / cancelling). */
export function isTurnActive(s: AppState): boolean {
  return s.phase.kind === "running" || s.phase.kind === "awaiting" || s.phase.kind === "cancelling";
}

export function pendingConfirmation(s: AppState): boolean {
  return s.phase.kind === "awaiting";
}

/** L'écran de choix MCP (picking ou starting) plutôt que le fil. */
export function isPickingScreen(s: AppState): boolean {
  return s.phase.kind === "picking" || s.phase.kind === "starting";
}

export function isStarting(s: AppState): boolean {
  return s.phase.kind === "starting";
}

export function conversationId(s: AppState): string | null {
  const p = s.phase;
  return "conversationId" in p ? p.conversationId : null;
}

export function lastItem(s: AppState): ChatItem | undefined {
  return s.items[s.items.length - 1];
}
