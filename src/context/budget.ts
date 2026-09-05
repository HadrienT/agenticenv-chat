import type { ContextChip } from "../messages";

/**
 * Répartition du budget de contexte (C04 §4). Pur.
 *
 * Le budget global vient de `context_window` (C13) moins une marge pour la
 * réponse. Les chips **explicites** de l'utilisateur sont servies avant les chips
 * automatiques, avec une part minimale garantie.
 */

export interface Budget {
  totalBytes: number;
  perContextBytes: number;
}

export interface Allocation {
  ref: ContextChip["ref"];
  bytes: number;
}

const MIN_PER_CHIP = 512;

export function allocate(
  chips: { chip: ContextChip; explicit: boolean }[],
  budget: Budget,
): Allocation[] {
  const ordered = [...chips].sort((a, b) => Number(b.explicit) - Number(a.explicit));
  const out: Allocation[] = [];
  let remaining = budget.totalBytes;

  for (let i = 0; i < ordered.length; i++) {
    const { chip } = ordered[i];
    const chipsLeft = ordered.length - i;
    // garde au moins MIN_PER_CHIP pour chacune des chips restantes
    const reserve = (chipsLeft - 1) * MIN_PER_CHIP;
    const ceiling = Math.min(budget.perContextBytes, Math.max(MIN_PER_CHIP, remaining - reserve));
    const bytes = Math.min(chip.estBytes || ceiling, ceiling);
    out.push({ ref: chip.ref, bytes: Math.max(0, bytes) });
    remaining -= bytes;
  }
  return out;
}

/** Tronque un texte à `maxBytes` (approximé en UTF-16 length), sur une limite de ligne si possible. */
export function truncateToBytes(text: string, maxBytes: number): { body: string; truncated: boolean } {
  if (text.length <= maxBytes) {
    return { body: text, truncated: false };
  }
  const cut = text.lastIndexOf("\n", maxBytes);
  const at = cut > maxBytes * 0.5 ? cut : maxBytes;
  return { body: text.slice(0, at) + "\n… (truncated)", truncated: true };
}
