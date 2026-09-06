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

/**
 * Rejoueur du protocole **v2 + WP08d** (spec `docs/bridge-v2-spec.md`,
 * `blueprint/wp/C15-sandbox-working-copy.md`). À passer comme `onMessage` d'un
 * `startFakeBridge`. Reproduit ce que le vrai bridge AgenticEnv émet :
 * négociation, frontières de tour, `checkpoint` avant chaque tour, diffs et
 * `apply`/`discard`/`restore` de la copie sandbox.
 */
export interface Wp08dOptions {
  /** Capabilities annoncées dans `welcome` (défaut : le set WP08d complet). */
  capabilities?: string[];
  /** Mode renvoyé dans `session_started` (défaut : reflète `start_session.mode`). */
  mode?: "agent" | "read_only";
  /** `changes_applied` renvoie ces `skipped` (défaut : aucun). */
  applySkips?: { path: string; reason: string }[];
  /** Fichiers changés renvoyés dans chaque `files_changed`. */
  changedFiles?: { status: "ADDED" | "DELETED" | "UPDATED" | "MOVED"; path: string }[];
}

export function wp08dResponder(opts: Wp08dOptions = {}): (msg: unknown) => unknown[] {
  const caps = opts.capabilities ?? ["turns", "cancel", "diffs", "checkpoints", "apply"];
  const changed = opts.changedFiles ?? [{ status: "UPDATED" as const, path: "src/black.cpp" }];
  const filesChanged = { type: "files_changed", changes: changed };
  let turn = 0;
  let seq = 0;

  const build = (raw: unknown): Record<string, unknown>[] => {
    const m = raw as { type?: string; mode?: string; paths?: string[] | null };
    switch (m.type) {
      case "hello":
        return [{ type: "welcome", protocol: 2, capabilities: caps }];
      case "list_mcp_servers":
        return [{ type: "mcp_servers", servers: [] }];
      case "start_session":
        return [
          {
            type: "session_started",
            conversation_id: "conv-1",
            llm_source: "create_payload",
            mode: opts.mode ?? (m.mode === "read_only" ? "read_only" : "agent"),
          },
        ];
      case "user_message": {
        const turnId = `t${++turn}`;
        return [
          { type: "checkpoint", checkpoint_id: `cp-${turn}`, turn_id: turnId, created_at: "2026-09-06T12:00:00Z", files: changed.map((c) => c.path) },
          { type: "turn_started", turn_id: turnId },
          { type: "event", event: { kind: "MessageEvent", id: `e${turn}`, llm_message: { role: "assistant", content: [{ text: "done" }] } } },
          filesChanged,
          { type: "context_stats", prompt_tokens: 1000, context_window: 32768, compacted: false },
          { type: "usage", accumulated_cost: 0.01, prompt_tokens: 1000, completion_tokens: 5, context_window: 32768 },
          { type: "turn_finished", turn_id: turnId, reason: "completed" },
        ];
      }
      case "cancel_turn":
        return [{ type: "turn_finished", turn_id: `t${turn}`, reason: "cancelled" }];
      case "request_diff":
        return [{ type: "file_diff", path: (m as { path?: string }).path ?? "?", unified: "--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y", truncated: false }];
      case "request_bundle_diff":
        return [{ type: "bundle_diff", unified: "diff --git a/src/black.cpp b/src/black.cpp\n@@ -1 +1 @@\n-x\n+y", truncated: false }];
      case "apply_changes":
        return [
          {
            type: "changes_applied",
            applied: (m.paths ?? changed.map((c) => c.path)).map((p) => ({ path: p, status: "UPDATED" })),
            skipped: opts.applySkips ?? [],
          },
          filesChanged,
        ];
      case "discard_changes":
        return [filesChanged];
      case "restore_checkpoint":
        return [
          { type: "checkpoint_restored", checkpoint_id: (m as { checkpoint_id?: string }).checkpoint_id ?? `cp-${turn}` },
          { type: "files_changed", changes: [] },
        ];
      default:
        return [];
    }
  };

  return (raw) => build(raw).map((frame) => ({ ...frame, seq: ++seq }));
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
