import * as vscode from "vscode";
import { log } from "../logging";
import { SENSITIVE_GLOBS } from "../context/ignore";
import type { PermissionMode, Policy } from "./policy";

/**
 * Politique effective (C07 §2) : réglage `agenticenvChat.permissions` (fusion
 * workspace > user) + règles `allow` ajoutées par « Allow always » — persistées
 * en `workspaceState` (portée dossier) ou tenues en mémoire (portée session,
 * oubliées à la session suivante).
 */

const K_WORKSPACE_ALLOW = "agenticenvChat.permissions.allow";

const DEFAULT_DENY = ["\\brm\\s+-rf\\b", "\\bgit\\s+push\\b.*--force", ":\\(\\)\\{.*\\};:"];

export class PermissionStore {
  private sessionAllow: string[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Réinitialisé à chaque nouvelle session : la portée « session » est oubliée. */
  resetSession(): void {
    this.sessionAllow = [];
  }

  addAllow(pattern: string, scope: "session" | "workspace"): void {
    if (scope === "session") {
      this.sessionAllow.push(pattern);
      return;
    }
    const existing = this.context.workspaceState.get<string[]>(K_WORKSPACE_ALLOW, []);
    if (!existing.includes(pattern)) {
      void this.context.workspaceState.update(K_WORKSPACE_ALLOW, [...existing, pattern]);
    }
  }

  /** Politique effective, `readOnly` forcé si le dossier n'est pas de confiance (§7). */
  effective(): Policy {
    const cfg = vscode.workspace.getConfiguration("agenticenvChat").get<Partial<Policy>>("permissions", {});
    const workspaceAllow = this.context.workspaceState.get<string[]>(K_WORKSPACE_ALLOW, []);
    const trusted = vscode.workspace.isTrusted;

    const mode: PermissionMode = !trusted ? "readOnly" : (cfg.mode ?? "ask");
    return {
      mode,
      allow: [...(cfg.allow ?? []), ...workspaceAllow, ...this.sessionAllow],
      deny: [...DEFAULT_DENY, ...(cfg.deny ?? [])],
      denyPaths: [...SENSITIVE_GLOBS, ...(cfg.denyPaths ?? [])],
    };
  }

  isSensitivePath(p: string): boolean {
    const base = p.split(/[\\/]/).pop() ?? p;
    return SENSITIVE_GLOBS.some((g) => {
      const re = new RegExp(
        "^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$",
      );
      return re.test(base);
    });
  }

  logDecision(summary: string, rule: string, verdict: string): void {
    log.info(`permission: ${verdict} — ${summary} (rule: ${rule})`);
  }
}
