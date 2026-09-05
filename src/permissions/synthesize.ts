import type { PendingActionView } from "../messages";
import { displayPath } from "../paths";
import { destructiveMatches, type EvalAction } from "./policy";

/**
 * Reconstruit une action en attente à partir du **dernier `ActionEvent`** quand
 * le bridge v1 n'envoie qu'un `awaiting_confirmation` sans charge utile (C07 §1).
 * Ce n'est pas simuler l'état du bridge (P1) : c'est présenter ce qu'on a
 * réellement vu passer. Si on n'a rien, on l'avoue (`blind: true`).
 */
export interface LastAction {
  toolName: string;
  args: Record<string, unknown>;
}

export function synthesizePending(last: LastAction | null, actionId: string): PendingActionView {
  if (!last) {
    return { actionId, kind: "other", summary: "unknown action", warnings: [], blind: true };
  }
  const a = last.args;
  const tool = last.toolName.toLowerCase();

  if (tool.includes("terminal") || tool.includes("bash") || tool.includes("exec")) {
    const command = str(a.command) ?? "";
    return {
      actionId,
      kind: "command",
      summary: command || "(empty command)",
      command,
      cwd: str(a.cwd) ?? str(a.workdir),
      warnings: destructiveMatches(command),
      blind: !command,
    };
  }

  if (tool.includes("edit") || tool.includes("str_replace") || tool.includes("apply_patch")) {
    const path = str(a.path);
    return {
      actionId,
      kind: "edit",
      summary: path ? `edit ${displayPath(path)}` : "edit a file",
      path,
      warnings: [],
      blind: !path,
    };
  }

  if (tool.includes("browser") || tool.includes("fetch") || tool.includes("http")) {
    const target = str(a.url) ?? str(a.target);
    return { actionId, kind: "network", summary: target ?? "network request", path: target, warnings: [], blind: !target };
  }

  return { actionId, kind: "other", summary: `${last.toolName}`, warnings: [], blind: false };
}

/** `PendingActionView` → `EvalAction` pour `evaluate()`. */
export function toEvalAction(p: PendingActionView): EvalAction {
  return { kind: p.kind, command: p.command, path: p.path, target: p.path };
}

/** Motif `allow` dérivé d'une commande approuvée « toujours » : son premier mot, ancré. */
export function allowPatternFor(p: PendingActionView): string {
  if (p.kind === "command" && p.command) {
    const first = p.command.trim().split(/\s+/)[0]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return first ? `^${first}\\b` : "";
  }
  if (p.kind === "edit" && p.path) {
    return p.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return "";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
