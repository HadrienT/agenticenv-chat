import { describe, expect, it } from "vitest";
import { diffStat, parseUnifiedDiff } from "../../src/webview/render/parseDiff";

const SAMPLE = `diff --git a/src/black.cpp b/src/black.cpp
index 1111..2222 100644
--- a/src/black.cpp
+++ b/src/black.cpp
@@ -1,4 +1,5 @@
 #include <cmath>
-double d1(double s) { return 0; }
+double d1(double s, double k) {
+  return std::log(s / k);
+}
 // trailing
@@ -20,2 +21,1 @@
-int old_a;
-int old_b;
+int merged;
`;

describe("parseUnifiedDiff (C06 §7, item 122)", () => {
  it("extrait les chemins et les hunks", () => {
    const [file] = parseUnifiedDiff(SAMPLE);
    expect(file.oldPath).toBe("src/black.cpp");
    expect(file.newPath).toBe("src/black.cpp");
    expect(file.hunks).toHaveLength(2);
    expect(file.hunks[0].oldStart).toBe(1);
    expect(file.hunks[0].newStart).toBe(1);
  });

  it("compte +/- par fichier", () => {
    const [file] = parseUnifiedDiff(SAMPLE);
    expect(file.added).toBe(4); // 3 + 1
    expect(file.removed).toBe(3); // 1 + 2
  });

  it("détecte un renommage", () => {
    const rename = `diff --git a/old.cpp b/new.cpp
rename from old.cpp
rename to new.cpp
`;
    const [f] = parseUnifiedDiff(rename);
    expect(f.renamed).toBe(true);
    expect(f.oldPath).toBe("old.cpp");
    expect(f.newPath).toBe("new.cpp");
  });

  it("détecte un fichier binaire", () => {
    const bin = `diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
`;
    expect(parseUnifiedDiff(bin)[0].binary).toBe(true);
  });

  it("ignore « \\ No newline at end of file »", () => {
    const d = `--- a/x
+++ b/x
@@ -1 +1 @@
-a
\\ No newline at end of file
+b
`;
    const [f] = parseUnifiedDiff(d);
    expect(f.hunks[0].lines.map((l) => l.text)).toEqual(["a", "b"]);
  });

  it("gère plusieurs fichiers", () => {
    const multi = SAMPLE + `diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-x\n+y\n`;
    expect(parseUnifiedDiff(multi)).toHaveLength(2);
  });

  it("diffStat sans construire le modèle", () => {
    expect(diffStat(SAMPLE)).toEqual({ added: 4, removed: 3 });
  });
});
