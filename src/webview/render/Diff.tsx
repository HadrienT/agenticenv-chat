import { collapseContext, diffLines, type DiffLine } from "./lineDiff";

/**
 * Diff unifié coloré (C02 L5). Pur. C06 le réutilise et l'enrichit (repli par
 * hunk, application/annulation).
 */
export function Diff(props: {
  oldText: string;
  newText: string;
  /** `true` si les compteurs viennent d'un vrai `file_diff` du bridge, `false` si estimés. */
  measured?: boolean;
  collapse?: boolean;
}): JSX.Element {
  const d = diffLines(props.oldText, props.newText);
  const lines = props.collapse === false ? d.lines : collapseContext(d.lines);
  return (
    <div className="agx-diff">
      <div
        className="agx-diff__stat"
        title={props.measured ? "from the bridge's file diff" : "estimated from old/new text"}
      >
        <span className="agx-diff__add">+{d.added}</span>{" "}
        <span className="agx-diff__del">−{d.removed}</span>
        {!props.measured && <span className="agx-diff__est"> (est.)</span>}
      </div>
      <pre className="agx-diff__pre">
        {lines.map((l, i) => (
          <div key={i} className={`agx-diff__line agx-diff__line--${l.kind}`}>
            <span className="agx-diff__gutter">{gutter(l)}</span>
            <span className="agx-diff__text">{l.text}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function gutter(l: DiffLine): string {
  if (l.kind === "add") {
    return "+";
  }
  if (l.kind === "del") {
    return "−";
  }
  return " ";
}
