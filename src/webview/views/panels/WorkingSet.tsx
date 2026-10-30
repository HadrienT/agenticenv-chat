import { useState } from "react";
import type { FileDiffState, WorkingSetFile } from "../../store/types";
import { Diff } from "../Diff";

const BADGE: Record<string, string> = {
  A: "agx-file-badge agx-file-badge--added",
  ADDED: "agx-file-badge agx-file-badge--added",
  D: "agx-file-badge agx-file-badge--deleted",
  DELETED: "agx-file-badge agx-file-badge--deleted",
  M: "agx-file-badge agx-file-badge--updated",
  UPDATED: "agx-file-badge agx-file-badge--updated",
  MOVED: "agx-file-badge agx-file-badge--moved",
};

export interface WorkingSetProps {
  files: WorkingSetFile[];
  fileDiffs: Record<string, FileDiffState>;
  strategy: string;
  /** WP08d : working set = copie sandbox cumulée (pas « ce tour »). */
  viaBridge: boolean;
  onRequestDiff: (path: string) => void;
  onOpenFileDiff: (path: string) => void;
  onUndoTurn: () => void;
  onOpenAll: () => void;
  onBundleDiff: () => void;
}

/**
 * Fichiers modifiés (C06 §3 / WP08g) : un simple résumé, replié par défaut. Rien à
 * valider ici — le bridge écrit dans le vrai dépôt à chaque fin de tour, et `Undo
 * turn` défait le dernier tour dans la copie comme dans le dépôt.
 */
export function WorkingSet(props: WorkingSetProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (props.files.length === 0) {
    return null;
  }

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!props.fileDiffs[path]) {
          props.onRequestDiff(path);
        }
      }
      return next;
    });
  };

  const n = props.files.length;
  const heading = props.viaBridge
    ? `${n} file${n === 1 ? "" : "s"} changed this session`
    : `${n} file${n === 1 ? "" : "s"} changed by this turn`;

  return (
    <div className="agx-files">
      <div className="agx-files__head">
        <button className="agx-files__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} {heading}
        </button>
        <span className="agx-files__spacer" />
        {props.viaBridge && (
          <button className="agx-code__btn" onClick={props.onBundleDiff}>
            View all changes
          </button>
        )}
        <button className="agx-code__btn" onClick={props.onUndoTurn}>
          Undo turn
        </button>
        <button className="agx-code__btn" onClick={props.onOpenAll}>
          Open all
        </button>
      </div>
      <div className="agx-files__strategy">{props.strategy}</div>
      {open &&
        props.files.map((f) => {
          const diff = props.fileDiffs[f.path];
          return (
            <div key={f.path} className="agx-file-block">
              <div className="agx-file-row">
                <span className={BADGE[f.status] ?? "agx-file-badge"} aria-hidden="true">
                  {String(f.status)[0]}
                </span>
                <button className="agx-file-row__name" onClick={() => toggle(f.path)}>
                  {f.inProgress && "⟳ "}
                  {f.path}
                </button>
                {(f.added !== undefined || f.removed !== undefined) && (
                  <span className="agx-file-row__stat">
                    +{f.added ?? 0} −{f.removed ?? 0}
                  </span>
                )}
                {f.conflict && <span className="agx-tool__status--error"> conflict</span>}
                <button className="agx-code__btn" onClick={() => props.onOpenFileDiff(f.path)}>
                  diff
                </button>
              </div>
              {expanded.has(f.path) && diff && diff.unified && (
                <Diff unified={diff.unified} measured />
              )}
              {expanded.has(f.path) && diff && !diff.unified && (
                <div className="agx-files__strategy">{diff.error ?? "no diff"}</div>
              )}
            </div>
          );
        })}
    </div>
  );
}
