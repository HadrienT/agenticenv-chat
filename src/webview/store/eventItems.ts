import type { SdkEvent } from "../../protocol";
import type { ChatItem } from "./types";

/**
 * Traduction pure `SdkEvent` → `ChatItem[]`. Le bridge transmet
 * `Event.model_dump(mode="json")` verbatim ; on ne lit que quelques champs.
 *
 * `seq` est un compteur monotone tenu par le réducteur : il donne un `id` stable
 * (donc une `key` React stable, 04-CONVENTIONS §2) sans dépendre de l'horloge.
 */
export function eventToItems(ev: SdkEvent, seq: number): ChatItem[] {
  const id = `ev-${seq}`;
  const kind = ev.kind ?? "";

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
      return [{ kind: "assistant", id, text, streaming: false, revision: 0 }];
    }
    return [{ kind: "user", id, text }];
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
        args: ev.action,
        status: "running",
      },
    ];
  }

  if (kind === "ObservationEvent") {
    return [{ kind: "observation", id, toolName: ev.tool_name ?? "tool", result: ev.observation }];
  }

  if (kind === "AgentErrorEvent" || typeof ev.error === "string") {
    return [{ kind: "error", id, text: String(ev.error ?? "agent error") }];
  }

  return [];
}
