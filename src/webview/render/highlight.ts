import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cmake from "highlight.js/lib/languages/cmake";
import cpp from "highlight.js/lib/languages/cpp";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Coloration syntaxique — import **sélectif** de langages pour tenir le budget de
 * bundle (00-PRIMER §5). Le repo cible est du C++ : `cpp` n'est pas négociable
 * (C02 §2). Tout langage non enregistré retombe sur du texte brut échappé.
 *
 * Pur : `hljs.highlight` ne fait aucun effet de bord observable.
 */

const LANGUAGES: Record<string, LanguageFn> = {
  bash,
  c,
  cmake,
  cpp,
  diff,
  javascript,
  json,
  markdown,
  python,
  sql,
  typescript,
  yaml,
};

for (const [name, def] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, def);
}

const ALIASES: Record<string, string> = {
  "c++": "cpp",
  h: "cpp",
  hpp: "cpp",
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
};

export function resolveLanguage(lang: string): string | null {
  const key = lang.toLowerCase();
  const resolved = ALIASES[key] ?? key;
  return hljs.getLanguage(resolved) ? resolved : null;
}

/** Renvoie du HTML `<span class="hljs-…">` déjà échappé, ou l'échappement brut. */
export function highlightCode(code: string, lang: string): string {
  const resolved = resolveLanguage(lang);
  if (resolved) {
    return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value;
  }
  return escapeHtml(code);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
