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
 * Routeurs exhaustifs : `applyHost` (messages hôte + fil bridge) et `applyLocal`
 * (intentions), chacun clos par `assertNever`. Invariants testés dans
 * `test/unit/reducer.test.ts` — I2/I3/I6 restent en `todo` jusqu'à C01, où la fin
 * de tour cesse d'être l'heuristique v1 (`legacyInferTurnEnd`).
 */
export function reduce(state: AppState, action: Action): AppState {
  return action.source === "host"
    ? applyHost(state, action.message)
    : applyLocal(state, action.action);
}
