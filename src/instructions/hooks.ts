import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { log } from "../logging";
import { evaluate } from "../permissions/policy";
import type { PermissionStore } from "../permissions/store";

/**
 * Hooks côté hôte (item 118) — ambition **volontairement limitée** : sur des
 * événements du **client**, pas sur les appels d'outils de l'agent (qui vivent
 * dans le sandbox). Chargés **uniquement** depuis les réglages VS Code (soumis à
 * Workspace Trust), **jamais** depuis le dépôt : un `git clone` ne doit pas
 * pouvoir installer une exécution automatique.
 *
 * Chaque commande passe par `permissions/policy.ts` — un hook n'est pas une porte
 * dérobée. Un hook qui échoue est **visible** mais n'interrompt rien.
 */

export type HookEvent = "onTurnStarted" | "onTurnFinished" | "onFilesChanged" | "onSessionStarted";

interface HookDef {
  command: string;
  when?: "always" | "filesChanged";
}

export class Hooks {
  constructor(
    private readonly permissions: PermissionStore,
    private readonly onResult: (item: { command: string; ok: boolean; output: string }) => void,
  ) {}

  async run(event: HookEvent, ctx: { filesChanged: boolean; cwd: string | null }): Promise<void> {
    if (!vscode.workspace.isTrusted || !ctx.cwd) {
      return;
    }
    const config = vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<Record<string, HookDef[]>>("hooks", {});
    for (const hook of config[event] ?? []) {
      if (hook.when === "filesChanged" && !ctx.filesChanged) {
        continue;
      }
      const { decision } = evaluate(
        { kind: "command", command: hook.command },
        this.permissions.effective(),
        (p) => this.permissions.isSensitivePath(p),
      );
      if (decision.verdict === "deny") {
        this.onResult({ command: hook.command, ok: false, output: `blocked by rule ${decision.rule}` });
        continue;
      }
      await this.exec(hook.command, ctx.cwd);
    }
  }

  private exec(command: string, cwd: string): Promise<void> {
    return new Promise((resolve) => {
      execFile(command.split(" ")[0], command.split(" ").slice(1), { cwd, timeout: 60_000 }, (err, out, errOut) => {
        const output = `${out}${errOut}`.trim().slice(0, 4000);
        this.onResult({ command, ok: !err, output: output || (err ? String(err) : "(no output)") });
        if (err) {
          log.debug(`hook failed: ${command}`, err);
        }
        resolve();
      });
    });
  }
}
