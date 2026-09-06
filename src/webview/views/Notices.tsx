import type { Notice, NoticeAction } from "../store/notice";

const CLASS: Record<Notice["level"], string> = {
  info: "agx-notice",
  warn: "agx-notice agx-notice--warn",
  error: "agx-notice agx-notice--error",
};

/**
 * Notices actionnables (C14 §3, item 109). Chaque erreur porte au moins une
 * action ; les occurrences répétées sont regroupées (« ×4 »).
 */
export function Notices(props: {
  notices: Notice[];
  onDismiss: (id: string) => void;
  onAction: (action: NoticeAction) => void;
}): JSX.Element | null {
  if (props.notices.length === 0) {
    return null;
  }
  return (
    <div aria-live="polite">
      {props.notices.map((n) => (
        <div key={n.id} className={CLASS[n.level]}>
          <div className="agx-notice__row">
            <span className="agx-notice__text">
              {n.text}
              {n.count && n.count > 1 ? <span className="agx-notice__count"> ×{n.count}</span> : null}
            </span>
            {n.dismissible && (
              <button
                className="agx-notice__dismiss"
                aria-label="Dismiss notice"
                onClick={() => props.onDismiss(n.id)}
              >
                ✕
              </button>
            )}
          </div>
          {n.actions && n.actions.length > 0 && (
            <div className="agx-notice__actions">
              {n.actions.map((a) => (
                <button
                  key={a.kind + a.label}
                  className="agx-code__btn"
                  onClick={() => props.onAction(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
