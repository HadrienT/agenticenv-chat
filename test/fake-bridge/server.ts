import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * Faux bridge : un serveur WebSocket qui rejoue un scénario (05-TESTING §3).
 *
 * En C00 il sert l'intégration `BridgeClient` (frame nominale, frame malformée,
 * coupure + reconnexion). Les scénarios de tour (20 min, `turn_finished` jamais
 * envoyé, deltas après l'`event` final, bridge v1) arrivent avec C01, qui ajoute
 * les messages correspondants au protocole.
 */
export interface FakeBridgeOptions {
  /** Frames poussées dès qu'un client se connecte, dans l'ordre. */
  greeting?: unknown[];
  /** Répond à chaque message client par 0..n frames. */
  onMessage?: (msg: unknown) => unknown[];
  /** Envoie une frame non-JSON juste après le greeting. */
  emitMalformed?: boolean;
  /** Ferme brutalement la connexion après `closeAfterMs`. */
  closeAfterMs?: number;
}

export interface FakeBridge {
  url: string;
  connections: number;
  received: unknown[];
  /** Pousse une frame à tous les clients connectés. */
  broadcast(frame: unknown): void;
  close(): Promise<void>;
}

export async function startFakeBridge(options: FakeBridgeOptions = {}): Promise<FakeBridge> {
  const http: Server = createServer();
  const wss = new WebSocketServer({ server: http });
  const clients = new Set<WebSocket>();
  const state = { connections: 0, received: [] as unknown[] };

  wss.on("connection", (ws) => {
    state.connections++;
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        parsed = { raw: data.toString() };
      }
      state.received.push(parsed);
      for (const frame of options.onMessage?.(parsed) ?? []) {
        ws.send(JSON.stringify(frame));
      }
    });

    for (const frame of options.greeting ?? []) {
      ws.send(JSON.stringify(frame));
    }
    if (options.emitMalformed) {
      ws.send("this is not json {");
    }
    if (options.closeAfterMs !== undefined) {
      setTimeout(() => ws.terminate(), options.closeAfterMs);
    }
  });

  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `ws://127.0.0.1:${port}`,
    get connections() {
      return state.connections;
    },
    get received() {
      return state.received;
    },
    broadcast(frame) {
      for (const ws of clients) {
        ws.send(JSON.stringify(frame));
      }
    },
    close() {
      for (const ws of clients) {
        ws.terminate();
      }
      return new Promise<void>((resolve) => wss.close(() => http.close(() => resolve())));
    },
  };
}
