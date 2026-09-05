import { useState } from "react";
import type { ChatItem } from "../../store/types";

/**
 * Marque de compaction (C13 §2, item 65). **Toujours visible** — une conversation
 * qui perd son passé sans le dire produit des réponses incohérentes. Le résumé
 * est **consultable** : l'utilisateur doit pouvoir vérifier ce qui a été retenu.
 */
export function CompactionItem(props: {
  item: Extract<ChatItem, { kind: "compaction" }>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="agx-compaction">
      <button className="agx-compaction__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} history compacted — {props.item.turns} turns summarized
      </button>
      {open && <pre className="agx-compaction__summary">{props.item.summary}</pre>}
    </div>
  );
}
