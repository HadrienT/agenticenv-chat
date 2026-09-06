import WebSocket from "ws";
import { log } from "./logging";
import type { Inbound, Outbound } from "./protocol";

export type BridgeState = "connecting" | "open" | "closed";

export interface BridgeHandlers {
  onState(state: BridgeState, detail?: string): void;
  onMessage(message: Outbound): void;
}

/**
 * Thin WebSocket client to the openhands-bridge server. Runs in the extension
 * host (Node). Auto-reconnects with a capped backoff while `enabled`.
 *
 * `send()` is strict — it returns `false` if the socket is not open (the caller
 * must surface a "not sent" notice for user-driven messages). `enqueue()` is
 * lenient — the message is buffered and flushed, in order, on the next open
 * (C01 §7 : `hello`, `resume`, `list_*` sont rejouables).
 */
export class BridgeClient {
  private ws: WebSocket | undefined;
  private enabled = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 15000;
  private pending: Inbound[] = [];
  private lastState: BridgeState = "closed";

  constructor(
    private url: string,
    private readonly handlers: BridgeHandlers,
  ) {}

  /** État courant de la connexion — source de vérité pour la ligne « bridge » du panneau Components. */
  get state(): BridgeState {
    return this.lastState;
  }

  setUrl(url: string): void {
    if (url === this.url) {
      return;
    }
    this.url = url;
    if (this.enabled) {
      this.reconnect();
    }
  }

  start(): void {
    this.enabled = true;
    this.connect();
  }

  stop(): void {
    this.enabled = false;
    this.clearReconnect();
    this.pending = [];
    this.ws?.close();
    this.ws = undefined;
  }

  reconnect(): void {
    this.clearReconnect();
    this.ws?.close();
    this.ws = undefined;
    this.backoffMs = 1000;
    this.connect();
  }

  private isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(message: Inbound): boolean {
    if (this.isOpen()) {
      this.ws?.send(JSON.stringify(message));
      log.trace("bridge <-", message.type);
      return true;
    }
    log.debug("bridge send dropped, socket not open:", message.type);
    return false;
  }

  /** Bufferisé si le socket est fermé ; rejoué à l'ouverture, dans l'ordre. */
  enqueue(message: Inbound): void {
    if (this.isOpen()) {
      this.send(message);
      return;
    }
    this.pending.push(message);
    log.debug("bridge enqueue (socket not open):", message.type);
  }

  private flushPending(): void {
    const queued = this.pending;
    this.pending = [];
    for (const m of queued) {
      this.send(m);
    }
  }

  private emitState(state: BridgeState, detail?: string): void {
    this.lastState = state;
    this.handlers.onState(state, detail);
  }

  private connect(): void {
    if (!this.enabled) {
      return;
    }
    this.emitState("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      log.warn("bridge connect failed:", err);
      this.emitState("closed", String(err));
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      this.backoffMs = 1000;
      this.emitState("open");
      // L'hôte envoie son préambule (hello/resume) pendant `onState("open")` ;
      // on vide la file juste après, donc après le hello.
      this.flushPending();
    });

    ws.on("message", (data) => {
      const raw = data.toString();
      let parsed: Outbound;
      try {
        parsed = JSON.parse(raw) as Outbound;
      } catch (err) {
        log.debug("bridge -> malformed frame ignored:", err, raw.slice(0, 200));
        return;
      }
      log.trace("bridge ->", (parsed as { type?: string }).type ?? "?");
      this.handlers.onMessage(parsed);
    });

    ws.on("error", (err) => {
      this.emitState("closed", err.message);
    });

    ws.on("close", () => {
      this.ws = undefined;
      this.emitState("closed");
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
