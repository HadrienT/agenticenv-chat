import type { SessionMode } from "../../../messages";
import type { BudgetStatus, ComposerButton } from "../../store/selectors";
import { BudgetMeter } from "./BudgetMeter";

/**
 * Pied du composer : sélecteur de mode Ask/Agent/Plan (C12 §3 — trois modes
 * réels, pas quatre dont un ment), ajout de contexte, budget, bouton principal.
 * Pendant un tour, une consigne peut être ajoutée (« Send note » — C09 §4).
 */
const MODES: { mode: SessionMode; label: string; title: string }[] = [
  { mode: "ask", label: "Ask", title: "Read and answer only — no writing, no running" },
  { mode: "agent", label: "Agent", title: "Full agent behaviour" },
  { mode: "plan", label: "Plan", title: "Explore and propose a plan, then approve it" },
];

export function ComposerFoot(props: {
  budget: BudgetStatus;
  button: ComposerButton;
  canSend: boolean;
  hasDraft: boolean;
  turnActive: boolean;
  sessionMode: SessionMode;
  modeSelectorAvailable: boolean;
  onPickContext: () => void;
  onSubmit: () => void;
  onStop: () => void;
  onForceNew: () => void;
  onSetMode: (mode: SessionMode) => void;
}): JSX.Element {
  return (
    <div className="agx-composer__foot">
      {props.modeSelectorAvailable && (
        <div className="agx-planseg" role="group" aria-label="Session mode">
          {MODES.map((m) => (
            <button
              key={m.mode}
              className={`agx-planseg__opt${props.sessionMode === m.mode ? " agx-planseg__opt--on" : ""}`}
              aria-pressed={props.sessionMode === m.mode}
              title={m.title}
              onClick={() => props.onSetMode(m.mode)}
            >
              {m.label}
            </button>
          ))}
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
