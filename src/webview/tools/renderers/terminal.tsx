import { OutputBlock } from "../../views/OutputBlock";
import { num, str, type ToolRenderer } from "../types";

/** `terminal` (OpenHands `TerminalTool`) — commande shell. */
export const terminalRenderer: ToolRenderer = {
  icon: "$",

  summary(call, obs) {
    const cmd = str(call.args?.command) ?? str((obs?.raw as Record<string, unknown>)?.command) ?? "";
    const exit = num((obs?.raw as Record<string, unknown>)?.exit_code);
    const oneLine = cmd.replace(/\s*\n\s*/g, " ⏎ ").trim();
    const shown = oneLine.length > 80 ? oneLine.slice(0, 79) + "…" : oneLine;
    return `$ ${shown}${exit !== undefined && exit !== 0 ? ` — exit ${exit}` : ""}`;
  },

  body(_call, obs) {
    if (!obs) {
      return null;
    }
    const exit = num((obs.raw as Record<string, unknown>)?.exit_code);
    return (
      <div>
        {exit !== undefined && (
          <div className={`agx-exit ${exit === 0 ? "agx-exit--ok" : "agx-exit--bad"}`}>
            exit code {exit}
          </div>
        )}
        <OutputBlock text={obs.text} />
      </div>
    );
  },

  defaultExpanded(_call, obs, status) {
    return status === "error" || obs?.error === true;
  },
};
