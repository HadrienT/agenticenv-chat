/**
 * Parseur de **diff unifié** (`git diff` / `file_diff.unified`) → modèle de hunks
 * (C06 §7, item 122). Pur. Gère : hunks multiples, contexte, renommage
 * (`rename from`/`rename to`), fichier binaire, « \ No newline at end of file ».
 */

export interface DiffHunk {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: { kind: "ctx" | "add" | "del"; text: string }[];
  added: number;
  removed: number;
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  binary: boolean;
  renamed: boolean;
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseUnifiedDiff(unified: string): FileDiff[] {
  const files: FileDiff[] = [];
  const chunks = unified.split(/(?=^diff --git )/m).filter((c) => c.trim());
  const source = chunks.length ? chunks : [unified];

  for (const chunk of source) {
    const lines = chunk.split("\n");
    const file: FileDiff = {
      oldPath: "",
      newPath: "",
      binary: false,
      renamed: false,
      hunks: [],
      added: 0,
      removed: 0,
    };
    let hunk: DiffHunk | null = null;
    let hunkIdx = 0;

    for (const line of lines) {
      const gitHeader = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (gitHeader) {
        file.oldPath = gitHeader[1];
        file.newPath = gitHeader[2];
        continue;
      }
      if (line.startsWith("rename from ")) {
        file.renamed = true;
        file.oldPath = line.slice(12);
        continue;
      }
      if (line.startsWith("rename to ")) {
        file.newPath = line.slice(10);
        continue;
      }
      if (line.startsWith("--- ")) {
        file.oldPath = file.oldPath || stripPrefix(line.slice(4));
        continue;
      }
      if (line.startsWith("+++ ")) {
        file.newPath = file.newPath || stripPrefix(line.slice(4));
        continue;
      }
      if (/^Binary files .* differ$/.test(line) || line === "GIT binary patch") {
        file.binary = true;
        continue;
      }
      const h = HUNK_RE.exec(line);
      if (h) {
        hunk = {
          id: `h${hunkIdx++}`,
          header: line,
          oldStart: Number(h[1]),
          oldLines: h[2] ? Number(h[2]) : 1,
          newStart: Number(h[3]),
          newLines: h[4] ? Number(h[4]) : 1,
          lines: [],
          added: 0,
          removed: 0,
        };
        file.hunks.push(hunk);
        continue;
      }
      if (!hunk) {
        continue;
      }
      if (line.startsWith("\\")) {
        continue; // "\ No newline at end of file"
      }
      if (line.startsWith("+")) {
        hunk.lines.push({ kind: "add", text: line.slice(1) });
        hunk.added++;
        file.added++;
      } else if (line.startsWith("-")) {
        hunk.lines.push({ kind: "del", text: line.slice(1) });
        hunk.removed++;
        file.removed++;
      } else if (line.startsWith(" ")) {
        hunk.lines.push({ kind: "ctx", text: line.slice(1) });
      }
    }

    if (file.oldPath || file.newPath || file.hunks.length) {
      files.push(file);
    }
  }
  return files;
}

function stripPrefix(p: string): string {
  return p.replace(/^[ab]\//, "").replace(/\t.*$/, "").trim();
}

/** Total `+/−` d'un diff unifié, sans construire tout le modèle. */
export function diffStat(unified: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of unified.split("\n")) {
    if (/^\+[^+]/.test(line) || line === "+") {
      added++;
    } else if (/^-[^-]/.test(line) || line === "-") {
      removed++;
    }
  }
  return { added, removed };
}
