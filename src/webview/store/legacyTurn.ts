import type { Outbound } from "../../protocol";

/**
 * @deprecated Heuristique v1 : la fin d'un tour est **devinée** sur
 * `files_changed` OU `usage`. C'est faux dans les deux sens — un tour qui
 * n'écrit aucun fichier laisse le spinner à vie, et un `usage` poussé en milieu
 * de tour le coupe trop tôt. Viole P3 du primer.
 *
 * Isolée ici pour que C01 supprime **une** fonction (en la remplaçant par
 * `turn_started`/`turn_finished`) au lieu de démêler trois `useState`.
 * **Ne pas étendre.**
 */
export function legacyInferTurnEnd(msg: Outbound): boolean {
  return msg.type === "files_changed" || msg.type === "usage";
}
