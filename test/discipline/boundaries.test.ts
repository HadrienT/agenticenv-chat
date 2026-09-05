import { describe, expect, it } from "vitest";
import { read, rel, srcFiles, walk, SRC_DIR } from "./helpers";
import { join } from "node:path";

describe("discipline — frontières d'architecture (05-TESTING §5)", () => {
  it("no-vscode-in-webview : aucun import de `vscode` sous src/webview/", () => {
    const offenders = walk(join(SRC_DIR, "webview"), [".ts", ".tsx"])
      .filter((f) => /from\s+["']vscode["']|require\(\s*["']vscode["']\s*\)/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no-jsx-in-host : aucun .tsx hors de src/webview/", () => {
    const offenders = srcFiles([".tsx"])
      .filter((f) => !f.includes(`${SRC_DIR}/webview/`) && !f.includes(`${SRC_DIR}\\webview\\`))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("single-path-translator : le littéral `/workspace/project` n'apparaît que dans src/paths.ts", () => {
    const offenders = srcFiles([".ts", ".tsx"])
      .filter((f) => !/[/\\]paths\.ts$/.test(f))
      .filter((f) => read(f).includes("/workspace/project"))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("render-purity : aucun useEffect/useState/postMessage sous render/ ni tools/", () => {
    // Les renderers d'outils sont purs même rangés dans tools/ (C05 §1).
    const dirs = [join(SRC_DIR, "webview", "render"), join(SRC_DIR, "webview", "tools")];
    const files: string[] = [];
    for (const d of dirs) {
      try {
        files.push(...walk(d, [".ts", ".tsx"]));
      } catch {
        // le dossier n'existe pas encore (WP antérieur)
        continue;
      }
    }
    const offenders = files
      .filter((f) => /\buseEffect\b|\buseState\b|\buseReducer\b|postMessage/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
