import type { WorkingSetFile } from "../../store/types";

const BADGE: Record<WorkingSetFile["status"], string> = {
  ADDED: "agx-file-badge agx-file-badge--added",
  DELETED: "agx-file-badge agx-file-badge--deleted",
  UPDATED: "agx-file-badge agx-file-badge--updated",
  MOVED: "agx-file-badge agx-file-badge--moved",
};

/**
 * Fichiers modifiés par l'agent dans le sandbox. En C00 : liste cliquable qui
 * ouvre un diff. C06 y ajoute checkpoints, actions par hunk, restauration.
 */
export function WorkingSet(props: {
  files: WorkingSetFile[];
  onOpen: (path: string) => void;
}): JSX.Element | null {
  if (props.files.length === 0) {
    return null;
  }
  return (
    <div className="agx-files">
      <div className="agx-files__head">
        {props.files.length} changed file{props.files.length === 1 ? "" : "s"}
      </div>
      {props.files.map((f) => (
        <button key={f.path} className="agx-file-row" onClick={() => props.onOpen(f.path)}>
          <span className={BADGE[f.status]} aria-hidden="true">
            {f.status[0]}
          </span>
          <span>{f.path}</span>
        </button>
      ))}
    </div>
  );
}
