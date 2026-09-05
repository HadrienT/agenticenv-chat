import { useEffect, type DependencyList } from "react";
import { savePersisted } from "../vscodeApi";
import type { PersistedState } from "./persist";

/** Sérialise l'état vers `webview.setState` à chaque changement (03-PROTOCOL §4). */
export function usePersist(snapshot: () => PersistedState, deps: DependencyList): void {
  useEffect(() => {
    savePersisted(snapshot());
  }, deps);
}
