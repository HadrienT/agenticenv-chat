import { execFile } from "node:child_process";

/** Exécution `git` minimale (sans dépendance) pour les checkpoints C06. */
export function git(
  cwd: string,
  args: string[],
  opts: { input?: string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      "git",
      args,
      { cwd, timeout: opts.timeoutMs ?? 8000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number }) | null;
        resolve({ code: e?.code ?? (err ? 1 : 0), stdout, stderr });
      },
    );
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const r = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return r.code === 0 && r.stdout.trim() === "true";
}
