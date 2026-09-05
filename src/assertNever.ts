/**
 * Épuise une union discriminée dans un `switch`. Si un membre est ajouté à
 * l'union sans être traité, l'appel ne compile plus (04-CONVENTIONS §1).
 */
export function assertNever(value: never, context = "value"): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
