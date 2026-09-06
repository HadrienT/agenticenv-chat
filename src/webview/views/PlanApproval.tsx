import { useState } from "react";
import type { Actions } from "../store/dispatch";
import type { AppState } from "../store/types";

/**
 * Écran d'approbation en fin de tour Plan (C09 §3). Le mode plan force
 * `readOnly` côté client — l'agent a exploré sans écrire. Trois choix :
 * lancer, éditer le plan (renvoyé comme message d'approbation), continuer à
 * planifier. Rien n'est imposé.
 */
export function PlanApproval(props: { state: AppState; actions: Actions }): JSX.Element | null {
  const { state, actions } = props;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const last = state.items[state.items.length - 1];
  const ready =
    state.planMode &&
    state.phase.kind === "idle" &&
    last?.kind === "assistant" &&
    !last.streaming &&
    last.text.trim().length > 0;
  if (!ready || dismissedFor === last.id) {
    return null;
  }

  const planText = last.text;
  return (
    <div className="agx-planapproval">
      <span className="agx-planapproval__msg">The agent finished planning.</span>
      <div className="agx-planapproval__row">
        <button
          className="agx-btn"
          onClick={() => {
            actions.setPlanMode(false);
            actions.sendMessage("Proceed with the plan above and implement it.", []);
          }}
        >
          Approve &amp; run
        </button>
        <button className="agx-code__btn" onClick={() => actions.setDraft(planText)}>
          Edit plan
        </button>
        <button className="agx-code__btn" onClick={() => setDismissedFor(last.id)}>
          Keep planning
        </button>
      </div>
    </div>
  );
}
