import type { ConversationItem } from "./protocol";

export interface ConversationPick {
  label: string;
  description: string;
  item: ConversationItem;
}

/** Entrées du sélecteur de conversations, dans l'ordre du bridge. */
export function conversationPicks(items: ConversationItem[]): ConversationPick[] {
  return items.map((item) => ({
    label: `${item.active ? "$(check) " : ""}${item.title ?? "(untitled)"}`,
    description: `${new Date(item.updated_at).toLocaleString()} · ${item.turns} turns`,
    item,
  }));
}
