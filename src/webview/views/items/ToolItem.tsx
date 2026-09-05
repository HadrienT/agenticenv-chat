import { useState } from "react";
import { observationText } from "../../render/truncate";
import type { ChatItem, ToolStatus } from "../../store/types";
import { OutputBlock } from "../OutputBlock";
import { safeJson } from "../util";
import { useThreadServices } from "../threadContext";
import { ThinkingItem } from "./ThinkingItem";

const STATUS_GLYPH: Record<ToolStatus, string> = { running: "⟳", ok: "✓", error: "✗" };
const STATUS_CLASS: Record<ToolStatus, string> = {
  running: "agx-tool__status",
  ok: "agx-tool__status agx-tool__status--ok",
  error: "agx-tool__status agx-tool__status--error",
};

/**
 * Ligne d'appel d'outil (action) ou d'observation (résultat). C05 remplace ce
 * rendu générique par un renderer par outil ; C02 y branche déjà le raisonnement
 * repliable, la troncature et les liens de fichiers.
 */
export function ToolItem(props: {
  item: Extract<ChatItem, { kind: "tool" | "observation" }>;
}): JSX.Element {
  const svc = useThreadServices();
  const [open, setOpen] = useState(false);
  const { item } = props;

  if (item.kind === "observation") {
    return (
      <div className="agx-tool">
        <span className="agx-tool__name">↳ {item.toolName}</span>
        <OutputBlock text={observationText(item.result)} />
      </div>
    );
  }

  return (
    <div className="agx-tool">
      <span className="agx-tool__name">▸ {item.toolName}</span>
      <span className={STATUS_CLASS[item.status]} aria-label={`status ${item.status}`}>
        {STATUS_GLYPH[item.status]}
        {item.statusLabel ? ` ${item.statusLabel}` : ""}
      </span>
      {item.thought ? <ThinkingItem text={item.thought} expanded={svc.expandThinking} /> : null}
      {item.args != null && (
        <>
          <button
            className="agx-btn agx-btn--small"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "hide args" : "args"}
          </button>
          {open && <pre className="agx-pre">{safeJson(item.args)}</pre>}
        </>
      )}
    </div>
  );
}
