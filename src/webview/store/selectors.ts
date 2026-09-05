import type { ContextChip } from "../../messages";
import type { AppState, ChatItem } from "./types";
import { refKey } from "./composerHelpers";

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

/** Chips qui partiront réellement : explicites + auto non retirées, dédupliquées. */
export function effectiveAttachments(s: AppState): { chip: ContextChip; auto: boolean }[] {
  const seen = new Set(s.composer.attachments.map((a) => refKey(a.ref)));
  const explicit = s.composer.attachments.map((chip) => ({ chip, auto: false }));
  const auto = s.autoContext
    .filter((c) => !s.dismissedAuto.includes(refKey(c.ref)) && !seen.has(refKey(c.ref)))
    .map((chip) => ({ chip, auto: true }));
  return [...explicit, ...auto];
}

export interface BudgetStatus {
  bytes: number;
  windowBytes: number | null;
  ratio: number | null;
  level: "ok" | "warn" | "high" | "over";
}

/** ~4 octets par token (approximation UTF-8 courante pour du code). */
const BYTES_PER_TOKEN = 4;

export function budgetStatus(s: AppState): BudgetStatus {
  const bytes = effectiveAttachments(s).reduce((n, a) => n + (a.chip.estBytes || 0), 0);
  const windowBytes = s.usage?.contextWindow ? s.usage.contextWindow * BYTES_PER_TOKEN : null;
  const ratio = windowBytes ? bytes / windowBytes : null;
  const level: BudgetStatus["level"] =
    ratio === null || ratio < 0.5
      ? "ok"
      : ratio < 0.8
        ? "warn"
        : ratio <= 1
          ? "high"
          : "over";
  return { bytes, windowBytes, ratio, level };
}

export function composerPlaceholder(s: AppState): string {
  if (s.connection.state !== "open") {
    return "Not connected";
  }
  if (s.phase.kind === "running" || s.phase.kind === "cancelling") {
    return "Add a note while it works…";
  }
  return "Message the agent…";
}
