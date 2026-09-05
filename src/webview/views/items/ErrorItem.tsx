import type { ChatItem } from "../../store/types";

export function ErrorItem(props: {
  item: Extract<ChatItem, { kind: "error" }>;
}): JSX.Element {
  return <div className="agx-error-item">{props.item.text}</div>;
}
