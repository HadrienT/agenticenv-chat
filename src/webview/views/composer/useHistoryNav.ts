import { useState } from "react";

/**
 * Historique des prompts (item 9) : `↑` sur un champ **vide** rappelle le
 * précédent, `↓` redescend. Ne détruit jamais un brouillon (déclenché seulement
 * sur `draft === ""` ou en cours de navigation).
 */
export function useHistoryNav(
  history: string[],
  draft: string,
  setDraft: (v: string) => void,
): {
  reset: () => void;
  handle: (key: string) => boolean;
} {
  const [cursor, setCursor] = useState<number | null>(null);

  const handle = (key: string): boolean => {
    if (key === "ArrowUp" && (draft === "" || cursor !== null) && history.length) {
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setDraft(history[next]);
      return true;
    }
    if (key === "ArrowDown" && cursor !== null) {
      const next = cursor + 1;
      if (next >= history.length) {
        setCursor(null);
        setDraft("");
      } else {
        setCursor(next);
        setDraft(history[next]);
      }
      return true;
    }
    return false;
  };

  return { reset: () => setCursor(null), handle };
}
