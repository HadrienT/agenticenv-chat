import { describe, expect, it } from "vitest";
import { read, rel, srcFiles } from "./helpers";

describe("discipline — hygiène (05-TESTING §5)", () => {
  it("no-hardcoded-colors : aucun hex hors de theme/tokens.css", () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const offenders = srcFiles([".ts", ".tsx", ".css"])
      .filter((f) => !/tokens\.css$/.test(f))
      .filter((f) => hex.test(stripComments(read(f))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no-empty-catch : tout `catch` du code hôte/webview appelle log.*", () => {
    const offenders: string[] = [];
    for (const f of srcFiles([".ts", ".tsx"])) {
      // logging.ts est le logger lui-même : son `safeStringify` ne peut pas
      // s'appeler récursivement, il renvoie une chaîne de diagnostic que
      // l'appelant journalise.
      if (/[/\\]logging\.ts$/.test(f)) continue;
      const src = read(f);
      for (const block of catchBlocks(src)) {
        // `discipline:surfaced` : rare échappatoire pour un module **pur** qui
        // remonte l'erreur autrement qu'en journalisant (ex. accumulateur retourné).
        if (
          !/\blog\.(error|warn|info|debug|trace)\s*\(/.test(block) &&
          !/discipline:surfaced/.test(block)
        ) {
          offenders.push(rel(f));
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no-default-export : aucun export par défaut dans src/", () => {
    const offenders = srcFiles([".ts", ".tsx"])
      .filter((f) => /^\s*export\s+default\b/m.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("settings-declared : toute clé lue de la config est déclarée dans package.json", () => {
    const pkg = JSON.parse(read(require.resolve("../../package.json"))) as {
      contributes: { configuration: { properties: Record<string, unknown> } };
    };
    const declared = new Set(Object.keys(pkg.contributes.configuration.properties));
    const used = new Set<string>();
    const re = /getConfiguration\(\s*["']agenticenvChat["']\s*\)[\s\S]{0,400}?\.get<[^>]*>\(\s*["']([\w.]+)["']/g;
    for (const f of srcFiles([".ts"])) {
      const src = read(f);
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        used.add(`agenticenvChat.${m[1]}`);
      }
    }
    const missing = [...used].filter((k) => !declared.has(k));
    expect(missing).toEqual([]);
  });
});

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Extrait le corps `{…}` de chaque `catch` d'un fichier (accolades équilibrées). */
function catchBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /\bcatch\b\s*(?:\([^)]*\))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    blocks.push(src.slice(re.lastIndex, i - 1));
  }
  return blocks;
}
