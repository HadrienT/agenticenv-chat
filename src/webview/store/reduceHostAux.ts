import type { HostToWebview } from "../../messages";
import { appendItems } from "./reduceHelpers";
import type { AppState } from "./types";

/** Cas hôte→webview annexes, extraits de `reduceHost.ts` pour la limite de taille. */

/** `metrics` (C13) : jauge utile **avant** le premier tour + débit tokens/s. */
export function applyMetrics(
  state: AppState,
  msg: Extract<HostToWebview, { type: "metrics" }>,
): AppState {
  const usage = state.usage ?? {
    accumulatedCost: 0,
    promptTokens: 0,
    completionTokens: 0,
    contextWindow: 0,
    tokensPerSec: null,
  };
  return {
    ...state,
    usage: {
      ...usage,
      contextWindow: msg.contextWindow ?? usage.contextWindow,
      tokensPerSec: msg.tokensPerSec !== undefined ? msg.tokensPerSec : usage.tokensPerSec,
    },
  };
}

/**
 * `todo` (C09 §2) : état **complet** produit par l'agent (03-PROTOCOL §3.3),
 * remplacement jamais fusion. Le panneau s'ouvre au premier `todo` reçu, puis
 * suit le choix de l'utilisateur.
 */
export function applyTodo(
  state: AppState,
  msg: Extract<HostToWebview, { type: "todo" }>,
): AppState {
  const firstEver = state.todo === null;
  return {
    ...state,
    todo: msg.items,
    panels: firstEver ? { ...state.panels, todo: true } : state.panels,
  };
}

/** `hookResult` (C10) : ajoute un item « hook » au fil. */
export function applyHookResult(
  state: AppState,
  msg: Extract<HostToWebview, { type: "hookResult" }>,
  at: number,
): AppState {
  const next = appendItems(state, [
    { kind: "hook", id: `hook-${state.eventSeq}`, command: msg.command, ok: msg.ok, output: msg.output, ts: at },
  ]);
  return { ...next, eventSeq: state.eventSeq + 1 };
}
