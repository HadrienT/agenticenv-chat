import { describe, expect, it } from "vitest";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState } from "../../src/webview/store/types";
import type { WorkingSetView } from "../../src/messages";

describe("working set & file diffs (C06)", () => {
  it("message workingSet remplace la liste et affiche la stratégie", () => {
    const files: WorkingSetView[] = [{ path: "src/a.cpp", status: "M", added: 3, removed: 1 }];
    const s = reduce(initialState(), host({ type: "workingSet", files, strategy: "checkpoint: git (invisible ref)", viaBridge: false, canApply: false }));
    expect(s.workingSet).toEqual(files);
    expect(s.checkpointStrategy).toContain("git");
  });

  it("fileDiff stocke le diff par chemin ; workingSet purge les diffs orphelins", () => {
    let s = reduce(initialState(), host({ type: "workingSet", files: [{ path: "a", status: "M" }], strategy: "x", viaBridge: false, canApply: false }));
    s = reduce(s, host({ type: "fileDiff", path: "a", unified: "@@ -1 +1 @@\n-x\n+y", conflict: false }));
    expect(s.fileDiffs.a.unified).toContain("+y");
    // "a" disparaît du working set → son diff est purgé
    s = reduce(s, host({ type: "workingSet", files: [{ path: "b", status: "A" }], strategy: "x", viaBridge: false, canApply: false }));
    expect(s.fileDiffs.a).toBeUndefined();
  });

  it("fileDiff conflict et error transmis", () => {
    const s = reduce(
      initialState(),
      host({ type: "fileDiff", path: "a", unified: "", conflict: true, error: "diff unavailable" }),
    );
    expect(s.fileDiffs.a).toEqual({ unified: "", conflict: true, error: "diff unavailable" });
  });
});
