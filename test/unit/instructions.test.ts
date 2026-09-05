import { describe, expect, it } from "vitest";
import { asArray, parseFrontmatter } from "../../src/instructions/frontmatter";
import {
  INSTRUCTIONS_CAP_BYTES,
  assembleInstructions,
  parseInstructionFile,
  type LoadedFile,
} from "../../src/instructions/assemble";
import { parsePrompt, substitute } from "../../src/instructions/prompts";

describe("parseFrontmatter", () => {
  it("clé: valeur, listes inline et bloc", () => {
    const { data, body } = parseFrontmatter(
      "---\nname: review\napplyTo: [\"src/**/*.cpp\", \"inc/**\"]\ntags:\n  - a\n  - b\n---\nbody text\n",
    );
    expect(data.name).toBe("review");
    expect(data.applyTo).toEqual(["src/**/*.cpp", "inc/**"]);
    expect(data.tags).toEqual(["a", "b"]);
    expect(body.trim()).toBe("body text");
  });

  it("sans frontmatter : tout est body", () => {
    expect(parseFrontmatter("just text").body).toBe("just text");
  });
});

describe("assembleInstructions (C10 §7)", () => {
  const root = (rel: string): LoadedFile => ({ rel, content: `rules of ${rel}` });

  it("tous les fichiers racine chargés, étiquetés, dans l'ordre", () => {
    const r = assembleInstructions(
      [root("AGENTS.md"), root("CLAUDE.md"), root(".github/copilot-instructions.md")],
      [],
      null,
      [],
    );
    expect(r.applied).toEqual(["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"]);
    expect(r.text.indexOf("From AGENTS.md")).toBeLessThan(r.text.indexOf("From CLAUDE.md"));
  });

  it("applyTo : appliqué seulement si un fichier attaché correspond", () => {
    const scoped = parseInstructionFile(
      ".agenticenv/instructions/pricing.instructions.md",
      "---\napplyTo: [\"src/pricing/**/*.cpp\"]\n---\nPayoff conventions",
    );
    expect(assembleInstructions([], [scoped], null, ["src/pricing/black.cpp"]).applied).toContain(
      ".agenticenv/instructions/pricing.instructions.md",
    );
    expect(assembleInstructions([], [scoped], null, ["README.md"]).applied).toHaveLength(0);
  });

  it("sans applyTo : ignoré + raison (pas de global implicite)", () => {
    const bad = parseInstructionFile(".agenticenv/instructions/x.instructions.md", "no frontmatter here");
    const r = assembleInstructions([], [bad], null, ["a.cpp"]);
    expect(r.applied).toHaveLength(0);
    expect(r.ignored[0].reason).toMatch(/no .applyTo./);
  });

  it("plafond 16 Kio : troncature signalée", () => {
    const big: LoadedFile = { rel: "AGENTS.md", content: "x".repeat(INSTRUCTIONS_CAP_BYTES + 500) };
    const r = assembleInstructions([big], [], null, []);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(INSTRUCTIONS_CAP_BYTES + 100);
  });

  it("instructions du mode ajoutées en dernier", () => {
    const r = assembleInstructions([root("AGENTS.md")], [], "mode says read-only", []);
    expect(r.text.endsWith("mode says read-only")).toBe(true);
  });
});

describe("prompts (C10 §3)", () => {
  it("parse name/description/argsHint/context/mode", () => {
    const p = parsePrompt("review-pricing.prompt.md", "---\ndescription: Review\nargsHint: <file>\nmode: plan\ncontext: [\"#file:${arg}\", \"#problems\"]\n---\nReview ${arg} carefully.");
    expect(p.name).toBe("review-pricing");
    expect(p.mode).toBe("plan");
    expect(p.context).toEqual(["#file:${arg}", "#problems"]);
  });

  it("substitue les variables ; signale les manquantes", () => {
    expect(substitute("check ${arg} in ${workspaceFolder}", { arg: "black.cpp", selection: "", file: "", workspaceFolder: "proj" }).text).toBe(
      "check black.cpp in proj",
    );
    const r = substitute("look at ${arg}", { arg: "", selection: "", file: "", workspaceFolder: "" });
    expect(r.missing).toContain("arg");
  });

  it("asArray helper", () => {
    expect(asArray("x")).toEqual(["x"]);
    expect(asArray(["a", "b"])).toEqual(["a", "b"]);
    expect(asArray(undefined)).toEqual([]);
  });
});
