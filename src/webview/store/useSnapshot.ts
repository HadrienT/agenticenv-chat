import { useEffect, useRef } from "react";
import { titleFor } from "./selectors";
import type { AppState } from "./types";

/**
 * Envoie une copie **durable** de la conversation à l'hôte (C08 §2 :
 * `storageUri/conversations/`), débouncée. Le `setState` léger reste géré par
 * `usePersist` ; celui-ci alimente l'archive complète.
 */
export function useSnapshot(
  state: AppState,
  send: (p: {
    items: unknown[];
    branches: unknown[];
    title: string | null;
    cost: number;
    promptTokens: number;
    completionTokens: number;
  }) => void,
): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (state.items.length === 0) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      send({
        items: state.items,
        branches: state.branches,
        title: titleFor(state),
        cost: state.usage?.accumulatedCost ?? 0,
        promptTokens: state.usage?.promptTokens ?? 0,
        completionTokens: state.usage?.completionTokens ?? 0,
      });
    }, 1500);
    return () => timer.current && clearTimeout(timer.current);
  }, [state, send]);
}
