import * as vscode from "vscode";

/**
 * Traducteur **unique** sandbox ↔ hôte (01-ARCHITECTURE §5, L5 du WP C00).
 *
 * L'agent tourne dans un conteneur ; le dossier ouvert dans VS Code est
 * bind-monté à `sandboxRoot` (par défaut `/workspace/project`). Tout chemin dans
 * un `ActionEvent`, une `ObservationEvent`, un `files_changed` ou un diff est donc
 * exprimé côté conteneur.
 *
 * Règles :
 *  - Aucun autre fichier ne concatène le littéral de la racine sandbox. Un test
 *    de discipline grep `/workspace/project` hors de ce fichier.
 *  - Tout ce qui sort du montage (`/tmp`, `/workspace/conversations`, chemins
 *    étrangers) donne `null` : l'UI affiche alors un chemin **non cliquable**.
 *  - Le franchissement de frontière (`..`) est **rejeté**, pas normalisé.
 *  - Sans dossier ouvert (`hostRoot === null`), toutes les traductions donnent `null`.
 *
 * Ce module est purement lexical : il ne résout pas les liens symboliques. Un
 * appelant qui reçoit un chemin potentiellement symlinké hors du montage doit le
 * `realpath` avant traduction.
 */

export const DEFAULT_SANDBOX_ROOT = "/workspace/project";

export interface PathMapping {
  /** Racine du projet vue depuis le conteneur, ex. `/workspace/project`. */
  sandboxRoot: string;
  /** Racine du projet sur l'hôte, ou `null` si aucun dossier n'est ouvert. */
  hostRoot: vscode.Uri | null;
}

let mapping: PathMapping = { sandboxRoot: DEFAULT_SANDBOX_ROOT, hostRoot: null };

/** Appelé au `start_session` (et remis à zéro au `reset`). */
export function setMapping(next: PathMapping): void {
  mapping = {
    sandboxRoot: collapsePosix(next.sandboxRoot || DEFAULT_SANDBOX_ROOT),
    hostRoot: next.hostRoot,
  };
}

export function getMapping(): Readonly<PathMapping> {
  return mapping;
}

export function resetMapping(): void {
  mapping = { sandboxRoot: DEFAULT_SANDBOX_ROOT, hostRoot: null };
}

/** Chemin conteneur → segments relatifs sous la racine, ou `null` si dehors/dangereux. */
function relUnderRoot(sandboxPath: string): string[] | null {
  if (typeof sandboxPath !== "string" || !sandboxPath.startsWith("/")) {
    return null;
  }
  if (sandboxPath.split("/").includes("..")) {
    return null; // traversée rejetée sans normalisation
  }
  const norm = collapsePosix(sandboxPath);
  const root = mapping.sandboxRoot;
  if (norm === root) {
    return [];
  }
  if (!norm.startsWith(root + "/")) {
    return null;
  }
  return norm
    .slice(root.length + 1)
    .split("/")
    .filter((s) => s.length > 0);
}

/** Chemin conteneur → URI hôte. `null` si hors du montage projet. */
export function toHostUri(sandboxPath: string): vscode.Uri | null {
  if (!mapping.hostRoot) {
    return null;
  }
  const segs = relUnderRoot(sandboxPath);
  if (segs === null) {
    return null;
  }
  return segs.length === 0 ? mapping.hostRoot : vscode.Uri.joinPath(mapping.hostRoot, ...segs);
}

/** URI hôte → chemin conteneur. `null` si hors du dossier ouvert. */
export function toSandboxPath(uri: vscode.Uri): string | null {
  if (!mapping.hostRoot || uri.scheme !== "file") {
    return null;
  }
  const root = mapping.hostRoot.fsPath.replace(/[/\\]+$/, "");
  const p = uri.fsPath;
  const sep = root.includes("\\") ? "\\" : "/";
  if (p === root) {
    return mapping.sandboxRoot;
  }
  if (!p.startsWith(root + sep)) {
    return null;
  }
  const rel = p
    .slice(root.length + 1)
    .split(/[/\\]+/)
    .filter((s) => s.length > 0);
  if (rel.includes("..")) {
    return null;
  }
  return [mapping.sandboxRoot, ...rel].join("/");
}

/** Chemin relatif court, pour l'affichage. Renvoie le chemin brut si hors montage. */
export function displayPath(sandboxPath: string): string {
  const segs = relUnderRoot(sandboxPath);
  if (segs === null) {
    return sandboxPath;
  }
  return segs.join("/") || ".";
}

/** `true` si le chemin conteneur est traduisible en cible hôte cliquable. */
export function isInsideWorkspace(sandboxPath: string): boolean {
  return mapping.hostRoot !== null && relUnderRoot(sandboxPath) !== null;
}

/** Retire les segments vides et `.` ; ne touche pas aux `..` (rejetés en amont). */
function collapsePosix(p: string): string {
  const out = p.split("/").filter((s) => s.length > 0 && s !== ".");
  return "/" + out.join("/");
}
