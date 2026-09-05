import { useEffect, useRef } from "react";
import { assertNever } from "../../assertNever";
import type { ChatItem } from "../store/types";
import { ErrorItem } from "./items/ErrorItem";
import { MessageItem } from "./items/MessageItem";
import { ToolItem } from "./items/ToolItem";

function renderItem(item: ChatItem): JSX.Element {
  switch (item.kind) {
    case "user":
    case "assistant":
      return <MessageItem key={item.id} item={item} />;
    case "tool":
    case "observation":
      return <ToolItem key={item.id} item={item} />;
    case "error":
      return <ErrorItem key={item.id} item={item} />;
    default:
      return assertNever(item, "ChatItem");
  }
}

/**
 * Liste du fil, ancrée en bas. En C00 sans virtualisation (jusqu'à 200 items,
 * 04-CONVENTIONS §6) ; C14 virtualise. L'auto-scroll suit le bas tant que
 * l'utilisateur n'a pas scrollé vers le haut (item 20, affiné en C01).
 */
export function Thread(props: { items: ChatItem[]; working: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.items, props.working]);

  return (
    <div
      className="agx-thread"
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {props.items.map(renderItem)}
      {props.working && <div className="agx-thinking">agent is working…</div>}
    </div>
  );
}
