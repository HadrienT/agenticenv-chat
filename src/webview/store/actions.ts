import type { ContextChip, HostToWebview } from "../../messages";
import type { Notice, PanelId } from "./types";

/**
 * Intentions locales de la webview. Elles portent tout ce qui est impur (horloge,
 * identifiants) pour que `reduce` reste une fonction pure testable en Node.
 */
export type LocalAction =
  | { type: "composer/setDraft"; draft: string }
  | { type: "composer/addAttachment"; chip: ContextChip }
  | { type: "composer/removeAttachment"; index: number }
  | { type: "composer/clearAttachments" }
  | { type: "composer/dismissAuto"; refKey: string }
  | { type: "mcp/toggle"; name: string }
  | { type: "mode/select"; name: string | null }
  | { type: "panel/toggle"; id: PanelId }
  | { type: "notice/push"; notice: Notice }
  | { type: "notice/dismiss"; id: string }
  | { type: "intent/startSession" }
  | { type: "intent/sendMessage"; text: string }
  | { type: "intent/confirm"; accept: boolean; at: number }
  | { type: "intent/cancelTurn" }
  | { type: "thread/truncateFrom"; itemId: string; at: number }
  | { type: "thread/editMessage"; itemId: string; text: string; at: number }
  | { type: "thread/restoreBranch"; index: number };

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
