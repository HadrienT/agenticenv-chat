import { useState } from "react";
import { collapseContext, diffLines, type DiffLine } from "../render/lineDiff";
import { parseUnifiedDiff, type DiffHunk } from "../render/parseDiff";

const FOLD_THRESHOLD = 40;

/**
 * Diff unifié coloré (items 41, 122). Deux entrées :
 *  - `unified` (chaîne `git diff`) → hunks parsés, bouton **revert hunk** par hunk
 *    (C06 §4 : le vocabulaire est `keep` / `revert`, pas `accept`) ;
 *  - `oldText`/`newText` → diff calculé (LCS) pour les aperçus rapides (C05).
 *
 * Replié par défaut au-delà de 40 lignes (C06 §2).
 */
export function Diff(props: {
  unified?: string;
  oldText?: string;
  newText?: string;
  measured?: boolean;
  onRevertHunk?: (hunkHeader: string) => void;
}): JSX.Element {
  const parsed = props.unified ? parseUnifiedDiff(props.unified)[0] : undefined;
  const hunks: RenderHunk[] = parsed
    ? parsed.hunks.map((h) => ({ header: h.header, lines: h.lines }))
    : [{ header: "", lines: fromLineDiff(props.oldText ?? "", props.newText ?? "") }];
  const total = hunks.reduce((n, h) => n + h.lines.length, 0);
  const [expanded, setExpanded] = useState(total <= FOLD_THRESHOLD);

  const added = parsed ? parsed.added : count(hunks, "add");
  const removed = parsed ? parsed.removed : count(hunks, "del");

  return (
    <div className="agx-diff">
      <div
        className="agx-diff__stat"
        title={props.measured ? "measured from the real diff" : "estimated from old/new text"}
      >
        <span className="agx-diff__add">+{added}</span>{" "}
        <span className="agx-diff__del">−{removed}</span>
        {props.measured === false && <span className="agx-diff__est"> (est.)</span>}
        {total > FOLD_THRESHOLD && (
          <button className="agx-code__btn" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "fold" : `show ${total} lines`}
          </button>
        )}
      </div>
      {expanded &&
        hunks.map((h, i) => (
          <div key={i} className="agx-diff__hunk">
            {h.header && props.onRevertHunk && (
              <div className="agx-diff__hunkbar">
                <code>{h.header}</code>
                <button className="agx-code__btn" onClick={() => props.onRevertHunk?.(h.header)}>
                  revert hunk
                </button>
              </div>
            )}
            <pre className="agx-diff__pre">
              {(props.onRevertHunk ? h.lines : collapse(h.lines)).map((l, j) => (
                <div key={j} className={`agx-diff__line agx-diff__line--${l.kind}`}>
                  <span className="agx-diff__gutter">{gutter(l.kind)}</span>
                  <span className="agx-diff__text">{l.text}</span>
                </div>
              ))}
            </pre>
          </div>
        ))}
    </div>
  );
}

interface RenderHunk {
  header: string;
  lines: DiffHunk["lines"];
}

function fromLineDiff(oldText: string, newText: string): DiffHunk["lines"] {
  return diffLines(oldText, newText).lines.map((l) => ({ kind: l.kind, text: l.text }));
}

function collapse(lines: DiffHunk["lines"]): DiffHunk["lines"] {
  const asDiffLine: DiffLine[] = lines.map((l) =>
    l.kind === "ctx"
      ? { kind: "ctx", text: l.text, oldNo: 0, newNo: 0 }
      : l.kind === "add"
        ? { kind: "add", text: l.text, newNo: 0 }
        : { kind: "del", text: l.text, oldNo: 0 },
  );
  return collapseContext(asDiffLine).map((l) => ({ kind: l.kind, text: l.text }));
}

function count(hunks: RenderHunk[], kind: "add" | "del"): number {
  return hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === kind).length, 0);
}

function gutter(kind: "ctx" | "add" | "del"): string {
  return kind === "add" ? "+" : kind === "del" ? "−" : " ";
}
