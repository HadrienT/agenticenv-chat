import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BridgeClient } from "../../src/bridgeClient";
import { bridgeTokenPath, readBridgeToken } from "../../src/bridgeToken";

let server: Server | undefined;
afterEach(() => server?.close());

describe("jeton du bridge (WP10)", () => {
  it("chemin aligné sur openhands_bridge/auth.py", () => {
    expect(bridgeTokenPath({ XDG_STATE_HOME: "/s" })).toBe("/s/agenticenv/bridge.token");
    expect(bridgeTokenPath({})).toMatch(/\.local\/state\/agenticenv\/bridge\.token$/);
  });

  it("lit le jeton, `null` si absent", () => {
    const file = join(mkdtempSync(join(tmpdir(), "agx-")), "t");
    expect(readBridgeToken(file)).toBeNull();
    writeFileSync(file, "abc\n");
    expect(readBridgeToken(file)).toBe("abc");
  });

  it("envoie le jeton et explique un refus au lieu d'une fermeture muette", async () => {
    const seen: (string | undefined)[] = [];
    server = createServer((_req, res) => {
      res.statusCode = 401;
      res.end();
    });
    server.on("upgrade", (req, socket) => {
      seen.push(req.headers.authorization);
      socket.end("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const details: (string | undefined)[] = [];
    const client = new BridgeClient(
      `ws://127.0.0.1:${port}`,
      { onState: (_s, d) => details.push(d), onMessage: () => undefined },
      () => "tok",
    );
    client.start();
    await expect.poll(() => details.some((d) => d?.includes("bridge token"))).toBe(true);
    client.stop();

    expect(seen[0]).toBe("Bearer tok");
  });
});
