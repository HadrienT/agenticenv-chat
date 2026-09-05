import * as vscode from "vscode";
import { log } from "../logging";

/**
 * Provider `git` (C04 §git, item 72).
 *
 * `[À CONFIRMER]` **tranché** : on passe par l'extension intégrée `vscode.git` —
 * `vscode.extensions.getExtension("vscode.git")?.exports.getAPI(1)`. C'est l'API
 * publique stable de l'extension Git. Si le dossier n'est pas un dépôt, le
 * provider le **dit** ; il n'échoue pas.
 *
 * Types minimaux de l'API Git (on n'importe pas `@types` d'une extension) :
 */
interface GitRepoState {
  HEAD?: { name?: string; ahead?: number; behind?: number };
  workingTreeChanges: { uri: vscode.Uri; status: number }[];
  indexChanges: { uri: vscode.Uri; status: number }[];
}
interface GitRepo {
  state: GitRepoState;
  rootUri: vscode.Uri;
  diff(cached?: boolean): Promise<string>;
  log(opts?: { maxEntries?: number }): Promise<
    { hash: string; message: string; authorName?: string; authorDate?: Date }[]
  >;
}
interface GitApi {
  repositories: GitRepo[];
  getRepository(uri: vscode.Uri): GitRepo | null;
}

function api(): GitApi | null {
  try {
    const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
    return ext?.isActive ? ext.exports.getAPI(1) : null;
  } catch (err) {
    log.debug("git: extension API unavailable", err);
    return null;
  }
}

function repo(): GitRepo | null {
  const g = api();
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!g || !folder) {
    return null;
  }
  return g.getRepository(folder.uri) ?? g.repositories[0] ?? null;
}

export async function gitContext(
  what: "status" | "diff" | "log",
  maxBytes: number,
): Promise<{ label: string; body: string; truncated: boolean }> {
  const r = repo();
  if (!r) {
    return { label: `git ${what}`, body: "Not a git repository (or the Git extension is disabled).", truncated: false };
  }
  try {
    if (what === "status") {
      return { label: "git status", body: renderStatus(r.state), truncated: false };
    }
    if (what === "log") {
      const commits = await r.log({ maxEntries: 10 });
      const body = commits
        .map(
          (c) =>
            `${c.hash.slice(0, 8)}  ${c.message.split("\n")[0]}  — ${c.authorName ?? "?"}, ${relDate(c.authorDate)}`,
        )
        .join("\n");
      return { label: "git log", body: body || "No commits.", truncated: false };
    }
    const raw = await r.diff(false);
    const noBinary = stripBinaryHunks(raw);
    const truncated = noBinary.length > maxBytes;
    return {
      label: "git diff (unstaged)",
      body: truncated ? noBinary.slice(0, maxBytes) + "\n… (truncated)" : noBinary || "No unstaged changes.",
      truncated,
    };
  } catch (err) {
    log.debug(`git ${what} failed:`, err);
    return { label: `git ${what}`, body: `[unavailable: ${String(err)}]`, truncated: false };
  }
}

function renderStatus(state: GitRepoState): string {
  const branch = state.HEAD?.name ?? "(detached)";
  const ahead = state.HEAD?.ahead ?? 0;
  const behind = state.HEAD?.behind ?? 0;
  const tracking = ahead || behind ? ` (ahead ${ahead}, behind ${behind})` : "";
  const wt = state.workingTreeChanges.map((c) => `  M ${rel(c.uri)}`);
  const idx = state.indexChanges.map((c) => `  A ${rel(c.uri)}`);
  return [
    `branch ${branch}${tracking}`,
    idx.length ? `staged:\n${idx.join("\n")}` : "",
    wt.length ? `changed:\n${wt.join("\n")}` : "working tree clean",
  ]
    .filter(Boolean)
    .join("\n");
}

function rel(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri);
}

/** Retire les hunks de fichiers binaires d'un diff unifié. */
export function stripBinaryHunks(diff: string): string {
  return diff
    .split(/(?=^diff --git )/m)
    .filter((chunk) => !/^Binary files .* differ$/m.test(chunk) && !/^GIT binary patch$/m.test(chunk))
    .join("");
}

function relDate(d: Date | undefined): string {
  if (!d) {
    return "?";
  }
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days}d ago`;
}
