import type { ContextChip } from "../../messages";
import type { AppState, ChatItem, PanelId } from "./types";
import { initialState } from "./types";

/**
 * Sérialisation légère vers `webview.setState` (03-PROTOCOL §4). Survit au reload
 * de la webview ; `retainContextWhenHidden` ne suffit pas (primer §5).
 *
 * `version` est incrémentée à **chaque** changement de forme. Une version
 * inconnue ⇒ l'état est **jeté** (jamais migré à la devinette) + notice (I7).
 */
export const PERSIST_VERSION = 10;

const MAX_PERSISTED_ITEMS = 200;

const CHAT_ITEM_KINDS = new Set([
  "user",
  "assistant",
  "tool",
  "observation",
  "error",
  "turn-cancelled",
  "permission",
  "hook",
  "compaction",
  "max-iterations",
  "queued-note",
  "model-switch",
]);

export interface PersistedState {
  version: number;
  conversationId: string | null;
  items: ChatItem[];
  composerDraft: string;
  attachments: ContextChip[];
  history: string[];
  branches: { at: number; removed: ChatItem[] }[];
  panels: Record<PanelId, boolean>;
  /** Plan/todo produit par l'agent — archivé avec la conversation (C09 §2). */
  todo: AppState["todo"];
  sessionMode: AppState["sessionMode"];
}

export function toPersisted(state: AppState): PersistedState {
  const p = state.phase;
  return {
    version: PERSIST_VERSION,
    conversationId: "conversationId" in p ? p.conversationId : null,
    items: state.items.slice(-MAX_PERSISTED_ITEMS),
    composerDraft: state.composer.draft,
    attachments: state.composer.attachments,
    history: state.composer.history,
    branches: state.branches.map((b) => ({ at: b.at, removed: b.removed.slice(-MAX_PERSISTED_ITEMS) })),
    panels: state.panels,
    todo: state.todo,
    sessionMode: state.sessionMode,
  };
}

export type HydrateResult =
  | { ok: true; state: AppState }
  | { ok: false; reason: "empty" | "unknown-version" };

export function fromPersisted(raw: unknown): HydrateResult {
  if (raw == null) {
    return { ok: false, reason: "empty" };
  }
  if (!isRecord(raw) || typeof raw.version !== "number" || raw.version !== PERSIST_VERSION) {
    return { ok: false, reason: "unknown-version" };
  }

  const base = initialState();
  const rawItems = Array.isArray(raw.items) ? raw.items.filter(isChatItem) : [];
  // Après un reload, aucun tour n'est actif tant que `resume` n'a pas confirmé
  // (C01 §6) : figer tout item assistant laissé en streaming.
  const items = rawItems.map((it) =>
    it.kind === "assistant" && it.streaming ? { ...it, streaming: false } : it,
  );
  const itemIndex: Record<string, number> = {};
  items.forEach((it, i) => {
    itemIndex[it.id] = i;
  });

  const phase: AppState["phase"] =
    typeof raw.conversationId === "string" && raw.conversationId
      ? { kind: "idle", conversationId: raw.conversationId }
      : base.phase;

  return {
    ok: true,
    state: {
      ...base,
      phase,
      items,
      itemIndex,
      eventSeq: items.length,
      // `usage` n'est pas persisté (recalculé au tour suivant) ; on garde au moins
      // la trace « historique compacté » si un marqueur survit dans le fil.
      compacted: items.some((it) => it.kind === "compaction"),
      composer: {
        draft: typeof raw.composerDraft === "string" ? raw.composerDraft : "",
        attachments: Array.isArray(raw.attachments)
          ? (raw.attachments.filter(isChip) as ContextChip[])
          : [],
        history: Array.isArray(raw.history)
          ? raw.history.filter((h): h is string => typeof h === "string")
          : [],
      },
      branches: Array.isArray(raw.branches)
        ? (raw.branches as { at: number; removed: ChatItem[] }[]).filter(
            (b) => isRecord(b) && Array.isArray(b.removed),
          )
        : [],
      panels: isRecord(raw.panels)
        ? {
            health: raw.panels.health === true,
            workingSet: raw.panels.workingSet !== false,
            todo: raw.panels.todo !== false,
          }
        : base.panels,
      todo: Array.isArray(raw.todo) ? (raw.todo.filter(isTodoItem) as AppState["todo"]) : null,
      sessionMode:
        raw.sessionMode === "ask" || raw.sessionMode === "plan" ? raw.sessionMode : "agent",
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isChip(v: unknown): boolean {
  return isRecord(v) && isRecord(v.ref) && typeof v.label === "string";
}

function isTodoItem(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    (v.state === "pending" || v.state === "active" || v.state === "done" || v.state === "skipped")
  );
}

function isChatItem(v: unknown): v is ChatItem {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.kind === "string" &&
    CHAT_ITEM_KINDS.has(v.kind)
  );
}
