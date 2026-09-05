import type { SdkEvent } from "../../protocol";
import type { ChatItem } from "./types";

/**
 * Traduction pure `SdkEvent` → `ChatItem[]`. Le bridge transmet
 * `Event.model_dump(mode="json")` verbatim ; on ne lit que quelques champs.
 *
 * `seq` est un compteur monotone tenu par le réducteur : il donne un `id` stable
 * (donc une `key` React stable, 04-CONVENTIONS §2) sans dépendre de l'horloge.
 */
export function eventToItems(ev: SdkEvent, seq: number, at: number): ChatItem[] {
  const id = `ev-${seq}`;
  const kind = ev.kind ?? "";
  const ts = parseTimestamp(ev.timestamp) ?? at;

  if (kind === "MessageEvent") {
    const role = ev.llm_message?.role;
    const text = (ev.llm_message?.content ?? [])
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!text || (role !== "user" && role !== "assistant")) {
      return [];
    }
    if (role === "assistant") {
      return [
        { kind: "assistant", id, text, streaming: false, revision: 0, ts, sourceId: ev.id },
      ];
    }
    return [{ kind: "user", id, text, ts }];
  }

  if (kind === "ActionEvent") {
    const thought = Array.isArray(ev.thought)
      ? ev.thought.map((t) => t.text ?? "").join("")
      : typeof ev.thought === "string"
        ? ev.thought
        : "";
    return [
      {
        kind: "tool",
        id,
        toolName: ev.tool_name ?? "tool",
        thought: thought.trim(),
        args: isRecord(ev.action) ? ev.action : undefined,
        status: "running",
        toolCallId: ev.tool_call_id,
        ts,
      },
    ];
  }

  if (kind === "ObservationEvent") {
    // L'appariement action↔observation se fait dans le réducteur (C05 §3) ; ici
    // on ne produit qu'un item d'observation « orpheline » de secours.
    return [{ kind: "observation", id, toolName: ev.tool_name ?? "tool", result: ev.observation, ts }];
  }

  if (kind === "AgentErrorEvent" || typeof ev.error === "string") {
    return [{ kind: "error", id, text: String(ev.error ?? "agent error"), ts }];
  }

  return [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `true` si une observation SDK signale une erreur (exit code, flag, texte). */
export function observationHasError(obs: unknown): boolean {
  if (!isRecord(obs)) {
    return false;
  }
  if (obs.error === true || typeof obs.error === "string") {
    return true;
  }
  const exit = obs.exit_code ?? obs.exitCode ?? obs.returncode;
  if (typeof exit === "number" && exit !== 0) {
    return true;
  }
  return false;
}

function parseTimestamp(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const n = Date.parse(raw);
  return Number.isNaN(n) ? null : n;
}
