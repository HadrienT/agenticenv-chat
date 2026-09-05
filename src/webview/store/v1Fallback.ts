import type { Outbound } from "../../protocol";

/**
 * Repli dégradé **bridge v1** uniquement (`state.protocol.degraded === true`).
 *
 * Un bridge v1 n'a pas de frontière de tour (`turn_started`/`turn_finished`) : la
 * seule information de fin disponible est `files_changed` ou `usage`. C'est
 * imprécis (un tour sans écriture ne se termine jamais ; un `usage` de milieu de
 * tour coupe trop tôt) — d'où la bannière « protocol v1 — Stop et diffs
 * indisponibles ».
 *
 * Sur un bridge v2 cette fonction n'est **jamais** appelée : la fin de tour vient
 * exclusivement de `turn_finished` (invariant I1, P3 du primer).
 */
export function v1FallbackTurnEnd(msg: Outbound): boolean {
  return msg.type === "files_changed" || msg.type === "usage";
}
