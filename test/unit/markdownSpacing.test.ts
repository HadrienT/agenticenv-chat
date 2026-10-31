import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("espacement du markdown", () => {
  it("`.agx-md` ne garde pas le `pre-wrap` hérité du message", () => {
    const css = readFileSync("src/webview/theme/base.css", "utf8");
    expect(css).toMatch(/\.agx-md \{[^}]*white-space: normal;/);
  });
});
