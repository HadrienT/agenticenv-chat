import { describe, expect, it } from "vitest";
import {
  IgnoreMatcher,
  isNoise,
  isSensitivePath,
  parseIgnoreFile,
} from "../../src/context/ignore";
import { globToRegExp } from "../../src/glob";

describe("ignore — motifs sensibles (C04 §ignore, item 79)", () => {
  it("un .env est sensible quel que soit le chemin", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath("/workspace/project/.env")).toBe(true);
    expect(isSensitivePath("config/.env.production")).toBe(true);
  });

  it("clés privées, credentials, npmrc", () => {
    for (const p of ["server.pem", "id_rsa", "id_ed25519.pub", "cert.p12", ".npmrc", "credentials.json"]) {
      expect(isSensitivePath(p), p).toBe(true);
    }
  });

  it("un fichier source normal n'est pas sensible", () => {
    expect(isSensitivePath("src/pricing/black.cpp")).toBe(false);
    expect(isSensitivePath("environment.ts")).toBe(false);
  });
});

describe("ignore — dossiers bruyants + .gitignore", () => {
  it("node_modules / .git / build toujours ignorés", () => {
    expect(isNoise("node_modules/react/index.js")).toBe(true);
    expect(isNoise("src/a.cpp")).toBe(false);
  });

  it("parse et applique un .gitignore", () => {
    const m = new IgnoreMatcher(parseIgnoreFile("*.log\n/tmp/\n!keep.log\n"));
    expect(m.ignores("debug.log")).toBe(true);
    expect(m.ignores("tmp/x")).toBe(true);
    expect(m.ignores("keep.log")).toBe(false);
    expect(m.ignores("src/main.cpp")).toBe(false);
  });

  it("globToRegExp : *, **, ?", () => {
    expect(globToRegExp("*.cpp").test("black.cpp")).toBe(true);
    expect(globToRegExp("*.cpp").test("a/b.cpp")).toBe(false);
    expect(globToRegExp("**/*.cpp").test("a/b/c.cpp")).toBe(true);
    expect(globToRegExp("file?.txt").test("file1.txt")).toBe(true);
  });
});
