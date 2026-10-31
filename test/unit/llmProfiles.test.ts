import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listProfiles, parseProfileEnv, switchArgv } from "../../src/llmProfiles";
import { host } from "../../src/webview/store/actions";
import { errorNotice } from "../../src/webview/store/errorNotice";
import { reduce } from "../../src/webview/store/reducer";
import { initialState } from "../../src/webview/store/types";

const env = (profile: string, served: string, ctx: number) =>
  `# rendered\nLLAMA_PROFILE=${profile}\nLLAMA_MODEL_PATH=/opt/llm/models/x.gguf\nLLAMA_SERVED_NAME=${served}\nLLAMA_CTX_SIZE=${ctx}\n`;

/** AgenticEnv#16 / agenticenv-chat#11 : profils de modèle, un seul chargé à la fois. */
describe("llmProfiles (hôte)", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "agx-llm-"));
    fs.mkdirSync(path.join(dir, "profiles"));
    fs.writeFileSync(path.join(dir, "profiles", "code.env"), env("code", "Qwen3-Coder", 65536));
    fs.writeFileSync(path.join(dir, "profiles", "tutor.env"), env("tutor", "Mistral-Small", 16384));
    fs.writeFileSync(path.join(dir, "profiles", "notes.txt"), "ignored");
    fs.symlinkSync("profiles/tutor.env", path.join(dir, "llama-server.env"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("liste les profils installés et marque celui que pointe llama-server.env", () => {
    expect(listProfiles(path.join(dir, "profiles"), path.join(dir, "llama-server.env"))).toEqual([
      { name: "code", servedName: "Qwen3-Coder", contextWindow: 65536, active: false },
      { name: "tutor", servedName: "Mistral-Small", contextWindow: 16384, active: true },
    ]);
  });

  it("pile sans profils → liste vide, aucun actif si le lien manque", () => {
    expect(listProfiles(path.join(dir, "absent"), path.join(dir, "llama-server.env"))).toEqual([]);
    const profiles = listProfiles(path.join(dir, "profiles"), path.join(dir, "absent.env"));
    expect(profiles.map((p) => p.active)).toEqual([false, false]);
  });

  it("ignore un .env sans LLAMA_SERVED_NAME ou au nom invalide", () => {
    expect(parseProfileEnv("code", "LLAMA_PROFILE=code\n")).toBeUndefined();
    expect(parseProfileEnv("Bad Name", env("x", "M", 1))).toBeUndefined();
  });

  it("switchArgv : sudo -n agx-llm-use <profil>, refuse tout nom hors forme", () => {
    expect(switchArgv("translate")).toEqual(["sudo", "-n", "/usr/local/sbin/agx-llm-use", "translate"]);
    for (const bad of ["", "code; rm -rf /", "../code", "-h", "Code", "a b"]) {
      expect(switchArgv(bad)).toBeUndefined();
    }
  });
});

describe("llmProfiles (webview)", () => {
  const profiles = [
    { name: "code", servedName: "Qwen3-Coder", contextWindow: 65536, active: false },
    { name: "tutor", servedName: "Mistral-Small", contextWindow: 16384, active: true },
  ];
  const details = { served: ["Mistral-Small"], expected: "Qwen3-Coder", fix: "just llm-use code" };

  it("DEPENDENCY_ERROR « mauvais modèle » propose la bascule vers le profil attendu", () => {
    const n = errorNotice("DEPENDENCY_ERROR", "llama-server serves …", details, profiles);
    expect(n.text).toContain("Mistral-Small");
    expect(n.actions?.[0]).toMatchObject({ kind: "switchLlmProfile", payload: "code" });
  });

  it("DEPENDENCY_ERROR sans profil correspondant reste l'erreur générique", () => {
    const n = errorNotice("DEPENDENCY_ERROR", "image missing", { image: "x" }, profiles);
    expect(n.text).toBe("DEPENDENCY_ERROR: image missing");
    expect(errorNotice("DEPENDENCY_ERROR", "m", details).actions?.[0].kind).toBe("retry");
  });

  it("la notice tombe quand le profil proposé devient l'actif", () => {
    let s = reduce(initialState(), host({ type: "llmProfiles", profiles, switching: null }));
    s = reduce(s, host({ type: "bridge", message: { type: "error", code: "DEPENDENCY_ERROR", message: "m", details } }));
    expect(s.notices.some((n) => n.id === "bridge-DEPENDENCY_ERROR")).toBe(true);

    s = reduce(s, host({ type: "llmProfiles", profiles, switching: "code" }));
    expect(s.llm.switching).toBe("code");
    expect(s.notices.some((n) => n.id === "bridge-DEPENDENCY_ERROR")).toBe(true);

    const switched = profiles.map((p) => ({ ...p, active: p.name === "code" }));
    s = reduce(s, host({ type: "llmProfiles", profiles: switched, switching: null }));
    expect(s.notices.some((n) => n.id === "bridge-DEPENDENCY_ERROR")).toBe(false);
  });
});
