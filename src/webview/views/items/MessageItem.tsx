import type { ChatItem } from "../../store/types";
import { RichText } from "../RichText";
import { Timestamp } from "../Timestamp";
import { useThreadServices } from "../threadContext";

/**
 * Bulle de message. L'assistant est rendu en markdown riche (C02) ; l'utilisateur
 * reste en texte pré-formaté. Horodatage discret au survol (item 33), pouces
 * 👍/👎 sur les réponses de l'assistant (item 34, journal local, aucune télémétrie).
 */
export function MessageItem(props: {
  item: Extract<ChatItem, { kind: "user" | "assistant" }>;
}): JSX.Element {
  const svc = useThreadServices();
  const { item } = props;

  if (item.kind === "user") {
    return (
      <div className="agx-bubble--user">
        <div className="agx-bubble__body">{item.text}</div>
        <Timestamp ts={item.ts} />
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
            <button
              className="agx-icon-btn"
              aria-label="Helpful"
              onClick={() => svc.onFeedback(item.id, "up")}
            >
              👍
            </button>
            <button
              className="agx-icon-btn"
              aria-label="Not helpful"
              onClick={() => svc.onFeedback(item.id, "down")}
            >
              👎
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
