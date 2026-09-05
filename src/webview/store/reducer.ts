import type { Action } from "./actions";
import { applyHost } from "./reduceHost";
import { applyLocal } from "./reduceLocal";
import type { AppState } from "./types";

export { patchItem } from "./reduceHelpers";

/**
 * Réducteur **unique** et **pur** (01-ARCHITECTURE §3). Ne connaît ni React ni
 * `postMessage` — testé en Node pur. Les intentions sortantes passent par
 * `store/dispatch.ts`.
 *
 * Depuis C01, `idle ↔ running` est piloté **uniquement** par
 * `turn_started`/`turn_finished` (invariants I1–I6, tous actifs). Un bridge v1
 * bascule dans le repli `v1Fallback.ts`, signalé dans la bannière.
 */
export function reduce(state: AppState, action: Action): AppState {
  return action.source === "host"
    ? applyHost(state, action.message, action.at)
    : applyLocal(state, action.action);
}
