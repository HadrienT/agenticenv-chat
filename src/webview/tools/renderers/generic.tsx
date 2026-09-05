import { highlightCode } from "../../render/highlight";
import { OutputBlock } from "../../views/OutputBlock";
import type { ToolRenderer } from "../types";

/**
 * Repli générique (C05 §4) : lisible pour tout outil sans renderer dédié, y
 * compris les outils MCP. JSON formaté et colorié ; les chaînes très longues
 * sont abrégées. L'entête affiche le nom nu ; les args complets sont en tooltip
 * (géré par `ToolItem`).
 */
export const genericRenderer: ToolRenderer = {
  icon: "▸",

  summary(call) {
    const a = call.args ?? {};
    const hint =
      typeof a.query === "string"
        ? ` "${clip(a.query)}"`
        : typeof a.path === "string"
          ? ` ${clip(a.path)}`
          : "";
    return `${call.toolName}${hint}`;
  },

  body(call, obs) {
    const argsJson = format(call.args ?? {});
    return (
      <div>
        <div className="agx-generic__label">args</div>
        <pre
          className="agx-code__pre"
          dangerouslySetInnerHTML={{ __html: highlightCode(argsJson, "json") }}
        />
        {obs && (
          <>
            <div className="agx-generic__label">result</div>
            {typeof obs.raw === "string" ? (
              <OutputBlock text={obs.raw} />
            ) : (
              <pre
                className="agx-code__pre"
                dangerouslySetInnerHTML={{ __html: highlightCode(format(obs.raw), "json") }}
              />
            )}
          </>
        )}
      </div>
    );
  },

  defaultExpanded(_call, obs, status) {
    return status === "error" || obs?.error === true;
  },
};

/** JSON 2 espaces, chaînes > 500 caractères abrégées. */
function format(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (typeof v === "string" && v.length > 500 ? v.slice(0, 500) + `… (+${v.length - 500} chars)` : v),
    2,
  );
}

function clip(s: string): string {
  return s.length > 48 ? s.slice(0, 47) + "…" : s;
}
