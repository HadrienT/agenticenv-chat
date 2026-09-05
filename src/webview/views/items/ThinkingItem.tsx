import { useState } from "react";
import { renderInline } from "../../render/markdownRender";

/**
 * Bloc de raisonnement, replié par défaut (item 32). Réglage
 * `agenticenvChat.thread.expandThinking` pour l'ouvrir d'office.
 */
export function ThinkingItem(props: { text: string; expanded: boolean }): JSX.Element | null {
  const [open, setOpen] = useState(props.expanded);
  if (!props.text.trim()) {
    return null;
  }
  return (
    <div className="agx-thinking-block">
      <button className="agx-thinking-block__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Thought
      </button>
      {open && (
        <div
          className="agx-thinking-block__body"
          dangerouslySetInnerHTML={{ __html: renderInline(props.text) }}
        />
      )}
    </div>
  );
}
