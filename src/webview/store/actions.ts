import type { HostToWebview } from "../../messages";
import type { Notice, PanelId } from "./types";

/**
 * Intentions locales de la webview. Elles portent tout ce qui est impur (horloge,
 * identifiants) pour que `reduce` reste une fonction pure testable en Node.
 */
export type LocalAction =
  | { type: "composer/setDraft"; draft: string }
  | { type: "mcp/toggle"; name: string }
  | { type: "panel/toggle"; id: PanelId }
  | { type: "notice/push"; notice: Notice }
  | { type: "notice/dismiss"; id: string }
  | { type: "intent/startSession" }
  | { type: "intent/sendMessage" }
  | { type: "intent/confirm"; accept: boolean; at: number }
  | { type: "intent/cancelTurn" };

export type Action =
  | { source: "host"; message: HostToWebview; at: number }
  | { source: "local"; action: LocalAction };

/** `at` capture l'horloge au **bord impur** (l'App) pour garder `reduce` pure. */
export function host(message: HostToWebview, at: number = Date.now()): Action {
  return { source: "host", message, at };
}

export function local(action: LocalAction): Action {
  return { source: "local", action };
}
