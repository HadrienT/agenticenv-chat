/**
 * Carte d'approbation. En C00 elle reste au niveau v1 : le bridge n'envoie pas
 * encore le détail de l'action (`pending_action`). C07 l'enrichit (commande,
 * diff, « toujours autoriser »).
 */
export function ConfirmCard(props: { onAnswer: (accept: boolean) => void }): JSX.Element {
  return (
    <div className="agx-confirm">
      <div>The agent wants to run an action flagged as risky. Allow it?</div>
      <div className="agx-confirm__actions">
        <button className="agx-btn" onClick={() => props.onAnswer(true)}>
          Allow
        </button>
        <button className="agx-btn agx-btn--danger" onClick={() => props.onAnswer(false)}>
          Reject
        </button>
      </div>
    </div>
  );
}
