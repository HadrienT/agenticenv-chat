import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../logging";

/**
 * Persistance des conversations (C08 §2). Écriture **atomique** (fichier
 * temporaire + `rename`) : un crash en plein tour ne corrompt pas l'index.
 * L'index est **reconstructible** depuis les fichiers. Conversations **par
 * dossier** (`workspacePath`). Utilise `node:fs` (hôte) pour un `rename` atomique.
 */

export const STORE_VERSION = 1;

export interface StoredItem {
  [k: string]: unknown;
}

export interface StoredConversation {
  version: number;
  id: string;
  title: string | null;
  titleManual?: boolean;
  createdAt: number;
  updatedAt: number;
  workspacePath: string | null;
  model: string | null;
  items: StoredItem[];
  branches: { at: number; removed: StoredItem[] }[];
  usage: { cost: number; promptTokens: number; completionTokens: number };
  mcpServers: string[];
}

export interface IndexEntry {
  id: string;
  title: string | null;
  updatedAt: number;
  turns: number;
  cost: number;
  model: string | null;
  workspacePath: string | null;
  version: number;
}

const RETENTION_COUNT = 100;
const RETENTION_DAYS = 90;

export class ConversationStore {
  private dir: string;

  constructor(storageFsPath: string) {
    this.dir = join(storageFsPath, "conversations");
  }

  private file(id: string): string {
    return join(this.dir, `${id.replace(/[^\w-]/g, "_")}.json`);
  }

  async save(conv: StoredConversation): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = this.file(conv.id);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(conv, null, 2), "utf8");
    await rename(tmp, path);
    await this.writeIndex();
  }

  async load(id: string): Promise<StoredConversation | null> {
    try {
      return JSON.parse(await readFile(this.file(id), "utf8")) as StoredConversation;
    } catch (err) {
      log.debug("conversation load failed:", err);
      return null;
    }
  }

  /** Liste (par dossier), triée du plus récent au plus ancien. */
  async list(workspacePath: string | null): Promise<IndexEntry[]> {
    const all = await this.readAllHeaders();
    return all
      .filter((e) => e.workspacePath === workspacePath)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Recherche plein texte sur titres **et** messages (item 85). */
  async search(workspacePath: string | null, query: string): Promise<IndexEntry[]> {
    const q = query.toLowerCase().trim();
    if (!q) {
      return this.list(workspacePath);
    }
    const hits: IndexEntry[] = [];
    for (const entry of await this.list(workspacePath)) {
      if (entry.title?.toLowerCase().includes(q)) {
        hits.push(entry);
        continue;
      }
      const conv = await this.load(entry.id);
      const text = JSON.stringify(conv?.items ?? []).toLowerCase();
      if (text.includes(q)) {
        hits.push(entry);
      }
    }
    return hits;
  }

  /** `{ purged }` : les ids supprimés par la rétention (à annoncer, jamais en silence). */
  async purge(): Promise<{ purged: string[] }> {
    const headers = (await this.readAllHeaders()).sort((a, b) => b.updatedAt - a.updatedAt);
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    const purged: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const stale = headers[i].updatedAt < cutoff;
      const overflow = i >= RETENTION_COUNT;
      if (stale || overflow) {
        await rm(this.file(headers[i].id)).catch((err) => log.debug("purge rm failed:", err));
        purged.push(headers[i].id);
      }
    }
    if (purged.length) {
      await this.writeIndex();
    }
    return { purged };
  }

  private async readAllHeaders(): Promise<IndexEntry[]> {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith(".json") && n !== "index.json");
    } catch (err) {
      log.trace("conversations dir not present yet:", err);
      return [];
    }
    const out: IndexEntry[] = [];
    for (const name of names) {
      try {
        const conv = JSON.parse(await readFile(join(this.dir, name), "utf8")) as StoredConversation;
        out.push(toEntry(conv));
      } catch (err) {
        log.debug("skipping unreadable conversation file:", name, err);
      }
    }
    return out;
  }

  /** Réécrit `index.json` depuis les fichiers (source de vérité = les fichiers). */
  async writeIndex(): Promise<void> {
    try {
      const entries = await this.readAllHeaders();
      const tmp = join(this.dir, `index.json.${process.pid}.tmp`);
      await writeFile(tmp, JSON.stringify(entries, null, 2), "utf8");
      await rename(tmp, join(this.dir, "index.json"));
    } catch (err) {
      log.debug("writeIndex failed (non-fatal, index is rebuildable):", err);
    }
  }
}

function toEntry(conv: StoredConversation): IndexEntry {
  return {
    id: conv.id,
    title: conv.title,
    updatedAt: conv.updatedAt,
    turns: (conv.items ?? []).filter((i) => (i as { kind?: string }).kind === "user").length,
    cost: conv.usage?.cost ?? 0,
    model: conv.model,
    workspacePath: conv.workspacePath,
    version: conv.version,
  };
}

/** Titre = 6–8 premiers mots du premier message utilisateur. **Aucun appel LLM** (C08 §3). */
export function titleFrom(items: StoredItem[]): string | null {
  const firstUser = items.find((i) => (i as { kind?: string }).kind === "user") as
    | { text?: string }
    | undefined;
  const text = (firstUser?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  const words = text.split(" ").slice(0, 8).join(" ");
  return words.length > 60 ? words.slice(0, 57) + "…" : words;
}
