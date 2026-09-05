import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./helpers";

const LIMITS = {
  "dist/webview.js": 1.5 * 1024 * 1024,
  "dist/extension.js": 400 * 1024,
};

/** bundle-budget (04-CONVENTIONS §6) : produit un build de prod et vérifie les tailles. */
describe("discipline — budget de bundle", () => {
  it("les bundles minifiés tiennent sous les seuils", () => {
    execFileSync("node", ["esbuild.mjs", "--production"], { cwd: REPO_ROOT, stdio: "pipe" });
    for (const [file, limit] of Object.entries(LIMITS)) {
      const size = statSync(join(REPO_ROOT, file)).size;
      expect(size, `${file} = ${(size / 1024).toFixed(0)} KiB`).toBeLessThanOrEqual(limit);
    }
  }, 30_000);
});
