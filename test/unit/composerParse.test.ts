import { describe, expect, it } from "vitest";
import { activeToken, parseSlash, stripToken } from "../../src/webview/views/composer/composerParse";
import { isKnownCommand, slashMatches } from "../../src/webview/views/composer/menuOptions";

describe("activeToken (C03 §3–4)", () => {
  it("`/` uniquement en tête de champ", () => {
    expect(activeToken("/fi", 3)).toMatchObject({ kind: "slash", query: "fi" });
    expect(activeToken("hello /fi", 9)).toEqual({ kind: "none" });
  });

  it("`#` détecté après un espace, prefix reconnu", () => {
    expect(activeToken("look at #bla", 12)).toMatchObject({ kind: "mention", query: "bla", prefix: "" });
    expect(activeToken("#sym:Black", 10)).toMatchObject({ kind: "mention", prefix: "sym:", query: "Black" });
    expect(activeToken("a # b", 3)).toMatchObject({ kind: "mention", query: "" });
  });

  it("pas de jeton sinon", () => {
    expect(activeToken("plain text", 10)).toEqual({ kind: "none" });
  });
});

describe("stripToken", () => {
  it("retire le jeton `#…` du texte, garde le reste lisible", () => {
    // "explain #blk please" — le jeton `#blk` occupe [8, 12)
    const r = stripToken("explain #blk please", 8, 12);
    expect(r.text).not.toContain("#blk");
    expect(r.text).toContain("explain");
    expect(r.text).toContain("please");
  });
});

describe("parseSlash / isKnownCommand", () => {
  it("découpe commande et arguments", () => {
    expect(parseSlash("/fix the tests")).toEqual({ command: "fix", args: "the tests" });
    expect(parseSlash("/new")).toEqual({ command: "new", args: "" });
    expect(parseSlash("not a command")).toBeNull();
  });

  it("commande inconnue non reconnue ⇒ envoyée comme texte", () => {
    expect(isKnownCommand("new", [])).toBe(true);
    expect(isKnownCommand("wat", [])).toBe(false);
    expect(isKnownCommand("myprompt", [{ name: "myprompt", description: "", source: "prompt" }])).toBe(true);
  });

  it("slashMatches filtre par préfixe, builtins inclus", () => {
    expect(slashMatches("c", []).map((c) => c.name)).toContain("clear");
    expect(slashMatches("zzz", [])).toEqual([]);
  });
});
