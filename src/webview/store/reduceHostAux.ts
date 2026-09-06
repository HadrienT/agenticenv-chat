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

/**
 * `models` (C12 §2) : liste + modèle courant. La `contextWindow` du modèle
 * courant alimente la jauge C13 **avant** le premier `usage`.
 */
export function applyModels(
  state: AppState,
  msg: Extract<HostToWebview, { type: "models" }>,
): AppState {
  const current = msg.models.find((m) => m.current);
  const prevId = state.models?.find((m) => m.current)?.id;
  let next: AppState = { ...state, models: msg.models };

  // Un changement de modèle est inscrit dans le fil (C12 §2) — il change
  // l'interprétation de tout ce qui suit.
  if (current && prevId && current.id !== prevId && current.state !== "loading") {
    next = appendItems(next, [
      { kind: "model-switch", id: `model-${state.eventSeq}`, model: current.label },
    ]);
    next = { ...next, eventSeq: state.eventSeq + 1 };
  }

  if (current && current.contextWindow > 0) {
    const usage = next.usage ?? {
      accumulatedCost: 0,
      promptTokens: 0,
      completionTokens: 0,
      contextWindow: 0,
      tokensPerSec: null,
    };
    next = { ...next, usage: { ...usage, contextWindow: current.contextWindow } };
  }
  return next;
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
