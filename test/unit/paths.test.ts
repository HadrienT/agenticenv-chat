import { beforeEach, describe, expect, it } from "vitest";
import { Uri } from "../stubs/vscode";
import * as paths from "../../src/paths";

describe("paths.ts — traducteur sandbox ↔ hôte", () => {
  beforeEach(() => {
    paths.setMapping({ sandboxRoot: "/workspace/project", hostRoot: Uri.file("/home/me/proj") });
  });

  it("chemin sous le montage → URI hôte", () => {
    const uri = paths.toHostUri("/workspace/project/src/pricing/black.cpp");
    expect(uri?.fsPath).toBe("/home/me/proj/src/pricing/black.cpp");
    expect(paths.displayPath("/workspace/project/src/pricing/black.cpp")).toBe(
      "src/pricing/black.cpp",
    );
    expect(paths.isInsideWorkspace("/workspace/project/src/pricing/black.cpp")).toBe(true);
  });

  it("racine exacte → URI de la racine hôte", () => {
    expect(paths.toHostUri("/workspace/project")?.fsPath).toBe("/home/me/proj");
    expect(paths.displayPath("/workspace/project")).toBe(".");
  });

  it("chemin hors montage (/workspace/conversations/...) → null, affiché brut", () => {
    expect(paths.toHostUri("/workspace/conversations/abc/events.json")).toBeNull();
    expect(paths.isInsideWorkspace("/workspace/conversations/abc/events.json")).toBe(false);
    expect(paths.displayPath("/workspace/conversations/abc/events.json")).toBe(
      "/workspace/conversations/abc/events.json",
    );
  });

  it("chemin absolu étranger (/etc/passwd) → null", () => {
    expect(paths.toHostUri("/etc/passwd")).toBeNull();
    expect(paths.displayPath("/etc/passwd")).toBe("/etc/passwd");
  });

  it("traversée `..` rejetée, pas normalisée — même si elle resterait dans le montage", () => {
    expect(paths.toHostUri("/workspace/project/../etc/passwd")).toBeNull();
    expect(paths.toHostUri("/workspace/project/a/../b")).toBeNull();
  });

  it("aucun dossier ouvert (hostRoot === null) → toutes les traductions null", () => {
    paths.setMapping({ sandboxRoot: "/workspace/project", hostRoot: null });
    expect(paths.toHostUri("/workspace/project/src/a.cpp")).toBeNull();
    expect(paths.isInsideWorkspace("/workspace/project/src/a.cpp")).toBe(false);
    // displayPath reste utile pour l'affichage non cliquable
    expect(paths.displayPath("/workspace/project/src/a.cpp")).toBe("src/a.cpp");
  });

  it("casse différente → null (le conteneur est sensible à la casse)", () => {
    expect(paths.toHostUri("/workspace/Project/src/a.cpp")).toBeNull();
  });

  it("toSandboxPath : URI hôte sous le dossier → chemin conteneur", () => {
    expect(paths.toSandboxPath(Uri.file("/home/me/proj/src/a.cpp"))).toBe(
      "/workspace/project/src/a.cpp",
    );
    expect(paths.toSandboxPath(Uri.file("/home/me/proj"))).toBe("/workspace/project");
  });

  it("toSandboxPath : URI hors du dossier → null", () => {
    expect(paths.toSandboxPath(Uri.file("/home/me/other/a.cpp"))).toBeNull();
    expect(paths.toSandboxPath(Uri.parse("untitled:Untitled-1"))).toBeNull();
  });

  it("round-trip hôte → sandbox → hôte", () => {
    const start = Uri.file("/home/me/proj/pkg/mod.ts");
    const sandbox = paths.toSandboxPath(start);
    expect(sandbox).not.toBeNull();
    expect(paths.toHostUri(sandbox as string)?.fsPath).toBe(start.fsPath);
  });
});
