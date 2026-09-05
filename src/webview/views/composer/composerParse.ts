/**
 * Détection pure du jeton actif sous le caret (C03 §3–4). Aucun état, aucun effet.
 */

export type ActiveToken =
  | { kind: "none" }
  | { kind: "slash"; query: string; start: number }
  | { kind: "mention"; query: string; start: number; prefix: string };

const MENTION_PREFIXES = ["file:", "sym:", "problems", "terminal", "git", "selection"];

/** `text` = contenu du textarea, `caret` = position du curseur. */
export function activeToken(text: string, caret: number): ActiveToken {
  const before = text.slice(0, caret);

  // `/` uniquement en tout début de champ (C03 §4)
  const slash = /^\/([\w-]*)$/.exec(before);
  if (slash) {
    return { kind: "slash", query: slash[1], start: 0 };
  }

  // `#token` : `#` précédé d'un espace/début, sans espace dans le token
  const mention = /(?:^|\s)#([\w:./-]*)$/.exec(before);
  if (mention) {
    const raw = mention[1];
    const start = caret - raw.length - 1;
    const prefix = MENTION_PREFIXES.find((p) => raw.startsWith(p)) ?? "";
    const query = prefix ? raw.slice(prefix.length) : raw;
    return { kind: "mention", query, start, prefix };
  }

  return { kind: "none" };
}

/** Retire le jeton `[start, caret)` du texte (après validation d'une référence). */
export function stripToken(text: string, start: number, caret: number): { text: string; caret: number } {
  const head = text.slice(0, start).replace(/\s+$/, "");
  const tail = text.slice(caret);
  const joined = head && tail && !tail.startsWith(" ") ? head + " " + tail.trimStart() : head + tail;
  return { text: joined.trimStart() === joined ? joined : joined, caret: head.length };
}

/** `/xxx` complet en tête ⇒ nom de commande, sinon `null`. */
export function parseSlash(text: string): { command: string; args: string } | null {
  const m = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return m ? { command: m[1], args: m[2] ?? "" } : null;
}
