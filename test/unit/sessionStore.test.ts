import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConversationStore, STORE_VERSION, titleFrom, type StoredConversation } from "../../src/sessions/store";
import { toJson, toMarkdown } from "../../src/sessions/export";

let dir = "";
let store: ConversationStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agx-sessions-"));
  store = new ConversationStore(dir);
});
afterEach(async () => {
  await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));
});

function conv(over: Partial<StoredConversation> = {}): StoredConversation {
  return {
    version: STORE_VERSION,
    id: "c1",
    title: "hello world",
    createdAt: 1000,
    updatedAt: 2000,
    workspacePath: "/home/me/proj",
    model: "local",
    items: [{ kind: "user", id: "u", text: "hello world how are you today friend" }],
    branches: [],
    usage: { cost: 0.1, promptTokens: 10, completionTokens: 5 },
    mcpServers: [],
    ...over,
  };
}

describe("ConversationStore (C08 §2)", () => {
  it("round-trip conversation ⇒ disque ⇒ relecture identique", async () => {
    await store.save(conv());
    expect(await store.load("c1")).toEqual(conv());
  });

  it("écriture atomique : pas de .tmp résiduel, index présent", async () => {
    await store.save(conv());
    const names = await readdir(join(dir, "conversations"));
    expect(names).toContain("c1.json");
    expect(names).toContain("index.json");
    expect(names.some((n) => n.endsWith(".tmp"))).toBe(false);
  });

  it("index reconstructible depuis les fichiers", async () => {
    await store.save(conv());
    await writeFile(join(dir, "conversations", "index.json"), "corrupt{", "utf8");
    await store.writeIndex();
    const idx = JSON.parse(await readFile(join(dir, "conversations", "index.json"), "utf8"));
    expect(idx[0].id).toBe("c1");
  });

  it("liste isolée par dossier ; recherche plein texte sur les messages", async () => {
    await store.save(conv({ id: "c1", workspacePath: "/a" }));
    await store.save(conv({ id: "c2", workspacePath: "/b", title: "other" }));
    expect((await store.list("/a")).map((e) => e.id)).toEqual(["c1"]);
    expect((await store.search("/a", "how are you")).map((e) => e.id)).toEqual(["c1"]);
    expect(await store.search("/a", "nothing")).toEqual([]);
  });

  it("version inconnue : listée (version marquée), non ouverte", async () => {
    await store.save(conv({ version: 999 }));
    const entry = (await store.list("/home/me/proj"))[0];
    expect(entry.version).toBe(999);
  });

  it("purge à > 100 conversations (les plus récentes gardées), ids annoncés", async () => {
    const now = Date.now();
    for (let i = 0; i < 105; i++) {
      await store.save(conv({ id: `c${i}`, updatedAt: now - i * 1000 }));
    }
    const { purged } = await store.purge();
    expect(purged.length).toBe(5);
    expect((await store.list("/home/me/proj")).length).toBe(100);
  });

  it("purge par ancienneté (> 90 jours)", async () => {
    const now = Date.now();
    await store.save(conv({ id: "old", updatedAt: now - 100 * 86_400_000 }));
    await store.save(conv({ id: "fresh", updatedAt: now }));
    const { purged } = await store.purge();
    expect(purged).toEqual(["old"]);
  });
});

describe("titleFrom (C08 §3, aucun appel LLM)", () => {
  it("6–8 premiers mots du premier message utilisateur", () => {
    expect(titleFrom([{ kind: "user", text: "why does the black scholes test fail on Windows only" }])).toBe(
      "why does the black scholes test fail on",
    );
    expect(titleFrom([{ kind: "assistant", text: "hi" }])).toBeNull();
  });
});

describe("export (C08 §6)", () => {
  it("markdown : chemins relatifs au dépôt, réimportable via JSON", () => {
    const c = conv({
      items: [
        { kind: "user", id: "u", text: "look at /workspace/project/src/black.cpp" },
        { kind: "assistant", id: "a", text: "done", streaming: false, revision: 0 },
      ],
    });
    const md = toMarkdown(c, "/workspace/project");
    expect(md).toContain("src/black.cpp");
    expect(md).not.toContain("/workspace/project");
    expect(JSON.parse(toJson(c)).id).toBe("c1");
  });
});
