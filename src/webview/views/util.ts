import { log } from "../log";

/** Formatage court d'un compte de tokens : `1234` → `1.2k`. */
export function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    log.debug("safeJson failed", err);
    return String(value);
  }
}
