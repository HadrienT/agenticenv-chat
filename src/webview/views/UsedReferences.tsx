import { useState } from "react";
import { str } from "../tools/types";
import type { ChatItem } from "../store/types";
import { useThreadServices } from "./threadContext";

interface Ref {
  path: string;
  ranges: [number, number][];
}

/**
 * « Used N references » (C05 §6, item 30) : fichiers **lus** pendant la
 * conversation, dédupliqués, plages fusionnées. Reconstruit côté client à partir
 * des outils de lecture — pas un message de protocole.
 */
export function UsedReferences(props: { items: ChatItem[] }): JSX.Element | null {
  const svc = useThreadServices();
  const [open, setOpen] = useState(false);
  const refs = collect(props.items);
  if (refs.length === 0) {
    return null;
  }
  return (
    <div className="agx-usedrefs">
      <button className="agx-usedrefs__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Used {refs.length} reference
        {refs.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="agx-usedrefs__list">
          {refs.map((r) => (
            <li key={r.path}>
              <button className="agx-filelink" onClick={() => svc.onOpenFile(r.path, r.ranges[0]?.[0])}>
                {display(r, svc.sandboxRoot)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function collect(items: ChatItem[]): Ref[] {
  const byPath = new Map<string, [number, number][]>();
  for (const it of items) {
    if (it.kind !== "tool" || it.toolName !== "file_editor") {
      continue;
    }
    const a = it.args ?? {};
    if (str(a.command) !== "view") {
      continue;
    }
    const path = str(a.path);
    if (!path) {
      continue;
    }
    const range = Array.isArray(a.view_range) ? (a.view_range as number[]) : null;
    const list = byPath.get(path) ?? [];
    if (range && range.length === 2) {
      list.push([range[0], range[1]]);
    }
    byPath.set(path, list);
  }
  return [...byPath.entries()].map(([path, ranges]) => ({ path, ranges: mergeRanges(ranges) }));
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (const [s, e] of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (s <= last[1] + 1) {
      last[1] = Math.max(last[1], e);
    } else {
      out.push([s, e]);
    }
  }
  return out;
}

function display(r: Ref, sandboxRoot: string | null): string {
  const root = sandboxRoot?.replace(/\/+$/, "");
  const short = root && r.path.startsWith(root + "/") ? r.path.slice(root.length + 1) : r.path;
  const ranges = r.ranges.map(([s, e]) => `${s}-${e}`).join(", ");
  return ranges ? `${short}:${ranges}` : short;
}
