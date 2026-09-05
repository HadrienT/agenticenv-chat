import type { BudgetStatus } from "../../store/selectors";
import { fmtCount } from "../util";

const LEVEL_CLASS: Record<BudgetStatus["level"], string> = {
  ok: "agx-budget",
  warn: "agx-budget agx-budget--warn",
  high: "agx-budget agx-budget--high",
  over: "agx-budget agx-budget--over",
};

/**
 * Estimation de contexte avant envoi (item 16). Aucune troncature automatique :
 * on informe, l'utilisateur décide (C03 §7).
 */
export function BudgetMeter(props: { status: BudgetStatus }): JSX.Element {
  const { bytes, ratio, level } = props.status;
  const tokens = Math.round(bytes / 4);
  return (
    <span className={LEVEL_CLASS[level]} title="Estimated context from attached chips">
      {fmtCount(tokens)} tok
      {ratio !== null && ` · ${Math.round(ratio * 100)}%`}
      {level === "high" && " — consider removing large chips"}
      {level === "over" && " — over the window; the bridge will truncate"}
    </span>
  );
}
