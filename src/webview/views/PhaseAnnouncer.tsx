import type { SessionPhase } from "../store/types";

/**
 * Annonce **une fois** par changement de phase pour les lecteurs d'écran
 * (C11 §6) — pas chaque delta, sinon la sortie devient inutilisable. L'attente
 * d'approbation est `assertive` (elle bloque le tour) ; le reste est `polite`.
 * Élément visuellement masqué mais lu.
 */
export function PhaseAnnouncer(props: { phase: SessionPhase }): JSX.Element {
  const kind = props.phase.kind;
  const message =
    kind === "running"
      ? "The agent is working."
      : kind === "awaiting"
        ? "The agent is waiting for your approval."
        : kind === "cancelling"
          ? "Stopping the turn."
          : kind === "idle"
            ? "Turn finished."
            : "";
  return (
    <div
      className="agx-sr-only"
      role="status"
      aria-live={kind === "awaiting" ? "assertive" : "polite"}
    >
      {message}
    </div>
  );
}
