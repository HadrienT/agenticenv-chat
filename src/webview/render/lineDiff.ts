/**
 * Diff de lignes minimal (LCS) — suffisant pour l'affichage (C02 L5, C05 §2).
 * Pur. Le diff « autoritaire » viendra du bridge (`file_diff`, C06) ; ici on
 * calcule à partir de `old_str`/`new_str`, et la **source du compte** est
 * signalée pour ne pas faire passer une estimation pour une mesure (C05 §2).
 */

export type DiffLine =
  | { kind: "ctx"; text: string; oldNo: number; newNo: number }
  | { kind: "add"; text: string; newNo: number }
  | { kind: "del"; text: string; oldNo: number };

export interface LineDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

export function diffLines(oldText: string, newText: string): LineDiff {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];
  const n = a.length;
  const m = b.length;

  // table LCS
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ kind: "ctx", text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: "del", text: a[i], oldNo: i + 1 });
      removed++;
      i++;
    } else {
      lines.push({ kind: "add", text: b[j], newNo: j + 1 });
      added++;
      j++;
    }
  }
  while (i < n) {
    lines.push({ kind: "del", text: a[i], oldNo: i + 1 });
    removed++;
    i++;
  }
  while (j < m) {
    lines.push({ kind: "add", text: b[j], newNo: j + 1 });
    added++;
    j++;
  }
  return { lines, added, removed };
}

/** Réduit le diff aux hunks : `context` lignes de contexte autour des changements. */
export function collapseContext(lines: DiffLine[], context = 3): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.kind !== "ctx") {
      for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
        keep[k] = true;
      }
    }
  });
  const out: DiffLine[] = [];
  let gapped = false;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      out.push(l);
      gapped = false;
    } else if (!gapped) {
      out.push({ kind: "ctx", text: "…", oldNo: 0, newNo: 0 });
      gapped = true;
    }
  });
  return out;
}
