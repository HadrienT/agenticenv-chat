import type { Notice } from "../store/types";

const CLASS: Record<Notice["level"], string> = {
  info: "agx-notice",
  warn: "agx-notice agx-notice--warn",
  error: "agx-notice agx-notice--error",
};

export function Notices(props: {
  notices: Notice[];
  onDismiss: (id: string) => void;
}): JSX.Element | null {
  if (props.notices.length === 0) {
    return null;
  }
  return (
    <div aria-live="polite">
      {props.notices.map((n) => (
        <div key={n.id} className={CLASS[n.level]}>
          <div className="agx-notice__row">
            <span className="agx-notice__text">{n.text}</span>
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
        </div>
      ))}
    </div>
  );
}
