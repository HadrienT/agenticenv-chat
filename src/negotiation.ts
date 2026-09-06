import type { Outbound } from "./protocol";

/**
 * Un bridge v1 ne connaît pas les messages de négociation v2 (`hello`, `resume`,
 * `list_models`, …) et les rejette par une erreur de validation. Reçu **avant**
 * le `welcome`, c'est le signal « pas de v2 » — le client bascule en dégradé en
 * silence (03-PROTOCOL §2.1), il n'en fait pas une notice d'erreur visible.
 *
 * Fonction pure, testée.
 */
export function isV1HandshakeRejection(message: Extract<Outbound, { type: "error" }>): boolean {
  const code = (message.code ?? "").toUpperCase();
  if (
    code.includes("VALIDATION") ||
    code.includes("UNKNOWN_MESSAGE") ||
    code.includes("UNKNOWN_TYPE") ||
    code.includes("BAD_REQUEST")
  ) {
    return true;
  }
  const text = `${message.message ?? ""}`.toLowerCase();
  return (
    text.includes("validation error") ||
    text.includes("does not match any of the expected tags") ||
    text.includes("invalid message from client")
  );
}
