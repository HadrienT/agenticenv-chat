import { useState } from "react";
import type { ChatItem, ToolStatus } from "../../store/types";
import { safeJson } from "../util";

const STATUS_GLYPH: Record<ToolStatus, string> = { running: "⟳", ok: "✓", error: "✗" };
const STATUS_CLASS: Record<ToolStatus, string> = {
  running: "agx-tool__status",
  ok: "agx-tool__status agx-tool__status--ok",
  error: "agx-tool__status agx-tool__status--error",
};

/**
 * Ligne d'appel d'outil (action) ou d'observation (résultat). Repliable — le
 * `useState` local est de l'éphémère non observable, admis par 04-CONVENTIONS §2.
 * C05 remplace ce rendu générique par un renderer par outil.
 */
export function ToolItem(props: {
  item: Extract<ChatItem, { kind: "tool" | "observation" }>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const { item } = props;
  const isObservation = item.kind === "observation";
  const payload = isObservation ? item.result : item.args;
  const thought = item.kind === "tool" ? item.thought : "";

  return (
    <div className="agx-tool">
      <span className="agx-tool__name">
        {isObservation ? "↳ " : "▸ "}
        {item.toolName}
      </span>
      {item.kind === "tool" && (
        <span className={STATUS_CLASS[item.status]} aria-label={`status ${item.status}`}>
          {STATUS_GLYPH[item.status]}
        </span>
      )}
      {thought ? <div className="agx-tool__thought">{thought}</div> : null}
      {payload != null && (
        <>
          <button
            className="agx-btn agx-btn--small"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "hide" : isObservation ? "result" : "args"}
          </button>
          {open && <pre className="agx-pre">{safeJson(payload)}</pre>}
        </>
      )}
    </div>
  );
}
