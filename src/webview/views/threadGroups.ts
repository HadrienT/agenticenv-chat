import { toolFamily } from "../tools/registry";
import type { ChatItem } from "../store/types";

/**
 * Regroupement d'outils consécutifs (C05 §5). Une série de **3 outils ou plus**
 * de la même famille, sans message assistant entre eux, devient un groupe
 * repliable. Un groupe contenant une erreur reste déplié.
 */
export type ThreadRow =
  | { kind: "single"; item: ChatItem }
  | { kind: "group"; family: string; items: Extract<ChatItem, { kind: "tool" }>[]; hasError: boolean };

const MIN_GROUP = 3;

export function groupRows(items: ChatItem[]): ThreadRow[] {
  const rows: ThreadRow[] = [];
  let run: Extract<ChatItem, { kind: "tool" }>[] = [];
  let runFamily: string | null = null;

  const flush = (): void => {
    if (run.length >= MIN_GROUP && runFamily) {
      rows.push({
        kind: "group",
        family: runFamily,
        items: run,
        hasError: run.some((t) => t.status === "error"),
      });
    } else {
      for (const it of run) {
        rows.push({ kind: "single", item: it });
      }
    }
    run = [];
    runFamily = null;
  };

  for (const item of items) {
    if (item.kind === "tool") {
      const fam = toolFamily(item.toolName);
      if (runFamily === null || fam === runFamily) {
        run.push(item);
        runFamily = fam;
      } else {
        flush();
        run = [item];
        runFamily = fam;
      }
      continue;
    }
    flush();
    rows.push({ kind: "single", item });
  }
  flush();
  return rows;
}

const GROUP_LABEL: Record<string, string> = {
  edit: "Edited files",
  terminal: "Ran commands",
  search: "Searched the codebase",
  other: "Ran tools",
};

export function groupLabel(family: string, count: number): string {
  return `${GROUP_LABEL[family] ?? "Ran tools"} · ${count} tools`;
}
