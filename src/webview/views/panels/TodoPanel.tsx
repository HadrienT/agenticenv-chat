import type { TodoItemView } from "../../../messages";

const GLYPH: Record<TodoItemView["state"], string> = {
  done: "✓",
  active: "⟳",
  pending: "○",
  skipped: "⊘",
};

/**
 * Plan/todo **produit par l'agent** (C09 §2, items 54/124). Le client n'infère
 * ni ne fabrique d'étape : sans message `todo`, ce panneau n'existe pas (pas de
 * panneau vide). Une étape `skipped` reste visible, barrée. Un clic sur l'étape
 * active scrolle vers le premier item du fil produit après son passage à actif.
 */
export function TodoPanel(props: {
  items: TodoItemView[] | null;
  open: boolean;
  onToggle: () => void;
  onJumpToActive: () => void;
}): JSX.Element | null {
  if (!props.items || props.items.length === 0) {
    return null;
  }
  const done = props.items.filter((i) => i.state === "done").length;

  return (
    <div className="agx-todo">
      <button
        className="agx-todo__head"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {props.open ? "▾" : "▸"} Plan · {done}/{props.items.length}
      </button>
      {props.open && (
        <ul className="agx-todo__list">
          {props.items.map((it) => (
            <li
              key={it.id}
              className={`agx-todo__item agx-todo__item--${it.state}`}
              onClick={it.state === "active" ? props.onJumpToActive : undefined}
            >
              <span className="agx-todo__glyph" aria-hidden="true">
                {GLYPH[it.state]}
              </span>
              <span className={it.state === "skipped" ? "agx-todo__struck" : undefined}>
                {it.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
