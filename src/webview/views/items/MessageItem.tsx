import type { ChatItem } from "../../store/types";

/**
 * Bulle de message. En C00 le texte est rendu brut (`white-space: pre-wrap`).
 * C02 remplace le corps par `render/Markdown.tsx` (assaini, streaming-safe).
 */
export function MessageItem(props: {
  item: Extract<ChatItem, { kind: "user" | "assistant" }>;
}): JSX.Element {
  const { item } = props;
  return (
    <div className={item.kind === "user" ? "agx-bubble--user" : "agx-msg--assistant"}>
      {item.text}
    </div>
  );
}
