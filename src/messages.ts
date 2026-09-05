// Contrat **interne** hôte ↔ webview (camelCase, postMessage). Séparé du fil
// bridge (src/protocol.ts) — il est libre d'évoluer sans changement côté
// AgenticEnv (03-PROTOCOL §3).
//
// Les deux routeurs (hôte et webview) traitent ces unions de façon exhaustive
// avec `assertNever` — un `type` ajouté sans être traité ne compile pas. Un test
// de discipline le vérifie (05-TESTING §5).

import type { Outbound } from "./protocol";

// --- santé des composants (sondée par l'hôte, pas par le bridge) ---

export type HealthStatus = "up" | "down" | "degraded" | "unknown";

export type ComponentId =
  | "bridge"
  | "llama-server"
  | "llama-bridge"
  | "docker"
  | "agent-server-image"
  | "gpu";

export type HealthActionId = "start" | "stop" | "restart" | "pull";

export interface ComponentHealth {
  id: ComponentId;
  label: string;
  status: HealthStatus;
  detail: string;
  /** action ids the client may trigger for this component */
  actions: HealthActionId[];
}

// --- vues légères poussées vers la webview ---

export interface McpServerView {
  name: string;
  transport: string;
  tools: string[];
}

// --- hôte → webview ---

export type HostToWebview =
  | { type: "connection"; state: "connecting" | "open" | "closed"; protocol?: number | null; detail?: string }
  | { type: "protocol"; version: number; capabilities: string[]; degraded: boolean }
  | { type: "bridge"; message: Outbound }
  | { type: "mcpServers"; servers: McpServerView[] }
  | { type: "health"; components: ComponentHealth[] }
  | { type: "hostError"; text: string }
  | { type: "workspace"; folder: string | null; path: string | null }
  | { type: "reset" };

export const HOST_TO_WEBVIEW_TYPES = [
  "connection",
  "protocol",
  "bridge",
  "mcpServers",
  "health",
  "hostError",
  "workspace",
  "reset",
] as const;

// --- webview → hôte ---

export type WebviewToHost =
  | { type: "ready"; stateVersion: number }
  | { type: "startSession"; mcpServers: string[] }
  | { type: "userMessage"; text: string }
  | { type: "cancelTurn" }
  | { type: "forceNewSession" }
  | { type: "confirm"; accept: boolean }
  | { type: "openDiff"; path: string }
  | { type: "refreshHealth" }
  | { type: "healthAction"; component: ComponentId; action: HealthActionId };

export const WEBVIEW_TO_HOST_TYPES = [
  "ready",
  "startSession",
  "userMessage",
  "cancelTurn",
  "forceNewSession",
  "confirm",
  "openDiff",
  "refreshHealth",
  "healthAction",
] as const;

/**
 * Garde de forme à l'entrée d'un routeur : vérifie qu'un message reçu a bien un
 * discriminant connu (03-PROTOCOL §3.3 : « validés à l'entrée, forme pas
 * identité »). Une webview compromise ne doit pas faire crasher l'hôte.
 */
export function isWebviewToHost(value: unknown): value is WebviewToHost {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (WEBVIEW_TO_HOST_TYPES as readonly string[]).includes((value as { type: string }).type)
  );
}

export function isHostToWebview(value: unknown): value is HostToWebview {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (HOST_TO_WEBVIEW_TYPES as readonly string[]).includes((value as { type: string }).type)
  );
}
