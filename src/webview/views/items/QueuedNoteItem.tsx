import type { ChatItem } from "../../store/types";

/**
 * Consigne tapée pendant un tour (C09 §4). Avec la capability `interrupt` elle
 * est injectée dans le tour en cours (« added mid-turn ») ; sinon elle est en
 * file et partira au `turn_finished` — l'état est **toujours** dit, jamais un
 * retard silencieux.
 */
export function QueuedNoteItem(props: {
  item: Extract<ChatItem, { kind: "queued-note" }>;
}): JSX.Element {
  return (
    <div className="agx-note">
      <span className="agx-note__tag">
        {props.item.sent ? "note added mid-turn" : "queued — will be sent when the turn ends"}
      </span>
      <span className="agx-note__text">{props.item.text}</span>
    </div>
  );
}
