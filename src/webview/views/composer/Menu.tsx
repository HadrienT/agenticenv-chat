import type { MentionOption } from "./menuOptions";
import type { SlashCommand } from "../../../messages";

/** Menu de complétion ancré au-dessus de la textarea. Pur. */
export function SlashMenu(props: {
  matches: SlashCommand[];
  activeIndex: number;
  onPick: (c: SlashCommand) => void;
  onHover: (i: number) => void;
}): JSX.Element | null {
  if (props.matches.length === 0) {
    return null;
  }
  return (
    <ul className="agx-menu" role="listbox" aria-label="Slash commands">
      {props.matches.map((c, i) => (
        <li
          key={`${c.source}-${c.name}`}
          role="option"
          aria-selected={i === props.activeIndex}
          className={`agx-menu__item${i === props.activeIndex ? " agx-menu__item--active" : ""}`}
          onMouseEnter={() => props.onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            props.onPick(c);
          }}
        >
          <span className="agx-menu__name">/{c.name}</span>
          <span className="agx-menu__desc">{c.description}</span>
          {c.source !== "builtin" && <span className="agx-menu__tag">{c.source}</span>}
        </li>
      ))}
    </ul>
  );
}

export function MentionMenu(props: {
  options: MentionOption[];
  activeIndex: number;
  onPick: (o: MentionOption) => void;
  onHover: (i: number) => void;
}): JSX.Element | null {
  if (props.options.length === 0) {
    return null;
  }
  return (
    <ul className="agx-menu" role="listbox" aria-label="Context references">
      {props.options.map((o, i) => (
        <li
          key={o.label + i}
          role="option"
          aria-selected={i === props.activeIndex}
          className={`agx-menu__item${i === props.activeIndex ? " agx-menu__item--active" : ""}`}
          onMouseEnter={() => props.onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            props.onPick(o);
          }}
        >
          <span className="agx-menu__name">{o.label}</span>
          {o.detail && <span className="agx-menu__desc">{o.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
