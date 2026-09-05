import { describe, expect, it } from "vitest";
import { collapseContext, diffLines } from "../../src/webview/render/lineDiff";

describe("diffLines (LCS)", () => {
  it("compte les ajouts et suppressions", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(d.added).toBe(2); // B, d
    expect(d.removed).toBe(1); // b
  });

  it("identique ⇒ 0/0, que du contexte", () => {
    const d = diffLines("x\ny", "x\ny");
    expect([d.added, d.removed]).toEqual([0, 0]);
    expect(d.lines.every((l) => l.kind === "ctx")).toBe(true);
  });

  it("création (old vide) ⇒ tout en ajout", () => {
    const d = diffLines("", "l1\nl2\nl3");
    expect(d.added).toBe(3);
    expect(d.removed).toBe(0);
  });

  it("collapseContext insère un marqueur de coupure", () => {
    const big = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const changed = big.replace("line 20", "LINE 20");
    const collapsed = collapseContext(diffLines(big, changed).lines, 2);
    expect(collapsed.length).toBeLessThan(41);
    expect(collapsed.some((l) => l.text === "…")).toBe(true);
  });
});
