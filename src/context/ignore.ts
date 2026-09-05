import * as vscode from "vscode";
import { globToRegExp } from "../glob";
import { log } from "../logging";

/**
 * Exclusions (C04 §ignore, item 79). Deux niveaux :
 *  - `.gitignore` + `.agenticenvignore` : masquent les **propositions** et les
 *    **résolutions** automatiques (recherche floue, fichiers récents).
 *  - Motifs **sensibles** (`SENSITIVE_GLOBS`) : jamais attachés automatiquement,
 *    quoi qu'en dise le `.gitignore`. Les attacher explicitement reste possible
 *    mais déclenche une confirmation (C07).
 *
 * Le test « secret » vérifie qu'un `.env` n'apparaît nulle part d'automatique.
 */

export const SENSITIVE_GLOBS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "id_rsa",
  "id_rsa.*",
  "id_ed25519",
  "id_ed25519.*",
  ".npmrc",
  ".netrc",
  "credentials",
  "credentials.*",
  "*.credentials",
];

/** Toujours exclus des propositions, indépendamment du .gitignore. */
export const NOISE_DIRS = ["node_modules", ".git", "build", "dist", "out", ".venv", "__pycache__"];


const SENSITIVE_RES = SENSITIVE_GLOBS.map(globToRegExp);

/** `true` si le **nom de base** correspond à un motif sensible. */
export function isSensitivePath(pathOrName: string): boolean {
  const base = pathOrName.split(/[\\/]/).pop() ?? pathOrName;
  return SENSITIVE_RES.some((re) => re.test(base));
}

/** `true` si le chemin relatif traverse un dossier bruyant. */
export function isNoise(relPath: string): boolean {
  return relPath.split(/[\\/]/).some((p) => NOISE_DIRS.includes(p));
}

interface IgnoreRule {
  re: RegExp;
  negate: boolean;
}

/** Parse un contenu type `.gitignore` en règles. Sous-ensemble : pas de `!`-ordre complexe. */
export function parseIgnoreFile(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const negate = line.startsWith("!");
    const pattern = negate ? line.slice(1) : line;
    const anchored = pattern.startsWith("/") ? pattern.slice(1) : "**/" + pattern;
    const body = anchored.replace(/\/$/, "/**");
    rules.push({ re: globToRegExp(body), negate });
  }
  return rules;
}

export class IgnoreMatcher {
  constructor(private readonly rules: IgnoreRule[]) {}

  ignores(relPath: string): boolean {
    let ignored = isNoise(relPath);
    for (const rule of this.rules) {
      if (rule.re.test(relPath)) {
        ignored = !rule.negate;
      }
    }
    return ignored;
  }
}

/** Charge `.gitignore` + `.agenticenvignore` à la racine du dossier ouvert. */
export async function loadIgnore(folder: vscode.Uri): Promise<IgnoreMatcher> {
  const rules: IgnoreRule[] = [];
  for (const name of [".gitignore", ".agenticenvignore"]) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, name));
      rules.push(...parseIgnoreFile(new TextDecoder().decode(bytes)));
    } catch (err) {
      log.trace("ignore: no " + name, err);
    }
  }
  return new IgnoreMatcher(rules);
}
