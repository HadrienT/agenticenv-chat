import type { BudgetStatus, ComposerButton } from "../../store/selectors";
import { BudgetMeter } from "./BudgetMeter";

/**
 * Pied du composer : sélecteur Plan/Agent (C09 §3), ajout de contexte, budget,
 * bouton principal. Pendant un tour, une consigne peut être ajoutée
 * (« Send note » — interruption, C09 §4) et l'arrêt reste un bouton distinct.
 */
export function ComposerFoot(props: {
  budget: BudgetStatus;
  button: ComposerButton;
  canSend: boolean;
  hasDraft: boolean;
  turnActive: boolean;
  planMode: boolean;
  planToggleAvailable: boolean;
  onPickContext: () => void;
  onSubmit: () => void;
  onStop: () => void;
  onForceNew: () => void;
  onTogglePlan: (enabled: boolean) => void;
}): JSX.Element {
  return (
    <div className="agx-composer__foot">
      {props.planToggleAvailable && (
        <div className="agx-planseg" role="group" aria-label="Session mode">
          <button
            className={`agx-planseg__opt${props.planMode ? " agx-planseg__opt--on" : ""}`}
            aria-pressed={props.planMode}
            title="Explore and propose without writing or running anything"
            onClick={() => props.onTogglePlan(true)}
          >
            Plan
          </button>
          <button
            className={`agx-planseg__opt${!props.planMode ? " agx-planseg__opt--on" : ""}`}
            aria-pressed={!props.planMode}
            onClick={() => props.onTogglePlan(false)}
          >
            Agent
          </button>
        </div>
      )}
      <button className="agx-icon-btn" aria-label="Add context" title="Add context" onClick={props.onPickContext}>
        ＋
      </button>
      <BudgetMeter status={props.budget} />
      {props.turnActive && (
        <button
          className="agx-btn"
          disabled={!props.hasDraft}
          title="Add a note to the running turn without interrupting it"
          onClick={props.onSubmit}
        >
          Send note
        </button>
      )}
      {props.button === "stop" && (
        <button className="agx-btn agx-btn--danger" onClick={props.onStop}>
          Stop
        </button>
      )}
      {props.button === "cancelling" && (
        <button className="agx-btn agx-btn--danger" onClick={props.onForceNew}>
          Force new session
        </button>
      )}
      {props.button === "send" && !props.turnActive && (
        <button className="agx-btn" disabled={!props.canSend || !props.hasDraft} onClick={props.onSubmit}>
          Send
        </button>
      )}
    </div>
  );
}
