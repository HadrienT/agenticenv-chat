import type { UsageState } from "../store/types";
import { fmtCount } from "./util";

/**
 * Jauge de contexte / coût. En C00 elle est alimentée par `usage` en fin de tour
 * (comportement v1). C13 la branchera sur `context_stats` poussé pendant le tour.
 */
export function ContextGauge(props: { usage: UsageState }): JSX.Element {
  const { promptTokens, completionTokens, contextWindow, accumulatedCost } = props.usage;
  const pct = contextWindow > 0 ? Math.min(100, (promptTokens / contextWindow) * 100) : 0;
  return (
    <div className="agx-gauge">
      <div className="agx-gauge__head">
        <span>
          context: {fmtCount(promptTokens)}
          {contextWindow > 0 ? ` / ${fmtCount(contextWindow)}` : ""} · out {fmtCount(completionTokens)}
        </span>
        {accumulatedCost > 0 && <span>${accumulatedCost.toFixed(4)}</span>}
      </div>
      {contextWindow > 0 && (
        <div
          className="agx-gauge__track"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`agx-gauge__fill${pct > 85 ? " agx-gauge__fill--high" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
