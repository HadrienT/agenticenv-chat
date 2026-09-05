import { afterEach, describe, expect, it } from "vitest";
import { BridgeClient } from "../../src/bridgeClient";
import { startFakeBridge, type FakeBridge } from "../fake-bridge/server";
import type { Outbound } from "../../src/protocol";

let fake: FakeBridge | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

function waitFor(pred: () => boolean, ms = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (pred()) return resolve();
      if (Date.now() - started > ms) return reject(new Error("timeout"));
      setTimeout(tick, 15);
    };
    tick();
  });
}

describe("BridgeClient ↔ faux bridge", () => {
  it("délivre une frame JSON valide et ignore une frame malformée sans crash", async () => {
    fake = await startFakeBridge({
      greeting: [
        { type: "mcp_servers", servers: [] } satisfies Outbound,
      ],
      emitMalformed: true,
    });

    const messages: Outbound[] = [];
    const states: string[] = [];
    const client = new BridgeClient(fake.url, {
      onState: (s) => states.push(s),
      onMessage: (m) => messages.push(m),
    });
    client.start();

    await waitFor(() => messages.length >= 1);
    expect(messages[0]).toEqual({ type: "mcp_servers", servers: [] });
    expect(states).toContain("open");
    // la frame malformée n'a pas produit de message ni fait tomber le client
    expect(messages).toHaveLength(1);

    client.stop();
  });

  it("file d'envoi : `send` échoue tant que le socket est fermé, réussit ensuite", async () => {
    fake = await startFakeBridge({
      onMessage: () => [{ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }],
    });
    const client = new BridgeClient(fake.url, { onState: () => undefined, onMessage: () => undefined });

    expect(client.send({ type: "list_mcp_servers" })).toBe(false); // socket pas encore ouvert
    client.start();
    await waitFor(() => client.send({ type: "list_mcp_servers" }) === true);

    client.stop();
  });

  it("reconnexion : après une coupure serveur, le client se rebranche", async () => {
    fake = await startFakeBridge({ closeAfterMs: 60 });
    const states: string[] = [];
    const client = new BridgeClient(fake.url, {
      onState: (s) => states.push(s),
      onMessage: () => undefined,
    });
    client.start();

    await waitFor(() => states.filter((s) => s === "open").length >= 1, 5000);
    await waitFor(() => states.includes("closed"), 5000);
    // le client replanifie une connexion tout seul (backoff ~1 s)
    await waitFor(() => states.filter((s) => s === "connecting").length >= 2, 5000);

    client.stop();
  });
});
