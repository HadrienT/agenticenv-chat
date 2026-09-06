import { useState } from "react";
import type { ChatItem } from "../../store/types";
import { useThreadServices } from "../threadContext";

/**
 * Carte de continuation après un `turn_finished {reason: "max_iterations"}`
 * (C09 §5). Trois choix explicites ; « Continue » ne reformule **jamais** la
 * demande initiale, il envoie juste une continuation. Le cap lui-même est fixé
 * côté AgenticEnv — le client l'affiche, il ne le décide pas.
 */
export function MaxIterationsItem(props: {
  item: Extract<ChatItem, { kind: "max-iterations" }>;
}): JSX.Element {
  const svc = useThreadServices();
  const [withGuidance, setWithGuidance] = useState(false);
  const [text, setText] = useState("");

  if (props.item.resolved) {
    return <div className="agx-thinking">— continued past the step limit —</div>;
  }

  return (
    <div className="agx-maxiter">
      <p className="agx-maxiter__msg">The agent stopped after hitting its step limit without finishing.</p>
      {withGuidance ? (
        <div className="agx-maxiter__guidance">
          <textarea
            className="agx-composer__input"
            rows={2}
            autoFocus
            placeholder="What should it focus on to finish?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="agx-maxiter__row">
            <button
              className="agx-code__btn"
              disabled={!text.trim()}
              onClick={() => svc.onContinueAfterCap(props.item.id, text.trim())}
            >
              Send &amp; continue
            </button>
            <button className="agx-code__btn" onClick={() => setWithGuidance(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="agx-maxiter__row">
          <button className="agx-code__btn" onClick={() => svc.onContinueAfterCap(props.item.id)}>
            Continue
          </button>
          <button className="agx-code__btn" onClick={() => setWithGuidance(true)}>
            Continue with guidance…
          </button>
          <button className="agx-code__btn" onClick={() => svc.onStopAfterCap(props.item.id)}>
            Stop here
          </button>
        </div>
      )}
    </div>
  );
}
