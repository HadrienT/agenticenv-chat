import { describe, expect, it } from "vitest";
import {
  commitMessagePrompt,
  explainMessage,
  fixMessage,
  prDescriptionPrompt,
  terminalCommandPrompt,
  type DiagnosticInput,
} from "../../src/editor/message";

const diag: DiagnosticInput = {
  severity: "error",
  message: "expected ';' before '}' token",
  file: "src/black.cpp",
  line: 42,
  source: "clang",
  enclosing: "double price(double r) {\n  return 1 / (1 + r)\n}",
};

describe("C11 — constructeurs de messages éditeur", () => {
  it("fixMessage cible le diagnostic et joint le code englobant, pas le fichier", () => {
    const m = fixMessage(diag);
    expect(m).toContain("Fix this error in src/black.cpp:42");
    expect(m).toContain("expected ';'");
    expect(m).toContain("(clang)");
    expect(m).toContain("```\ndouble price");
  });

  it("explainMessage ne demande pas de correctif", () => {
    const m = explainMessage(diag);
    expect(m.toLowerCase()).toContain("explain");
    expect(m.toLowerCase()).not.toContain("fix this");
  });

  it("commitMessagePrompt : style et périmètre stagé/non stagé", () => {
    const conv = commitMessagePrompt("diff --git a b", "conventional", true);
    expect(conv).toContain("Conventional Commits");
    expect(conv).toContain("staged changes");
    expect(conv).toContain("no code fences");

    const plain = commitMessagePrompt("diff", "plain", false);
    expect(plain).toContain("imperative summary");
    expect(plain).toContain("unstaged changes");
  });

  it("prDescriptionPrompt reprend base, commits et diff", () => {
    const m = prDescriptionPrompt("origin/main", "- did a thing", "diff body");
    expect(m).toContain("base: origin/main");
    expect(m).toContain("- did a thing");
    expect(m).toContain("diff body");
    expect(m).toContain("test-plan");
  });

  it("terminalCommandPrompt exige une seule commande sans habillage", () => {
    const m = terminalCommandPrompt("list files by size");
    expect(m).toContain("list files by size");
    expect(m).toContain("only the command");
    expect(m).toContain("no code fences");
  });
});
