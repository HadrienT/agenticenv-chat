import type { UsageState } from "../store/types";
import { fmtCount } from "./util";

/**
 * Jauge de contexte + coût (item 115, C13 §1). Visible **dès qu'on connaît la
 * fenêtre**, avant le premier tour. Trois zones : < 60 % neutre, 60–85 %
 * avertissement, > 85 % alerte — et à > 85 % trois options concrètes, aucune
 * imposée (§2). Le débit tokens/s (§5) dit si la machine est saine.
 */
export function ContextGauge(props: {
  usage: UsageState;
  attachedBytes: number;
  canCompact: boolean;
  compacted: boolean;
  onCompact: () => void;
  onNewSession: () => void;
}): JSX.Element {
  const { promptTokens, completionTokens, contextWindow, accumulatedCost, tokensPerSec } = props.usage;
  const attachedTokens = Math.round(props.attachedBytes / 4);
  const usedTokens = promptTokens || attachedTokens;
  const pct = contextWindow > 0 ? Math.min(100, (usedTokens / contextWindow) * 100) : 0;
  const zone = pct > 85 ? "alert" : pct >= 60 ? "warn" : "ok";

  return (
    <div className={`agx-gauge agx-gauge--${zone}`}>
      <div className="agx-gauge__head">
        <span title={breakdown(promptTokens, attachedTokens, contextWindow)}>
          {fmtCount(usedTokens)}
          {contextWindow > 0 ? ` / ${fmtCount(contextWindow)} · ${Math.round(pct)}%` : ""}
          {completionTokens > 0 ? ` · out ${fmtCount(completionTokens)}` : ""}
        </span>
        <span>
          {tokensPerSec ? `${tokensPerSec.toFixed(1)} tok/s` : ""}
          {accumulatedCost > 0 ? ` · $${accumulatedCost.toFixed(4)}` : ""}
        </span>
      </div>
      {contextWindow > 0 && (
        <div className="agx-gauge__track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`agx-gauge__fill${zone === "alert" ? " agx-gauge__fill--high" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {props.compacted && <div className="agx-gauge__note">history was compacted</div>}
      {zone === "alert" && (
        <div className="agx-gauge__options">
          Context is nearly full:
          <span className="agx-gauge__opt">remove chips</span>
          {props.canCompact && (
            <button className="agx-code__btn" onClick={props.onCompact}>
              /compact
            </button>
          )}
          <button className="agx-code__btn" onClick={props.onNewSession}>
            new session
          </button>
        </div>
      )}
    </div>
  );
}

function breakdown(prompt: number, attached: number, window: number): string {
  const history = Math.max(0, prompt - attached);
  return [
    `context window: ${window || "unknown"}`,
    `attached (chips + instructions): ~${attached}`,
    `history + last message: ~${history}`,
  ].join("\n");
}
