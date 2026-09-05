import { useState } from "react";
import type { ChatItem } from "../../store/types";
import { RichText } from "../RichText";
import { Timestamp } from "../Timestamp";
import { useThreadServices } from "../threadContext";

/**
 * Bulle de message. L'assistant est rendu en markdown riche (C02) ; l'utilisateur
 * reste en texte pré-formaté avec, au survol, Edit / Regenerate / Truncate
 * (C08 §4). Horodatage discret (item 33), pouces 👍/👎 (item 34).
 */
export function MessageItem(props: {
  item: Extract<ChatItem, { kind: "user" | "assistant" }>;
  afterCount: number;
}): JSX.Element {
  const svc = useThreadServices();
  const { item } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.kind === "user" ? item.text : "");

  if (item.kind === "user") {
    if (editing) {
      return (
        <div className="agx-bubble--user">
          <textarea
            className="agx-composer__input"
            value={text}
            aria-label="Edit message"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="agx-msg__foot agx-msg__foot--visible">
            <button
              className="agx-code__btn"
              onClick={() => {
                setEditing(false);
                svc.onEditMessage(item.id, text.trim());
              }}
            >
              Resend
            </button>
            <button className="agx-code__btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="agx-bubble--user">
        <div className="agx-bubble__body">{item.text}</div>
        <div className="agx-msg__foot">
          <Timestamp ts={item.ts} />
          {svc.canEditThread && (
            <>
              <button className="agx-icon-btn" aria-label="Edit and resend" onClick={() => setEditing(true)}>
                ✎
              </button>
              <button
                className="agx-icon-btn"
                aria-label="Regenerate from here"
                onClick={() => svc.onRegenerate(item.id, item.text)}
              >
                ↻
              </button>
              <button
                className="agx-icon-btn"
                aria-label="Truncate from here"
                onClick={() => svc.onTruncate(item.id, props.afterCount + 1)}
              >
                ✂
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="agx-msg--assistant" data-streaming={item.streaming || undefined}>
      <RichText
        text={item.text}
        incomplete={item.streaming}
        sandboxRoot={svc.sandboxRoot}
        editorAvailable={svc.editorAvailable}
        codeActions={svc.codeActions}
        onOpenFile={svc.onOpenFile}
      />
      {!item.streaming && (
        <div className="agx-msg__foot">
          <Timestamp ts={item.ts} />
          <span className="agx-msg__feedback">
            <button className="agx-icon-btn" aria-label="Helpful" onClick={() => svc.onFeedback(item.id, "up")}>
              👍
            </button>
            <button className="agx-icon-btn" aria-label="Not helpful" onClick={() => svc.onFeedback(item.id, "down")}>
              👎
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
