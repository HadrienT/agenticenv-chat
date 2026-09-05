import { describe, expect, it } from "vitest";
import { parseInfoString, splitBlocks } from "../../src/webview/render/blocks";

describe("splitBlocks", () => {
  it("sépare prose et blocs de code de premier niveau", () => {
    const segs = splitBlocks("before\n\n```ts\nconst x = 1;\n```\n\nafter");
    expect(segs.map((s) => s.kind)).toEqual(["prose", "code", "prose"]);
    expect(segs[1]).toMatchObject({ kind: "code", lang: "ts", code: "const x = 1;", open: false });
  });

  it("bloc non fermé (streaming) ⇒ open:true, tout le reste en code", () => {
    const segs = splitBlocks("intro\n\n```python\nprint(1)\nprint(2)");
    expect(segs[segs.length - 1]).toMatchObject({ kind: "code", lang: "python", open: true });
  });

  it("parseInfoString : lang + path + title", () => {
    expect(parseInfoString('cpp path=src/x.cpp title="My File"')).toEqual({
      lang: "cpp",
      path: "src/x.cpp",
      title: "My File",
    });
    expect(parseInfoString("")).toEqual({ lang: "" });
    expect(parseInfoString("json")).toEqual({ lang: "json", path: undefined, title: undefined });
  });

  it("indentation ≥ 4 espaces n'est pas une fence", () => {
    const segs = splitBlocks("    ```not a fence```");
    expect(segs.every((s) => s.kind === "prose")).toBe(true);
  });
});
