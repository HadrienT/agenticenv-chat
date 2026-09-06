/** Types des notices (extrait de `types.ts` pour la limite de taille). */

export type NoticeLevel = "info" | "warn" | "error";

/**
 * Action attachée à une notice (C14 §3, item 109). Chaque erreur connue propose
 * au moins une action ou dit explicitement qu'il n'y en a pas.
 */
export type NoticeActionKind =
  | "retry"
  | "openComponents"
  | "openSettings"
  | "forceNewSession"
  | "copy"
  | "runInTerminal";

export interface NoticeAction {
  label: string;
  kind: NoticeActionKind;
  /** commande à copier / exécuter pour `copy` et `runInTerminal`. */
  payload?: string;
}

export interface Notice {
  id: string;
  level: NoticeLevel;
  text: string;
  dismissible: boolean;
  actions?: NoticeAction[];
  /** occurrences regroupées : « ×4 » au lieu d'empiler des notices identiques. */
  count?: number;
}
