import { asArray, parseFrontmatter } from "./frontmatter";
import { matchesAnyGlob } from "../glob";

/**
 * Assemblage des instructions (C10 §7). **Pur.** L'hôte fournit le contenu des
 * fichiers ; cette fonction décide lesquels s'appliquent et compose le bloc
 * étiqueté par source. Les instructions voyagent dans `context[]` avec
 * `kind: "instructions"`, jamais concaténées dans `text`. En cas de saturation,
 * c'est le **contexte** qu'on tronque, pas les instructions.
 */

export const INSTRUCTIONS_CAP_BYTES = 16 * 1024;

export interface LoadedFile {
  /** chemin relatif au dépôt, pour l'étiquette et l'affichage */
  rel: string;
  content: string;
  /** `undefined` = racine (toujours) ; sinon globs `applyTo` */
  applyTo?: string[];
  /** `true` si `applyTo` déclaré mais vide/absent (bug de config → ignoré + notice) */
  misconfigured?: boolean;
}

export interface ScopedFileInput {
  rel: string;
  raw: string;
}

/** Sépare le frontmatter d'un `.instructions.md`. */
export function parseInstructionFile(rel: string, raw: string): LoadedFile {
  const { data, body } = parseFrontmatter(raw);
  const applyTo = asArray(data.applyTo);
  return {
    rel,
    content: body.trim(),
    applyTo,
    misconfigured: applyTo.length === 0,
  };
}

export interface AssembleResult {
  /** bloc unique, étiqueté par source, prêt pour `context[{kind:"instructions"}]` */
  text: string;
  /** noms des fichiers effectivement appliqués (chip « N instruction files ») */
  applied: string[];
  /** fichiers ignorés + raison (→ notice) */
  ignored: { rel: string; reason: string }[];
  truncated: boolean;
}

export function assembleInstructions(
  roots: LoadedFile[],
  scoped: LoadedFile[],
  modeInstructions: string | null,
  attachedRelPaths: string[],
): AssembleResult {
  const parts: string[] = [];
  const applied: string[] = [];
  const ignored: { rel: string; reason: string }[] = [];

  for (const f of roots) {
    if (f.content) {
      parts.push(`# From ${f.rel}\n\n${f.content}`);
      applied.push(f.rel);
    }
  }

  for (const f of scoped) {
    if (f.misconfigured) {
      ignored.push({ rel: f.rel, reason: "no `applyTo` — a conditional instruction needs a condition" });
      continue;
    }
    const matches = attachedRelPaths.some((p) => matchesAnyGlob(p, f.applyTo ?? []));
    if (matches && f.content) {
      parts.push(`# From ${f.rel} (scoped)\n\n${f.content}`);
      applied.push(f.rel);
    }
  }

  if (modeInstructions?.trim()) {
    parts.push(`# From the active mode\n\n${modeInstructions.trim()}`);
    applied.push("(mode)");
  }

  let text = parts.join("\n\n---\n\n");
  let truncated = false;
  if (Buffer.byteLength(text, "utf8") > INSTRUCTIONS_CAP_BYTES) {
    text = text.slice(0, INSTRUCTIONS_CAP_BYTES) + "\n\n… (instructions truncated)";
    truncated = true;
  }
  return { text, applied, ignored, truncated };
}
