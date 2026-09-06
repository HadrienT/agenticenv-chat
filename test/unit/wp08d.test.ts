import { describe, expect, it } from "vitest";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState } from "../../src/webview/store/types";
import type { WorkingSetView } from "../../src/messages";

describe("C15 / WP08d — copie de travail sandbox", () => {
  it("`workingSet {viaBridge, canApply}` bascule le panneau en mode « copie sandbox »", () => {
    const files: WorkingSetView[] = [{ path: "src/a.cpp", status: "UPDATED" }];
    const s = reduce(
      initialState(),
      host({
        type: "workingSet",
        files,
        strategy: "sandbox working copy — Apply writes back to your repo",
        viaBridge: true,
        canApply: true,
      }),
    );
    expect(s.editsViaBridge).toBe(true);
    expect(s.canApplyChanges).toBe(true);
    expect(s.workingSet).toEqual(files);
  });

  it("`workingSet` read-only : working set poussé mais `apply` interdit", () => {
    const s = reduce(
      initialState(),
      host({
        type: "workingSet",
        files: [{ path: "x", status: "ADDED" }],
        strategy: "sandbox working copy · read-only (apply disabled)",
        viaBridge: true,
        canApply: false,
      }),
    );
    expect(s.editsViaBridge).toBe(true);
    expect(s.canApplyChanges).toBe(false);
  });

  it("`changesApplied` : notice info quand tout passe, warn quand des fichiers sont sautés", () => {
    let s = reduce(
      initialState(),
      host({ type: "changesApplied", applied: [{ path: "a", status: "UPDATED" }], skipped: [] }),
    );
    let n = s.notices.find((x) => x.id === "changes-applied");
    expect(n?.level).toBe("info");
    expect(n?.text).toContain("Applied 1 file");

    s = reduce(
      s,
      host({
        type: "changesApplied",
        applied: [],
        skipped: [{ path: "b", reason: "host file changed since session start" }],
      }),
    );
    n = s.notices.find((x) => x.id === "changes-applied");
    expect(n?.level).toBe("warn");
    expect(n?.text).toContain("Skipped b — host file changed since session start.");
  });

  it("`changesApplied` vide (rien appliqué, rien sauté) ne pousse pas de notice", () => {
    const s = reduce(initialState(), host({ type: "changesApplied", applied: [], skipped: [] }));
    expect(s.notices.find((x) => x.id === "changes-applied")).toBeUndefined();
  });

  it("`reset` efface l'état WP08d", () => {
    let s = reduce(
      initialState(),
      host({
        type: "workingSet",
        files: [{ path: "x", status: "ADDED" }],
        strategy: "sandbox working copy",
        viaBridge: true,
        canApply: true,
      }),
    );
    s = reduce(s, host({ type: "reset" }));
    expect(s.editsViaBridge).toBe(false);
    expect(s.canApplyChanges).toBe(false);
    expect(s.workingSet).toEqual([]);
  });
});
