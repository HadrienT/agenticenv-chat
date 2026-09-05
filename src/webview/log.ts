/**
 * Journalisation côté webview. La webview est un bac à sable : pas d'accès à
 * l'`OutputChannel` de l'hôte, on se rabat sur la console du devtools. Existe
 * surtout pour que **tout `catch` porte un `log.*`** (04-CONVENTIONS §5), règle
 * vérifiée par test/discipline/no-empty-catch.test.ts.
 */
export const log = {
  debug(...parts: unknown[]): void {
    // eslint-disable-next-line no-console
    console.debug("[agx]", ...parts);
  },
  warn(...parts: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn("[agx]", ...parts);
  },
  error(...parts: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error("[agx]", ...parts);
  },
};
