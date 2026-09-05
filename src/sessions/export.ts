import type { StoredConversation, StoredItem } from "./store";

/**
 * Export d'une conversation (C08 §6). Pur. Les chemins conteneur sont réduits à
 * des chemins relatifs au dépôt — un export contenant des chemins conteneur absolus
 * n'est lisible par personne.
 */

export function toJson(conv: StoredConversation): string {
  return JSON.stringify(conv, null, 2);
}

export function toMarkdown(conv: StoredConversation, sandboxRoot: string): string {
  const rel = (s: string): string =>
    s.split(sandboxRoot + "/").join("").split(sandboxRoot).join(".");
  const lines: string[] = [];
  lines.push(`# ${conv.title ?? "Conversation"}`);
  lines.push("");
  lines.push(
    `_${new Date(conv.updatedAt).toISOString()} · ${conv.model ?? "local"} · $${conv.usage.cost.toFixed(4)}_`,
  );
  lines.push("");

  for (const raw of conv.items) {
    const item = raw as StoredItem & { kind?: string; text?: string };
    switch (item.kind) {
      case "user":
        lines.push(`## You`, "", rel(String(item.text ?? "")), "");
        break;
      case "assistant":
        lines.push(`## Agent`, "", rel(String(item.text ?? "")), "");
        break;
      case "tool": {
        const t = raw as { toolName?: string; args?: unknown; observation?: unknown };
        lines.push(
          `<details><summary>🔧 ${t.toolName ?? "tool"}</summary>`,
          "",
          "```json",
          rel(JSON.stringify({ args: t.args, result: t.observation }, null, 2)),
          "```",
          "",
          "</details>",
          "",
        );
        break;
      }
      case "error":
        lines.push(`> ⚠ ${rel(String(item.text ?? ""))}`, "");
        break;
      case "permission": {
        const p = raw as { verdict?: string; rule?: string; summary?: string };
        lines.push(`> _${p.verdict} — ${p.summary} (rule ${p.rule})_`, "");
        break;
      }
      default:
        break;
    }
  }
  return lines.join("\n");
}
