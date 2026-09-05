/**
 * Barre au-dessus du fil : History, Export, et restauration de la version
 * précédente après une troncature (C08 §4–5). Le tooltip rappelle qu'une
 * troncature n'annule pas les fichiers écrits.
 */
export function ThreadBar(props: {
  branchCount: number;
  onHistory: () => void;
  onExport: () => void;
  onRestoreBranch: () => void;
}): JSX.Element {
  return (
    <div className="agx-threadbar">
      <button className="agx-code__btn" onClick={props.onHistory}>
        History
      </button>
      <button className="agx-code__btn" onClick={props.onExport}>
        Export
      </button>
      {props.branchCount > 0 && (
        <button
          className="agx-code__btn"
          onClick={props.onRestoreBranch}
          title="Truncating the thread does not revert files — use Undo turn for that"
        >
          Show previous version ({props.branchCount})
        </button>
      )}
    </div>
  );
}
