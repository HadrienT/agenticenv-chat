import * as vscode from "vscode";
import { log } from "../logging";
import { collectDiagnostics } from "./diagnostics";

/**
 * Prompts de démarrage (item 10, C03 §8) : **dérivés du contexte réel**, jamais
 * génériques. Retourne 3–4 suggestions, ou un seul repli neutre si aucun signal.
 */
export async function starterPrompts(): Promise<string[]> {
  const out: string[] = [];
  try {
    const diags = (await collectDiagnostics("workspace", undefined)).filter(
      (d) => d.severity === "error",
    );
    if (diags.length) {
      const file = diags[0].sandboxPath.split("/").pop();
      out.push(`Fix the ${diags.length} error${diags.length === 1 ? "" : "s"} in ${file}`);
    }
  } catch (err) {
    log.trace("starters: diagnostics unavailable", err);
  }

  try {
    const git = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: { state: { workingTreeChanges: unknown[] } }[] } }>(
      "vscode.git",
    );
    const repo = git?.isActive ? git.exports.getAPI(1).repositories[0] : undefined;
    if (repo && repo.state.workingTreeChanges.length) {
      out.push("Review my uncommitted changes");
    }
  } catch (err) {
    log.trace("starters: git unavailable", err);
  }

  if (out.length === 0) {
    out.push("Explain this repository's structure");
    out.push("What should I work on next?");
  }
  return out.slice(0, 4);
}
