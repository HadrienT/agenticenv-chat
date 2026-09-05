/**
 * Découpe un texte markdown en segments de **prose** et de **blocs de code de
 * premier niveau** (C02 §2–3). Les blocs de code sont rendus par `CodeBlock`
 * (barre d'outils interactive) ; la prose par `render/Markdown`.
 *
 * Pur : pas d'état, pas d'effet.
 */

export interface ProseSegment {
  kind: "prose";
  text: string;
}

export interface CodeSegment {
  kind: "code";
  lang: string;
  path?: string;
  title?: string;
  code: string;
  /** `true` si le bloc n'était pas encore fermé (streaming) — pas d'action « Apply ». */
  open: boolean;
}

export type Segment = ProseSegment | CodeSegment;

const FENCE_RE = /^(?<indent>[ \t]*)(?<ticks>`{3,}|~{3,})(?<info>[^\n]*)\n?/;

/** Parse une info-string ` cpp path=src/x.cpp title="Foo" `. */
export function parseInfoString(info: string): { lang: string; path?: string; title?: string } {
  const trimmed = info.trim();
  if (!trimmed) {
    return { lang: "" };
  }
  const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const lang = (parts[0] ?? "").toLowerCase();
  let path: string | undefined;
  let title: string | undefined;
  for (const p of parts.slice(1)) {
    const m = /^(path|title|file)=(.*)$/.exec(p);
    if (!m) {
      continue;
    }
    const value = m[2].replace(/^"|"$/g, "");
    if (m[1] === "title") {
      title = value;
    } else {
      path = value;
    }
  }
  return { lang, path, title };
}

export function splitBlocks(input: string): Segment[] {
  const segments: Segment[] = [];
  const lines = input.split("\n");
  let prose: string[] = [];
  let i = 0;

  const flushProse = (): void => {
    if (prose.length && prose.join("\n").trim()) {
      segments.push({ kind: "prose", text: prose.join("\n") });
    }
    prose = [];
  };

  while (i < lines.length) {
    const fence = FENCE_RE.exec(lines[i] + "\n");
    if (fence && (fence.groups?.indent?.length ?? 0) < 4) {
      const ticks = fence.groups?.ticks ?? "```";
      const marker = ticks[0];
      const { lang, path, title } = parseInfoString(fence.groups?.info ?? "");
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        if (new RegExp(`^[ \\t]*${marker === "`" ? "`" : "~"}{${ticks.length},}[ \\t]*$`).test(lines[j])) {
          closed = true;
          break;
        }
        body.push(lines[j]);
      }
      flushProse();
      segments.push({ kind: "code", lang, path, title, code: body.join("\n"), open: !closed });
      i = closed ? j + 1 : lines.length;
      continue;
    }
    prose.push(lines[i]);
    i++;
  }
  flushProse();
  return segments;
}
