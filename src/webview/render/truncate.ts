import { log } from "../log";

/**
 * Troncature d'une sortie longue au **rendu** (C02 §8) — l'item garde le contenu
 * complet en mémoire. Pur (le `log.debug` d'un `catch` est un garde-fou, pas un
 * effet observable).
 */

export const MAX_LINES = 200;
export const MAX_BYTES = 20 * 1024;
export const EDITOR_THRESHOLD_LINES = 2000;

export interface Truncation {
  truncated: boolean;
  head: string;
  tail: string;
  hiddenLines: number;
  /** Au-delà de ce seuil, proposer « Open in editor » plutôt que « Show all ». */
  preferEditor: boolean;
}

export function truncateOutput(text: string): Truncation {
  const lines = text.split("\n");
  const overBytes = text.length > MAX_BYTES;
  const overLines = lines.length > MAX_LINES;
  if (!overLines && !overBytes) {
    return { truncated: false, head: text, tail: "", hiddenLines: 0, preferEditor: false };
  }
  const keep = overBytes && !overLines ? Math.min(lines.length, MAX_LINES) : MAX_LINES;
  const headCount = Math.ceil(keep * 0.7);
  const tailCount = keep - headCount;
  return {
    truncated: true,
    head: lines.slice(0, headCount).join("\n"),
    tail: tailCount > 0 ? lines.slice(-tailCount).join("\n") : "",
    hiddenLines: lines.length - headCount - tailCount,
    preferEditor: lines.length > EDITOR_THRESHOLD_LINES,
  };
}

/** Extrait un texte lisible d'une observation SDK (`observation` peut être varié). */
export function observationText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const key of ["output", "content", "text", "stdout", "message"]) {
      if (typeof r[key] === "string") {
        return r[key] as string;
      }
    }
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch (err) {
    log.debug("observationText: unserializable observation", err);
    return String(result);
  }
}
