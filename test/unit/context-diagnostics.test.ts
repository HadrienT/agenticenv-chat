import { describe, expect, it } from "vitest";
import { condense, type FlatDiagnostic } from "../../src/context/diagnostics";

function d(part: Partial<FlatDiagnostic>): FlatDiagnostic {
  return {
    sandboxPath: "/workspace/project/src/a.cpp",
    line: 1,
    col: 1,
    severity: "error",
    message: "boom",
    ...part,
  };
}

describe("condense — diagnostics (C04 §diagnostics, item 73)", () => {
  it("Information/Hint exclus par défaut", () => {
    const c = condense([d({ severity: "error" }), d({ severity: "info", message: "note" }), d({ severity: "hint" })]);
    expect(c.total).toBe(1);
  });

  it("cascade C++ : mêmes message+fichier dédupliqués", () => {
    const many = Array.from({ length: 40 }, () => d({ message: "expected ';'" }));
    expect(condense(many).total).toBe(1);
  });

  it("plafond de 50, total conservé", () => {
    const lots = Array.from({ length: 120 }, (_, i) => d({ line: i + 1, message: `err ${i}` }));
    const c = condense(lots);
    expect(c.shown).toBe(50);
    expect(c.total).toBe(120);
    expect(c.truncated).toBe(true);
  });

  it("trié par fichier puis sévérité puis ligne ; chemin affiché relatif", () => {
    const c = condense([
      d({ sandboxPath: "/workspace/project/z.cpp", line: 5, severity: "warning", message: "w" }),
      d({ sandboxPath: "/workspace/project/z.cpp", line: 2, severity: "error", message: "e" }),
    ]);
    const iErr = c.text.indexOf("[error] e");
    const iWarn = c.text.indexOf("[warning] w");
    expect(iErr).toBeGreaterThan(-1);
    expect(iErr).toBeLessThan(iWarn);
    expect(c.text).toContain("z.cpp:2:1");
    expect(c.text).not.toContain("/workspace/project/");
  });

  it("aucun diagnostic ⇒ message clair", () => {
    expect(condense([]).text).toBe("No errors or warnings.");
  });
});
