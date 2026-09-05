import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { log } from "../logging";
import { git, isGitRepo } from "./git";

/**
 * Checkpoints (C06 §1). Granularité = **le tour** : un instantané est pris au
 * `turn_started` (pas avant chaque édition), c'est l'annulation naturelle.
 *
 * **Stratégie A, exécutée côté hôte** : le dossier ouvert étant bind-monté dans
 * le sandbox, hôte et agent voient les mêmes fichiers. Au début du tour,
 * `git stash create` capture l'état des fichiers **suivis** sans rien écrire dans
 * `refs/heads` ni dans la stash-list (commit dangling, invisible dans
 * `git log`/`git branch`). Les fichiers **non suivis** avant le tour sont listés
 * pour repérer les créations de l'agent.
 *
 * **Repli** hors dépôt git : pas de checkpoint par fichier (on ne connaît pas la
 * liste des fichiers avant le tour) — l'UI le dit clairement.
 *
 * `[À CONFIRMER]` **tranché** : pas de message bridge `checkpoint` requis pour ce
 * chemin. Un bridge v2 pourra pousser `checkpoint {...}` plus tard ; le contrat
 * client (WorkingSet, undo) reste identique.
 */

export type CheckpointStrategy = "git" | "none";

interface TurnCheckpoint {
  turnId: string;
  strategy: CheckpointStrategy;
  baseSha: string | null;
  untrackedBefore: Set<string>;
  /** hash du contenu de chaque fichier à `turn_finished`, pour détecter un conflit. */
  postTurnHashes: Map<string, string>;
  createdAt: number;
}

export interface WorkingSetEntry {
  path: string; // relatif au dossier
  status: "M" | "A" | "D";
  added?: number;
  removed?: number;
}

