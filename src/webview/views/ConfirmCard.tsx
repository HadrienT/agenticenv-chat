import { useState } from "react";
import type { PendingActionView } from "../../messages";
import { Diff } from "./Diff";

export interface ConfirmDecision {
  accept: boolean;
  remember?: "session" | "workspace";
  editedCommand?: string;
}

/**
 * Carte d'approbation **informative** (C07 §1). Montre l'action exacte, ou avoue
 * quand le bridge ne l'a pas fournie. Le focus initial est sur **Reject** : on ne
 * fait pas de l'autorisation le geste par défaut. Aucun timeout.
 */
export function ConfirmCard(props: {
  pending: PendingActionView | null;
  onAnswer: (d: ConfirmDecision) => void;
}): JSX.Element {
  const p = props.pending;
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(p?.command ?? "");
  const [scope, setScope] = useState(false);

  return (
    <div className="agx-confirm">
      <div className="agx-confirm__title">
        ⚠ The agent wants to {verb(p)}
      </div>

      {!p || p.blind ? (
        <div className="agx-confirm__blind">
          The bridge did not say which action — approve blindly, or reject.
        </div>
      ) : (
        <div className="agx-confirm__body">
          {p.kind === "command" && (
            <>
              {editing ? (
                <textarea
                  className="agx-composer__input"
                  value={edited}
                  aria-label="Edit command"
                  onChange={(e) => setEdited(e.target.value)}
                />
              ) : (
                <pre className="agx-confirm__cmd">$ {p.command}</pre>
              )}
              {p.cwd && <div className="agx-confirm__cwd">in {p.cwd}</div>}
            </>
          )}
          {p.kind === "edit" && p.path && <div className="agx-confirm__cwd">edits {p.path}</div>}
          {p.kind === "edit" && p.diff && <Diff unified={p.diff} measured />}
          {p.kind === "network" && p.path && <div className="agx-confirm__cwd">→ {p.path}</div>}
          {p.kind === "other" && <div>{p.summary}</div>}
          {p.warnings.map((w) => (
            <div key={w.pattern} className="agx-confirm__warn">
              ⛔ {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="agx-confirm__actions">
        <button
          className="agx-btn agx-btn--danger"
          autoFocus
          onClick={() => props.onAnswer({ accept: false })}
        >
          Reject
        </button>
        <button
          className="agx-btn"
          onClick={() =>
            props.onAnswer({ accept: true, editedCommand: editing ? edited : undefined })
          }
        >
          Allow once
        </button>
        {!scope ? (
          <button className="agx-btn" disabled={!p || p.blind} onClick={() => setScope(true)}>
            Allow always…
          </button>
        ) : (
          <>
            <button
              className="agx-btn"
              onClick={() => props.onAnswer({ accept: true, remember: "session" })}
            >
              this session
            </button>
            <button
              className="agx-btn"
              onClick={() => props.onAnswer({ accept: true, remember: "workspace" })}
            >
              this folder
            </button>
          </>
        )}
        {p?.kind === "command" && !editing && (
          <button className="agx-btn" onClick={() => setEditing(true)}>
            Edit…
          </button>
        )}
      </div>
    </div>
  );
}

function verb(p: PendingActionView | null): string {
  if (!p) {
    return "run an action";
  }
  return p.kind === "command"
    ? "run a command"
    : p.kind === "edit"
      ? "edit a file"
      : p.kind === "network"
        ? "make a network request"
        : "run an action";
}
