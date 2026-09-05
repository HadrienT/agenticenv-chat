import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../../src/context/files";
import { stripBinaryHunks } from "../../src/context/git";

describe("fuzzyScore (C04 §files — recherche floue)", () => {
  it("sous-séquence exacte au début de segment score haut", () => {
    expect(fuzzyScore("black", "src/pricing/black.cpp")).toBeGreaterThan(
      fuzzyScore("black", "src/blackboard/notes.md"),
    );
  });

  it("aucune correspondance ⇒ 0", () => {
    expect(fuzzyScore("xyz", "src/main.cpp")).toBe(0);
  });

  it("requête vide ⇒ tout passe", () => {
    expect(fuzzyScore("", "anything")).toBe(1);
  });
});

describe("stripBinaryHunks (C04 §git — binaires exclus du diff)", () => {
  it("retire les hunks de fichiers binaires, garde les textes", () => {
    const diff = [
      "diff --git a/src/a.cpp b/src/a.cpp",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
    ].join("\n");
    const out = stripBinaryHunks(diff);
    expect(out).toContain("src/a.cpp");
    expect(out).not.toContain("logo.png");
  });
});
