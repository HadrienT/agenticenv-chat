import { describe, expect, it } from "vitest";
import { observationText, truncateOutput } from "../../src/webview/render/truncate";

describe("truncateOutput (C02 §8)", () => {
  it("laisse un texte court intact", () => {
    const t = truncateOutput("a\nb\nc");
    expect(t.truncated).toBe(false);
    expect(t.head).toBe("a\nb\nc");
  });

  it("tronque au-delà de 200 lignes, tête + queue", () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const t = truncateOutput(text);
    expect(t.truncated).toBe(true);
    expect(t.hiddenLines).toBeGreaterThan(0);
    expect(t.head.split("\n")[0]).toBe("line 0");
    expect(t.tail.split("\n").at(-1)).toBe("line 499");
  });

  it("propose l'éditeur au-delà de 2000 lignes", () => {
    const text = Array.from({ length: 2500 }, () => "x").join("\n");
    expect(truncateOutput(text).preferEditor).toBe(true);
  });
});

describe("observationText", () => {
  it("extrait une chaîne directe", () => {
    expect(observationText("hello")).toBe("hello");
  });
  it("extrait un champ connu d'un objet", () => {
    expect(observationText({ output: "ls output" })).toBe("ls output");
    expect(observationText({ stdout: "x" })).toBe("x");
  });
  it("retombe sur du JSON", () => {
    expect(observationText({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
