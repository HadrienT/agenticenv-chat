import { useState } from "react";
import { observationText } from "../../render/truncate";
import type { ChatItem, ToolStatus } from "../../store/types";
import { rendererFor } from "../../tools/registry";
import type { ToolObs } from "../../tools/types";
import { safeJson } from "../util";
import { useThreadServices } from "../threadContext";
import { OutputBlock } from "../OutputBlock";
import { ThinkingItem } from "./ThinkingItem";

const STATUS_GLYPH: Record<ToolStatus, string> = { running: "⟳", ok: "✓", error: "✗" };
const STATUS_CLASS: Record<ToolStatus, string> = {
  running: "agx-tool__status",
  ok: "agx-tool__status agx-tool__status--ok",
  error: "agx-tool__status agx-tool__status--error",
};

/**
 * Un seul item pour l'action **et** son observation (C05 §3), rendu via le
 * registre `tools/`. Le corps est déplié d'office sur erreur. Le `useState` local
 * (ouvert/fermé) est de l'éphémère non observable.
 */
export function ToolItem(props: {
  item: Extract<ChatItem, { kind: "tool" | "observation" }>;
}): JSX.Element {
  const svc = useThreadServices();
  const { item } = props;

  if (item.kind === "observation") {
    // Observation orpheline (aucune action connue) — jamais perdue.
    return (
      <div className="agx-tool">
        <span className="agx-tool__name">↳ {item.toolName}</span>
        <OutputBlock text={observationText(item.result)} />
      </div>
    );
  }

  const renderer = rendererFor(item.toolName);
  const call = { toolName: item.toolName, args: item.args, thought: item.thought };
  const obs: ToolObs | null =
    item.observation !== undefined
      ? { raw: item.observation, text: observationText(item.observation), error: item.observationError === true }
      : null;

  const forceOpen = renderer.defaultExpanded?.(call, obs, item.status) ?? item.status === "error";
  const [open, setOpen] = useState(forceOpen);
  const hasBody = renderer.body !== undefined || obs !== null || item.args !== undefined;

  return (
    <div className={`agx-tool${item.status === "error" ? " agx-tool--error" : ""}`}>
      <div className="agx-tool__head" title={item.args ? safeJson(item.args) : undefined}>
        <span className="agx-tool__icon" aria-hidden="true">
          {renderer.icon}
        </span>
        {hasBody ? (
          <button
            className="agx-tool__summary agx-tool__summary--btn"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {renderer.summary(call, obs)}
          </button>
        ) : (
          <span className="agx-tool__summary">{renderer.summary(call, obs)}</span>
        )}
        <span
          className={STATUS_CLASS[item.status]}
          aria-label={`status ${item.status}`}
        >
          {STATUS_GLYPH[item.status]}
          {item.statusLabel ? ` ${item.statusLabel}` : ""}
        </span>
      </div>
      {item.thought ? <ThinkingItem text={item.thought} expanded={svc.expandThinking} /> : null}
      {open && hasBody && (
        <div className="agx-tool__body">
          {renderer.body
            ? renderer.body(call, obs, { sandboxRoot: svc.sandboxRoot, onOpenFile: svc.onOpenFile })
            : fallbackBody(item.args, obs)}
        </div>
      )}
    </div>
  );
}

function fallbackBody(args: unknown, obs: ToolObs | null): JSX.Element {
  return (
    <>
      {args !== undefined && <pre className="agx-pre">{safeJson(args)}</pre>}
      {obs && <OutputBlock text={obs.text} />}
    </>
  );
}
