/**
 * Constructeurs de messages **purs** pour les points d'accroche éditeur (C11).
 * Aucun accès VS Code ici — testable en Node. Le contexte lourd (diff, symbole
 * englobant) est passé déjà résolu par l'appelant.
 */

export interface DiagnosticInput {
  /** `error` / `warning` / … */
  severity: string;
  message: string;
  /** chemin affichable (relatif au dossier). */
  file: string;
  line: number;
  source?: string;
  /** définition de la fonction/classe englobante, **pas** le fichier entier. */
  enclosing?: string;
}

/** « Fix with agent » — demande ciblée, contexte joint mais compact. */
export function fixMessage(d: DiagnosticInput): string {
  return [
    `Fix this ${d.severity} in ${d.file}:${d.line}:`,
    "",
    `${d.message}${d.source ? ` (${d.source})` : ""}`,
    d.enclosing ? `\nRelevant code:\n\n\`\`\`\n${d.enclosing}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** « Explain this error » — pas de correctif attendu, juste l'explication. */
export function explainMessage(d: DiagnosticInput): string {
  return [
    `Explain this ${d.severity} in ${d.file}:${d.line} — what causes it and how is it usually resolved?`,
    "",
    `${d.message}${d.source ? ` (${d.source})` : ""}`,
    d.enclosing ? `\nContext:\n\n\`\`\`\n${d.enclosing}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type CommitStyle = "conventional" | "plain";

/** Message pour générer un texte de commit à partir d'un diff. */
export function commitMessagePrompt(diff: string, style: CommitStyle, staged: boolean): string {
  const rule =
    style === "conventional"
      ? "Use the Conventional Commits format (type(scope): summary). Keep the summary under 72 characters."
      : "Write a plain imperative summary line under 72 characters, then an optional body.";
  return [
    `Write a commit message for the following ${staged ? "staged" : "unstaged"} changes.`,
    rule,
    "Output only the commit message, no preamble, no code fences.",
    "",
    "```diff",
    diff,
    "```",
  ].join("\n");
}

/** Message pour générer une description de PR (commits + diff contre la base). */
export function prDescriptionPrompt(base: string, log: string, diff: string): string {
  return [
    `Write a pull request description for this branch (base: ${base}).`,
    "Start with a one-paragraph summary, then a bulleted list of the notable changes, then a short test-plan section.",
    "Output Markdown only, no preamble.",
    "",
    "Commits:",
    log,
    "",
    "```diff",
    diff,
    "```",
  ].join("\n");
}

/** Message pour générer une commande shell à insérer (jamais exécutée). */
export function terminalCommandPrompt(request: string): string {
  return [
    `Give a single shell command for: ${request}`,
    "Output only the command on one line — no explanation, no code fences, no leading $.",
  ].join("\n");
}
