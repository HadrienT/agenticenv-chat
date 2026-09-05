import { asString, parseFrontmatter } from "./frontmatter";

/**
 * `.prompt.md` → `/`-commande (C10 §3, items 78/119). Substitution des variables
 * `${arg}`, `${selection}`, `${file}`, `${workspaceFolder}` **côté hôte**. Le
 * résultat est **prérempli dans le composer**, jamais envoyé directement.
 */

export interface PromptDef {
  name: string;
  description: string;
  argsHint?: string;
  mode?: string;
  context: string[];
  body: string;
}

export function parsePrompt(fileBaseName: string, raw: string): PromptDef {
  const { data, body } = parseFrontmatter(raw);
  const name = asString(data.name) ?? fileBaseName.replace(/\.prompt\.md$/, "");
  return {
    name,
    description: asString(data.description) ?? name,
    argsHint: asString(data.argsHint),
    mode: asString(data.mode),
    context: Array.isArray(data.context) ? data.context : data.context ? [data.context] : [],
    body: body.trim(),
  };
}

export interface SubstVars {
  arg: string;
  selection: string;
  file: string;
  workspaceFolder: string;
}

/** Substitue les variables. Retourne les variables **manquantes** (référencées mais vides). */
export function substitute(
  template: string,
  vars: SubstVars,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const table = vars as unknown as Record<string, string>;
  const text = template.replace(/\$\{(\w+)\}/g, (_m, key: string) => {
    const value = table[key];
    if (value === undefined) {
      missing.push(key);
      return `\${${key}}`;
    }
    if (value === "" && (key === "arg" || key === "file")) {
      missing.push(key);
    }
    return value;
  });
  return { text, missing };
}
