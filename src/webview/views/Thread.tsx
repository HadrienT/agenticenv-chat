import { useEffect, useRef, useState } from "react";
import { assertNever } from "../../assertNever";
import type { ChatItem } from "../store/types";
import { ErrorItem } from "./items/ErrorItem";
import { MessageItem } from "./items/MessageItem";
import { ToolItem } from "./items/ToolItem";
import { ToolGroup } from "./ToolGroup";
import { UsedReferences } from "./UsedReferences";
import { groupRows } from "./threadGroups";
import { ThreadContext, type ThreadServices } from "./threadContext";

function renderItem(item: ChatItem, afterCount: number): JSX.Element {
  switch (item.kind) {
    case "user":
    case "assistant":
      return <MessageItem key={item.id} item={item} afterCount={afterCount} />;
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
    case "permission":
      return (
        <div key={item.id} className="agx-permline">
          {item.verdict === "allowed" ? "✓ auto-allowed" : "⛔ auto-denied"} — {item.summary}{" "}
          <span className="agx-permline__rule">by rule {item.rule}</span>
        </div>
      );
    case "hook":
      return (
        <div key={item.id} className="agx-tool">
          <span className="agx-tool__name">
            {item.ok ? "✓" : "✗"} hook: {item.command}
          </span>
          {item.output && <pre className="agx-output__pre">{item.output}</pre>}
        </div>
      );
    default:
      return assertNever(item, "ChatItem");
  }
}

/**
 * Liste du fil, ancrée en bas. Auto-scroll qui lâche le bas si l'utilisateur
 * remonte (bouton « ↓ new content », C01 §4). Outils consécutifs regroupés
 * (C05 §5). Sans virtualisation en C05 ; C14 virtualise.
 */
export function Thread(props: {
  items: ChatItem[];
  statusLine: string | null;
  idle: boolean;
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

  const rows = groupRows(props.items);

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
          {rows.map((row, i) =>
            row.kind === "single" ? (
              renderItem(row.item, props.items.length - props.items.indexOf(row.item) - 1)
            ) : (
              <ToolGroup
                key={`group-${row.items[0].id}-${i}`}
                family={row.family}
                items={row.items}
                hasError={row.hasError}
              />
            ),
          )}
          {props.idle && <UsedReferences items={props.items} />}
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
