import { describe, expect, it } from "vitest";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { HostToWebview, WorkingSetView } from "../../src/messages";

const at = (message: HostToWebview) => host(message, 1000);

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

  it("flux : tour bridge → working set copie sandbox → file_diff → apply avec conflit", () => {
    // Séquence des messages hôte→webview qu'émet `ChatViewProvider` pour un tour
    // WP08d (le `checkpoint` du bridge est intercepté par l'hôte, pas de message).
    let s: AppState = reduce(initialState(), at({ type: "connection", state: "open" }));
    s = reduce(s, at({ type: "protocol", version: 2, capabilities: ["turns", "diffs", "checkpoints", "apply"], degraded: false }));
    s = reduce(s, host({ type: "bridge", message: { type: "session_started", conversation_id: "c1", llm_source: "create_payload", mode: "agent" } }));
    s = reduce(s, host({ type: "bridge", message: { type: "turn_started", turn_id: "t1" } }, 1000));
    s = reduce(s, host({ type: "bridge", message: { type: "turn_finished", turn_id: "t1", reason: "completed" } }, 2000));
    // `files_changed` du bridge → l'hôte poste `workingSet {viaBridge, canApply}`
    s = reduce(
      s,
      at({
        type: "workingSet",
        files: [{ path: "src/black.cpp", status: "UPDATED" }],
        strategy: "sandbox working copy — Apply writes back to your repo",
        viaBridge: true,
        canApply: true,
      }),
    );
    expect(s.phase.kind).toBe("idle");
    expect(s.editsViaBridge).toBe(true);
    expect(s.workingSet.map((f) => f.path)).toEqual(["src/black.cpp"]);

    // ouverture du diff → `request_diff` → `file_diff` → message `fileDiff`
    s = reduce(s, at({ type: "fileDiff", path: "src/black.cpp", unified: "@@ -1 +1 @@\n-x\n+y", conflict: false }));
    expect(s.fileDiffs["src/black.cpp"].unified).toContain("+y");

    // Apply → `changes_applied` avec un fichier en conflit
    s = reduce(
      s,
      at({
        type: "changesApplied",
        applied: [{ path: "src/black.cpp", status: "UPDATED" }],
        skipped: [{ path: "src/other.cpp", reason: "host file changed since session start" }],
      }),
    );
    const n = s.notices.find((x) => x.id === "changes-applied");
    expect(n?.level).toBe("warn");
    expect(n?.text).toContain("Applied 1 file");
    expect(n?.text).toContain("Skipped src/other.cpp");
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
