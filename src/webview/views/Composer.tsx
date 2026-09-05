import { useEffect, useState } from "react";
import type { ComposerButton } from "../store/selectors";

/**
 * Zone de saisie + bouton principal (item 19). Le bouton Send devient **Stop**
 * dès `running` (jamais avant) ; un second clic en `cancelling` propose « Force
 * new session » — filet quand le bridge ne rend pas la main (C01 §3). Aucun
 * timeout automatique : un tour peut durer 20 min (primer §5).
 *
 * C03 ajoute chips de contexte, `/`-commandes, `#`-références.
 */
export function Composer(props: {
  draft: string;
  button: ComposerButton;
  canSend: boolean;
  connected: boolean;
  onDraft: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onForceNew: () => void;
}): JSX.Element {
  const [armedForceNew, setArmedForceNew] = useState(false);

  useEffect(() => {
    if (props.button !== "cancelling") {
      setArmedForceNew(false);
    }
  }, [props.button]);

  const submit = (): void => {
    if (props.canSend && props.draft.trim()) {
      props.onSend();
    }
  };

  if (props.button === "send") {
    return (
      <div className="agx-composer">
        <textarea
          className="agx-composer__input"
          placeholder={props.connected ? "Message the agent…" : "Not connected"}
          value={props.draft}
          disabled={!props.canSend}
          aria-label="Message the agent"
          onChange={(e) => props.onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="agx-btn" disabled={!props.canSend || !props.draft.trim()} onClick={submit}>
          Send
        </button>
      </div>
    );
  }

  return (
    <div className="agx-composer">
      <textarea
        className="agx-composer__input"
        placeholder="Agent is working…"
        value={props.draft}
        disabled
        aria-label="Message the agent"
        onChange={(e) => props.onDraft(e.target.value)}
      />
      {props.button === "stop" ? (
        <button className="agx-btn agx-btn--danger" onClick={props.onStop}>
          Stop
        </button>
      ) : armedForceNew ? (
        <button className="agx-btn agx-btn--danger" onClick={props.onForceNew}>
          Force new session
        </button>
      ) : (
        <button className="agx-btn agx-btn--danger" onClick={() => setArmedForceNew(true)}>
          Stopping…
        </button>
      )}
    </div>
  );
}
