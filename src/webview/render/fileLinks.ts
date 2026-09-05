/**
 * Détection de références de fichiers dans du texte (items 27, 44) : `path:line`,
 * `path:line:col`, ou un chemin seul qui « ressemble » à un fichier du dépôt.
 *
 * Pur et sans `vscode` : la **traduction** réelle sandbox↔hôte reste côté hôte
 * (`paths.ts`). La webview décide juste si une référence vaut la peine d'être
 * cliquable ; au clic, l'hôte traduit et ouvre (ou ignore si intraduisible —
 * 01-ARCHITECTURE §5).
 */

export interface FileRef {
  /** Portion exacte du texte reconnue. */
  match: string;
  /** Chemin (conteneur-absolu ou relatif au dépôt). */
  path: string;
  line?: number;
  col?: number;
  index: number;
}

const SOURCE_EXT =
  "cpp|cc|cxx|hpp|hh|h|c|ts|tsx|js|jsx|py|json|ya?ml|cmake|txt|md|sql|sh|toml|ini|cfg";

// chemin (absolu /… ou relatif a/b/c) suivi éventuellement de :ligne[:col]
const REF_RE = new RegExp(
  String.raw`(?<![\w./-])(` +
    String.raw`(?:/[\w.-]+)+\.(?:${SOURCE_EXT})` + // absolu
    String.raw`|(?:[\w.-]+/)+[\w.-]+\.(?:${SOURCE_EXT})` + // relatif avec dossier
    String.raw`|[\w-]+\.(?:${SOURCE_EXT})` + // fichier nu
    String.raw`)(?::(\d+))?(?::(\d+))?`,
  "g",
);

export function detectFileRefs(text: string, sandboxRoot: string): FileRef[] {
  const refs: FileRef[] = [];
  for (const m of text.matchAll(REF_RE)) {
    const path = m[1];
    // filtre le bruit : "1.2.3", "e.g", URLs déjà gérées par le linkify
    if (/^\d+\.\d+/.test(path)) {
      continue;
    }
    refs.push({
      match: m[0],
      path,
      line: m[2] ? Number(m[2]) : undefined,
      col: m[3] ? Number(m[3]) : undefined,
      index: m.index ?? 0,
    });
  }
  void sandboxRoot; // réservé : filtrage plus fin quand l'hôte annoncera les chemins connus
  return refs;
}

/**
 * Rend `text` en HTML échappé où chaque référence de fichier devient un lien
 * `<a class="agx-filelink" data-agx-file data-agx-line>`. Pur.
 */
export function fileRefsToHtml(
  text: string,
  sandboxRoot: string | null,
  escape: (s: string) => string,
): string {
  if (!sandboxRoot) {
    return escape(text);
  }
  const refs = detectFileRefs(text, sandboxRoot);
  if (refs.length === 0) {
    return escape(text);
  }
  let out = "";
  let cursor = 0;
  for (const ref of refs) {
    out += escape(text.slice(cursor, ref.index));
    const lineAttr = ref.line !== undefined ? ` data-agx-line="${ref.line}"` : "";
    out += `<a class="agx-filelink" href="#" data-agx-file="${escape(ref.path)}"${lineAttr}>${escape(ref.match)}</a>`;
    cursor = ref.index + ref.match.length;
  }
  out += escape(text.slice(cursor));
  return out;
}

/** Affichage court d'un chemin conteneur sous la racine sandbox. */
export function shortenPath(path: string, sandboxRoot: string): string {
  const root = sandboxRoot.replace(/\/+$/, "");
  if (path === root) {
    return ".";
  }
  return path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
}