const MAX_CHECKPOINTS = 20;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export class CheckpointStore {
  private readonly turns = new Map<string, TurnCheckpoint>();
  private root: string | null = null;

  setRoot(fsPath: string | null): void {
    this.root = fsPath;
  }

  strategyLabel(): string {
    const last = [...this.turns.values()].pop();
    if (!last) {
      return "no checkpoint yet";
    }
    return last.strategy === "git"
      ? "checkpoint: git (invisible ref)"
      : "checkpoint: unavailable (not a git repo)";
  }

  async beginTurn(turnId: string): Promise<void> {
    if (!this.root || this.turns.has(turnId)) {
      return;
    }
    const cp: TurnCheckpoint = {
      turnId,
      strategy: "none",
      baseSha: null,
      untrackedBefore: new Set(),
      postTurnHashes: new Map(),
      createdAt: Date.now(),
    };
    try {
      if (await isGitRepo(this.root)) {
        cp.strategy = "git";
        const stash = await git(this.root, ["stash", "create"]);
        cp.baseSha =
          stash.stdout.trim() ||
          (await git(this.root, ["rev-parse", "HEAD"])).stdout.trim() ||
          null;
        const untracked = await git(this.root, ["ls-files", "--others", "--exclude-standard"]);
        cp.untrackedBefore = new Set(untracked.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
      }
    } catch (err) {
      log.warn("checkpoint beginTurn failed:", err);
    }
    this.turns.set(turnId, cp);
    this.purge();
  }

  async finishTurn(turnId: string): Promise<void> {
    const cp = this.turns.get(turnId);
    if (!cp || !this.root) {
      return;
    }
    for (const e of await this.changedFiles(turnId)) {
      cp.postTurnHashes.set(e.path, await this.hashFile(e.path));
    }
  }

  async changedFiles(turnId: string): Promise<WorkingSetEntry[]> {
    const cp = this.turns.get(turnId);
    if (!cp || cp.strategy !== "git" || !cp.baseSha || !this.root) {
      return [];
    }
    const out: WorkingSetEntry[] = [];
    const tracked = await git(this.root, ["diff", "--name-status", cp.baseSha]);
    for (const line of tracked.stdout.split("\n")) {
      const m = /^([AMD])\t(.+)$/.exec(line.trim());
      if (m) {
        out.push({ path: m[2], status: m[1] as "M" | "A" | "D" });
      }
    }
    const untrackedNow = await git(this.root, ["ls-files", "--others", "--exclude-standard"]);
    for (const p of untrackedNow.stdout.split("\n").map((l) => l.trim()).filter(Boolean)) {
      if (!cp.untrackedBefore.has(p) && !out.some((e) => e.path === p)) {
        out.push({ path: p, status: "A" });
      }
    }
    return out.filter((e) => !isFiltered(e.path));
  }

  /** Diff **checkpoint → maintenant** pour un fichier (pas HEAD → maintenant). */
  async diffFile(turnId: string, relPath: string): Promise<string | null> {
    const cp = this.turns.get(turnId);
    if (!cp || cp.strategy !== "git" || !cp.baseSha || !this.root) {
      return null;
    }
    if (cp.untrackedBefore.has(relPath)) {
      return null;
    }
    const r = await git(this.root, ["diff", "--no-color", cp.baseSha, "--", relPath]);
    if (r.stdout.trim()) {
      return r.stdout;
    }
    // fichier ajouté (non suivi au checkpoint) : diff de l'index intentionnel
    const untracked = await git(this.root, ["diff", "--no-color", "--no-index", "/dev/null", relPath]);
    return untracked.stdout || null;
  }

  hasConflict(turnId: string, relPath: string): Promise<boolean> {
    const cp = this.turns.get(turnId);
    const expected = cp?.postTurnHashes.get(relPath);
    if (!expected) {
      return Promise.resolve(false);
    }
    return this.hashFile(relPath).then((now) => now !== expected);
  }

  /** Restaure un fichier depuis le checkpoint. Refuse en cas de conflit. */
  async restoreFile(turnId: string, relPath: string): Promise<"ok" | "conflict" | "unavailable"> {
    const cp = this.turns.get(turnId);
    if (!cp || cp.strategy !== "git" || !cp.baseSha || !this.root) {
      return "unavailable";
    }
    if (await this.hasConflict(turnId, relPath)) {
      return "conflict";
    }
    if (cp.untrackedBefore.has(relPath) || (await this.wasAdded(turnId, relPath))) {
      // création de l'agent → supprimer
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(vscode.Uri.file(this.root), relPath));
      return "ok";
    }
    const r = await git(this.root, ["checkout", cp.baseSha, "--", relPath]);
    return r.code === 0 ? "ok" : "unavailable";
  }

  async restoreTurn(turnId: string, force = false): Promise<{ restored: string[]; conflicts: string[] }> {
    const files = await this.changedFiles(turnId);
    const restored: string[] = [];
    const conflicts: string[] = [];
    for (const f of files) {
      if (!force && (await this.hasConflict(turnId, f.path))) {
        conflicts.push(f.path);
        continue;
      }
      const res = await this.restoreFile(turnId, f.path);
      (res === "ok" ? restored : conflicts).push(f.path);
    }
    return { restored, conflicts };
  }

  /** Contenu « avant le tour » d'un fichier (pour le diff virtuel dans l'éditeur). */
  async baseContent(turnId: string, relPath: string): Promise<string | null> {
    const cp = this.turns.get(turnId);
    if (!cp || cp.strategy !== "git" || !cp.baseSha || !this.root) {
      return null;
    }
    const r = await git(this.root, ["show", `${cp.baseSha}:${relPath}`]);
    return r.code === 0 ? r.stdout : "";
  }

  turnIds(): string[] {
    return [...this.turns.keys()];
  }

  private async wasAdded(turnId: string, relPath: string): Promise<boolean> {
    return (await this.changedFiles(turnId)).some((e) => e.path === relPath && e.status === "A");
  }

  private async hashFile(relPath: string): Promise<string> {
    if (!this.root) {
      return "";
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(vscode.Uri.file(this.root), relPath),
      );
      return createHash("sha1").update(bytes).digest("hex");
    } catch (err) {
      log.trace("checkpoint hashFile: file gone", err);
      return "deleted";
    }
  }

  private purge(): void {
    const now = Date.now();
    const entries = [...this.turns.entries()];
    for (const [id, cp] of entries) {
      if (now - cp.createdAt > MAX_AGE_MS) {
        this.turns.delete(id);
      }
    }
    while (this.turns.size > MAX_CHECKPOINTS) {
      const oldest = this.turns.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.turns.delete(oldest);
    }
  }
}

/** Filtrage conservé de C00/bridge : artefacts internes hors working set. */
export function isFiltered(path: string): boolean {
  return /(^|\/)(\.git|\.openhands|conversations|node_modules)(\/|$)/.test(path);
}
