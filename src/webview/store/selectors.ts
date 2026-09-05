import type { AppState, ChatItem } from "./types";

/** Dérivations pures du store. Bon marché : pas de mémoïsation ici. */

export function canStartSession(s: AppState): boolean {
  return s.connection.state === "open" && s.phase.kind === "picking";
}

export function canSendMessage(s: AppState): boolean {
  return s.connection.state === "open" && s.phase.kind === "idle" && !s.pendingSend;
}

/** Un tour est en cours (running / awaiting / cancelling) ou un envoi est en attente. */
export function isTurnActive(s: AppState): boolean {
  return (
    s.pendingSend ||
    s.phase.kind === "running" ||
    s.phase.kind === "awaiting" ||
    s.phase.kind === "cancelling"
  );
}

export function pendingConfirmation(s: AppState): boolean {
  return s.phase.kind === "awaiting";
}

export function isPickingScreen(s: AppState): boolean {
  return s.phase.kind === "picking" || s.phase.kind === "starting";
}

export function isStarting(s: AppState): boolean {
  return s.phase.kind === "starting";
}

/** État du bouton principal du composer (item 19). */
export type ComposerButton = "send" | "stop" | "cancelling";

export function composerButton(s: AppState): ComposerButton {
  if (s.phase.kind === "cancelling") {
    return "cancelling";
  }
  if (s.phase.kind === "running" && !s.protocol.degraded) {
    return "stop";
  }
  return "send";
}

/**
 * Ligne d'état sous le fil. `progress` vient **exclusivement** du bridge
 * (`progress {label}`) ; à défaut, un libellé générique (P3 : jamais inventé à
 * partir du nom d'outil).
 */
export function turnStatusLine(s: AppState): string | null {
  if (s.progress) {
    return s.progress;
  }
  if (s.pendingSend) {
    return "sending…";
  }
  if (s.phase.kind === "cancelling") {
    return "stopping…";
  }
  if (s.phase.kind === "running" || s.phase.kind === "awaiting") {
    return "working…";
  }
  return null;
}

export function conversationId(s: AppState): string | null {
  const p = s.phase;
  return "conversationId" in p ? p.conversationId : null;
}

export function lastItem(s: AppState): ChatItem | undefined {
  return s.items[s.items.length - 1];
}
