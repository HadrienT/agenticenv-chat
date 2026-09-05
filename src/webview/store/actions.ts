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
  | { type: "intent/sendMessage"; at: number }
  | { type: "intent/confirm"; accept: boolean; at: number };

export type Action =
  | { source: "host"; message: HostToWebview }
  | { source: "local"; action: LocalAction };

export function host(message: HostToWebview): Action {
  return { source: "host", message };
}

export function local(action: LocalAction): Action {
  return { source: "local", action };
}
