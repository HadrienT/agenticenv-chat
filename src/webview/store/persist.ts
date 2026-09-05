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
export const PERSIST_VERSION = 3;

const MAX_PERSISTED_ITEMS = 200;

const CHAT_ITEM_KINDS = new Set([
  "user",
  "assistant",
  "tool",
  "observation",
  "error",
  "turn-cancelled",
]);

export interface PersistedState {
  version: number;
  conversationId: string | null;
  items: ChatItem[];
  composerDraft: string;
  attachments: ContextChip[];
  panels: Record<PanelId, boolean>;
}

export function toPersisted(state: AppState): PersistedState {
  const p = state.phase;
  return {
    version: PERSIST_VERSION,
    conversationId: "conversationId" in p ? p.conversationId : null,
    items: state.items.slice(-MAX_PERSISTED_ITEMS),
    composerDraft: state.composer.draft,
    attachments: state.composer.attachments,
    panels: state.panels,
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
      composer: {
        draft: typeof raw.composerDraft === "string" ? raw.composerDraft : "",
        attachments: Array.isArray(raw.attachments)
          ? (raw.attachments.filter(isChip) as ContextChip[])
          : [],
      },
      panels: isRecord(raw.panels)
        ? { health: raw.panels.health === true, workingSet: raw.panels.workingSet !== false }
        : base.panels,
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isChip(v: unknown): boolean {
  return isRecord(v) && isRecord(v.ref) && typeof v.label === "string";
}

function isChatItem(v: unknown): v is ChatItem {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.kind === "string" &&
    CHAT_ITEM_KINDS.has(v.kind)
  );
}
