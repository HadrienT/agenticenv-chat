import { useState } from "react";
import type { ChatItem } from "../store/types";
import { groupLabel } from "./threadGroups";
import { ToolItem } from "./items/ToolItem";

/**
 * Groupe d'outils consécutifs (C05 §5), replié par défaut sauf s'il contient une
 * erreur. Le dernier outil d'un groupe encore en cours reste visible.
 */
export function ToolGroup(props: {
  family: string;
  items: Extract<ChatItem, { kind: "tool" }>[];
  hasError: boolean;
}): JSX.Element {
  const running = props.items.some((t) => t.status === "running");
  const [open, setOpen] = useState(props.hasError || running);

  const visible = open ? props.items : running ? props.items.slice(-1) : [];

  return (
    <div className="agx-toolgroup">
      <button
        className="agx-toolgroup__head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>{" "}
        {groupLabel(props.family, props.items.length)}
        {props.hasError && <span className="agx-tool__status--error"> · error</span>}
      </button>
      <div className="agx-toolgroup__body">
        {visible.map((item) => (
          <ToolItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
