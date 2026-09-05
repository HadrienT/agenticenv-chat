import { useEffect, useRef, useState } from "react";
import { assertNever } from "../../assertNever";
import type { ChatItem } from "../store/types";
import { ErrorItem } from "./items/ErrorItem";
import { MessageItem } from "./items/MessageItem";
import { ToolItem } from "./items/ToolItem";
import { ThreadContext, type ThreadServices } from "./threadContext";

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
    case "turn-cancelled":
      return (
        <div key={item.id} className="agx-thinking">
          — turn ended —
        </div>
      );
    default:
      return assertNever(item, "ChatItem");
  }
}

/**
 * Liste du fil, ancrée en bas. L'auto-scroll suit le bas **sauf** si l'utilisateur
 * a scrollé vers le haut ; un bouton « ↓ new content » apparaît alors (C01 §4).
 * Sans virtualisation en C02 (jusqu'à 200 items) ; C14 virtualise.
 */
export function Thread(props: {
  items: ChatItem[];
  statusLine: string | null;
  services: ThreadServices;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (pinned.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setDetached(true);
    }
  }, [props.items, props.statusLine]);

  const toBottom = (): void => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      pinned.current = true;
      setDetached(false);
    }
  };

  return (
    <div className="agx-thread-wrap">
      <div
        className="agx-thread"
        ref={ref}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (pinned.current) {
            setDetached(false);
          }
        }}
      >
        <ThreadContext.Provider value={props.services}>
          {props.items.map(renderItem)}
        </ThreadContext.Provider>
        {props.statusLine && <div className="agx-thinking">{props.statusLine}</div>}
      </div>
      {detached && (
        <button className="agx-jump" onClick={toBottom}>
          ↓ new content
        </button>
      )}
    </div>
  );
}
