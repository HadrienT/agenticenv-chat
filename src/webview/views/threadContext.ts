import { createContext, useContext } from "react";
import type { CodeActions } from "./CodeBlock";

/**
 * Services que les items du fil consomment (ouvrir un fichier, agir sur un bloc
 * de code, noter une réponse). Évite de faire descendre 6 props à travers
 * `Thread` → `items/*`. Ce n'est ni de l'état ni un effet — admis en `views/`.
 */
export interface ThreadServices {
  sandboxRoot: string | null;
  editorAvailable: boolean;
  expandThinking: boolean;
  codeActions: CodeActions;
  onOpenFile: (path: string, line?: number) => void;
  onFeedback: (itemId: string, value: "up" | "down") => void;
}

const noop = (): void => undefined;

export const ThreadContext = createContext<ThreadServices>({
  sandboxRoot: null,
  editorAvailable: false,
  expandThinking: false,
  codeActions: { copy: noop, insert: noop, createFile: noop, runInTerminal: noop },
  onOpenFile: noop,
  onFeedback: noop,
});

export function useThreadServices(): ThreadServices {
  return useContext(ThreadContext);
}
