import { describe, expect, it } from "vitest";
import { isV1HandshakeRejection } from "../../src/negotiation";

const err = (code: string, message = "") =>
  ({ type: "error" as const, code, message, details: {} });

describe("négociation — détection d'un bridge v1", () => {
  it("reconnaît le rejet pydantic d'un message v2 (cas réel observé)", () => {
    expect(
      isV1HandshakeRejection(
        err(
          "VALIDATION_ERROR",
          "invalid message from client: 1 validation error for tagged-union[StartSession,UserMessage,ConfirmAction,ListMcpServers] Input tag 'list_models' found using 'type' does not match any of the expected tags",
        ),
      ),
    ).toBe(true);
  });

  it("reconnaît d'autres codes de rejet de handshake", () => {
    expect(isV1HandshakeRejection(err("BAD_REQUEST"))).toBe(true);
    expect(isV1HandshakeRejection(err("UNKNOWN_MESSAGE_TYPE"))).toBe(true);
  });

  it("ne confond pas une erreur applicative légitime avec un bridge v1", () => {
    expect(isV1HandshakeRejection(err("PROJECT_READONLY", "the project is read only"))).toBe(false);
    expect(isV1HandshakeRejection(err("MODEL_UNAVAILABLE", "CUDA out of memory"))).toBe(false);
    expect(isV1HandshakeRejection(err("UNKNOWN_CONVERSATION", "no such conversation"))).toBe(false);
  });
});
