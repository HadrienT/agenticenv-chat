/**
 * Parseur de frontmatter minimal (`--- … ---` en tête). Pur. Ne gère que ce dont
 * les instructions/prompts/modes ont besoin : `clé: valeur`, `clé: [a, b]`,
 * `clé:` suivi d'items `- x`.
 */
export interface Frontmatter {
  data: Record<string, string | string[]>;
  body: string;
}

export function parseFrontmatter(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) {
    return { data: {}, body: text };
  }
  const data: Record<string, string | string[]> = {};
  const lines = m[1].split(/\r?\n/);
  let currentKey: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      continue;
    }
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const arr = (data[currentKey] as string[] | undefined) ?? [];
      arr.push(unquote(listItem[1]));
      data[currentKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) {
      continue;
    }
    const key = kv[1];
    const value = kv[2].trim();
    currentKey = key;
    if (value === "") {
      data[key] = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return { data, body: text.slice(m[0].length) };
}

function unquote(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

export function asArray(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

export function asString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
