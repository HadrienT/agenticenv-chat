import { matchesAnyGlob as matchGlobs } from "../glob";
/**
 * Politique de permissions (C07 §2). **Pur** — l'évaluation vit côté hôte (P2) et
 * ne dépend d'aucune API. Une webview compromise ne peut pas s'auto-autoriser.
 *
 * Règles cardinales :
 *  - `deny` gagne **toujours** sur `allow`, quel que soit le mode.
 *  - Une commande contenant un **enchaînement shell** (`;`, `&&`, `|`, `` ` ``,
 *    `$(`, `>`, `&`) ne peut **jamais** être auto-autorisée (C07 §3), même si son
 *    préfixe correspond à une règle `allow`.
 *  - Une regex invalide est **ignorée** (jamais interprétée comme `allow`).
 *  - Un chemin sensible n'est **jamais** auto-approuvé, `autoAll` compris (§4).
 */

export type PermissionMode = "ask" | "autoEdit" | "autoAll" | "readOnly";

export interface Policy {
  mode: PermissionMode;
  allow: string[];
  deny: string[];
  denyPaths: string[];
}

export type PendingActionKind = "command" | "edit" | "network" | "other";

export interface EvalAction {
  kind: PendingActionKind;
  /** commande shell (kind === "command") */
  command?: string;
  /** chemin visé (kind === "edit") */
  path?: string;
  /** hôte/URL (kind === "network") */
  target?: string;
}

export type Decision =
  | { verdict: "allow"; rule: string }
  | { verdict: "ask"; reason: string }
  | { verdict: "deny"; rule: string };

/** Métacaractères d'enchaînement : leur présence interdit l'auto-approbation. */
export const CHAIN_CHARS = /[;&|`]|\$\(|>>?|<\(|\n/;

export function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

export interface EvalResult {
  decision: Decision;
  /** regex invalides rencontrées (à signaler par un `notice`, jamais silencieux). */
  invalidRules: string[];
}

export function evaluate(action: EvalAction, policy: Policy, sensitive: (p: string) => boolean): EvalResult {
  const invalidRules: string[] = [];
  const compile = (patterns: string[]): { re: RegExp; src: string }[] =>
    patterns.flatMap((src) => {
      try {
        return [{ re: new RegExp(src), src }];
      } catch {
        // discipline:surfaced — l'erreur n'est pas avalée : la regex invalide
        // remonte dans `invalidRules`, que l'hôte transforme en `notice`.
        invalidRules.push(src);
        return [];
      }
    });

  const deny = compile(policy.deny);
  const allow = compile(policy.allow);

  // 1. chemin sensible : jamais auto, quel que soit le mode
  const targetPath = action.path;
  if (targetPath && (sensitive(targetPath) || matchGlobs(targetPath, policy.denyPaths))) {
    return { decision: { verdict: "ask", reason: `touches a sensitive file: ${targetPath}` }, invalidRules };
  }

  const subject = subjectString(action);

  // 2. denylist gagne toujours
  for (const { re, src } of deny) {
    if (re.test(subject)) {
      return { decision: { verdict: "deny", rule: src }, invalidRules };
    }
  }

  // 3. readOnly : aucune écriture ni commande
  if (policy.mode === "readOnly") {
    return { decision: { verdict: "ask", reason: "read-only mode: needs explicit approval" }, invalidRules };
  }

  // 4. autoAll : tout ce qui a survécu à la denylist passe
  if (policy.mode === "autoAll") {
    return { decision: { verdict: "allow", rule: "mode:autoAll" }, invalidRules };
  }

  // 5. autoEdit : les éditions passent
  if (policy.mode === "autoEdit" && action.kind === "edit") {
    return { decision: { verdict: "allow", rule: "mode:autoEdit" }, invalidRules };
  }

  // 6. allowlist — mais jamais sur une commande enchaînée
  if (action.kind === "command" && action.command && CHAIN_CHARS.test(action.command)) {
    return {
      decision: { verdict: "ask", reason: "command chains operators (;, &&, |, `, $(, >) — not auto-approvable" },
      invalidRules,
    };
  }
  for (const { re, src } of allow) {
    if (re.test(subject)) {
      return { decision: { verdict: "allow", rule: src }, invalidRules };
    }
  }

  return { decision: { verdict: "ask", reason: "no matching allow rule" }, invalidRules };
}

function subjectString(action: EvalAction): string {
  if (action.kind === "command" && action.command) {
    return normalizeCommand(action.command);
  }
  if (action.kind === "network" && action.target) {
    return action.target;
  }
  if (action.kind === "edit" && action.path) {
    return action.path;
  }
  return "";
}

export { matchGlobs };

// --- commandes destructrices (item 114) — surlignage, pas blocage ---

export interface DestructiveMatch {
  pattern: string;
  message: string;
}

const DESTRUCTIVE: { re: RegExp; message: string }[] = [
  { re: /\brm\s+-[a-z]*r/, message: "recursive delete" },
  { re: /\bgit\s+reset\s+--hard/, message: "discards uncommitted changes" },
  { re: /\bgit\s+clean\s+-[a-z]*f/, message: "deletes untracked files" },
  { re: /\bgit\s+push\s+.*--force|\bgit\s+push\s+-f\b/, message: "rewrites remote history" },
  { re: /\bdd\s+if=/, message: "raw disk write" },
  { re: /\bmkfs\b/, message: "formats a filesystem" },
  { re: /\bchmod\s+-R\s+777/, message: "world-writable, recursive" },
  { re: /\bcurl\b[^\n|]*\|\s*(sh|bash)\b/, message: "runs remote code" },
  { re: /\bwget\b[^\n|]*\|\s*(sh|bash)\b/, message: "runs remote code" },
  { re: /:\(\)\s*\{.*\}\s*;\s*:/, message: "fork bomb" },
];

export function destructiveMatches(command: string): DestructiveMatch[] {
  const norm = normalizeCommand(command);
  return DESTRUCTIVE.filter((d) => d.re.test(norm)).map((d) => ({
    pattern: d.re.source,
    message: d.message,
  }));
}
