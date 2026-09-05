import { describe, expect, it } from "vitest";
import { rendererFor, toolFamily } from "../../src/webview/tools/registry";

describe("rendererFor (C05 §1)", () => {
  it("ne renvoie jamais null", () => {
    for (const name of ["file_editor", "terminal", "grep", "glob", "kb.search", "totally_unknown", ""]) {
      expect(rendererFor(name)).toBeTruthy();
      expect(typeof rendererFor(name).summary).toBe("function");
    }
  });

  it("un outil MCP inconnu tombe sur le repli générique et reste lisible", () => {
    const r = rendererFor("notion__create_page");
    const node = r.summary(
      { toolName: "notion__create_page", args: { query: "black scholes" }, thought: "" },
      null,
    );
    expect(String(node)).toContain("notion__create_page");
  });

  it("familles reconnues", () => {
    expect(toolFamily("file_editor")).toBe("edit");
    expect(toolFamily("execute_bash")).toBe("terminal");
    expect(toolFamily("grep")).toBe("search");
    expect(toolFamily("glob")).toBe("search");
    expect(toolFamily("browser")).toBe("other");
  });
});

describe("renderers — résumé sur une ligne, info clé présente", () => {
  it("file_editor str_replace → Edit <name> · +A −B", () => {
    const s = rendererFor("file_editor").summary(
      {
        toolName: "file_editor",
        args: { command: "str_replace", path: "/workspace/project/src/black.cpp", old_str: "a\nb", new_str: "a\nB\nC" },
        thought: "",
      },
      null,
    );
    expect(s).toBe("Edit black.cpp · +3 −2 (est.)");
  });

  it("file_editor view → Read <name>:range", () => {
    const s = rendererFor("file_editor").summary(
      { toolName: "file_editor", args: { command: "view", path: "/x/black.cpp", view_range: [12, 80] }, thought: "" },
      null,
    );
    expect(s).toBe("Read black.cpp:12-80");
  });

  it("terminal → $ commande (une ligne)", () => {
    const s = rendererFor("terminal").summary(
      { toolName: "terminal", args: { command: "ctest --output-on-failure" }, thought: "" },
      { raw: { exit_code: 0 }, text: "", error: false },
    );
    expect(s).toBe("$ ctest --output-on-failure");
  });

  it("grep → Search \"…\" · N matches", () => {
    const s = rendererFor("grep").summary(
      { toolName: "grep", args: { pattern: "operator*" }, thought: "" },
      { raw: {}, text: "a.cpp:1: x\nb.cpp:2: y\nc.cpp:3: z", error: false },
    );
    expect(s).toBe('Search "operator*" · 3 matches');
  });
});
