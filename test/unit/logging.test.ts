import { describe, expect, it } from "vitest";
import { log, redactSecrets } from "../../src/logging";

describe("logging — masquage de secrets (04-CONVENTIONS §4)", () => {
  it("masque une clé OpenAI", () => {
    expect(redactSecrets("using sk-abc123DEF456ghi789 now")).toBe("using sk-*** now");
  });

  it("masque un jeton GitHub", () => {
    expect(redactSecrets("token ghp_0123456789abcdefghijABCD")).toContain("ghp_***");
    expect(redactSecrets("token ghp_0123456789abcdefghijABCD")).not.toContain("abcdef");
  });

  it("masque un en-tête Bearer", () => {
    expect(redactSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload")).toBe(
      "Authorization: Bearer ***",
    );
  });

  it("masque une paire api_key=...", () => {
    expect(redactSecrets('{"api_key":"super-secret-value"}')).toContain('"api_key":"***"');
  });

  it("laisse le texte ordinaire intact", () => {
    expect(redactSecrets("nothing to hide here")).toBe("nothing to hide here");
  });
});

describe("logging — niveaux", () => {
  it("filtre sous le niveau courant et masque à l'écriture", () => {
    const lines: string[] = [];
    log.init({ appendLine: (l: string) => void lines.push(l) }, "warn");
    log.debug("hidden");
    log.warn("shown sk-abcdef123456 tail");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[WARN]");
    expect(lines[0]).toContain("sk-***");
  });
});
