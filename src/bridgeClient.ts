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
 */
export class BridgeClient {
  private ws: WebSocket | undefined;
  private enabled = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 15000;

  constructor(
    private url: string,
    private readonly handlers: BridgeHandlers,
  ) {}

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

  send(message: Inbound): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      log.trace("bridge <-", message.type);
      return true;
    }
    log.debug("bridge send dropped, socket not open:", message.type);
    return false;
  }

  private connect(): void {
    if (!this.enabled) {
      return;
    }
    this.handlers.onState("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      log.warn("bridge connect failed:", err);
      this.handlers.onState("closed", String(err));
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      this.backoffMs = 1000;
      this.handlers.onState("open");
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
      this.handlers.onState("closed", err.message);
    });

    ws.on("close", () => {
      this.ws = undefined;
      this.handlers.onState("closed");
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
