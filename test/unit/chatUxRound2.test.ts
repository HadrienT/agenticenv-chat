import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { foreignGpuUse } from "../../src/health";
import { eventToItems } from "../../src/webview/store/eventItems";
import { initialState } from "../../src/webview/store/initialState";
import { endTurnOnError, applyBridge as reduceBridge } from "../../src/webview/store/reduceBridge";
import type { Outbound, SdkEvent } from "../../src/protocol";
import type { AppState } from "../../src/webview/store/types";

const USER_EVENT = {
  kind: "MessageEvent",
  llm_message: { role: "user", content: [{ text: "<context>CLAUDE.md…</context>\n\nhi" }] },
} as SdkEvent;

describe("écho d'un message utilisateur", () => {
  it("montre le texte écrit et ce qui a été chargé, pas le prompt", () => {
    const [item] = eventToItems(USER_EVENT, 1, 0, { text: "hi", loaded: ["instructions (CLAUDE.md)"] });
    expect(item).toMatchObject({ kind: "user", text: "hi", loaded: ["instructions (CLAUDE.md)"] });
  });

  it("sans chargement, pas de ligne `loaded`", () => {
    const [item] = eventToItems(USER_EVENT, 1, 0, { text: "hi", loaded: [] });
    expect(item).toMatchObject({ text: "hi" });
    expect(item).not.toHaveProperty("loaded");
  });
});

describe("progression du démarrage", () => {
  const starting: AppState = { ...initialState(), phase: { kind: "starting" } };
  const progress: Outbound = { type: "session_progress", steps: ["A", "B"], current: 1 };

  it("suit les étapes, puis disparaît avec un échec du démarrage", () => {
    const state = reduceBridge(starting, progress, 0);
    expect(state.startup).toEqual({ steps: ["A", "B"], current: 1 });
    expect(endTurnOnError(state, false).startup).toBeNull();
  });

  it("disparaît quand la session démarre", () => {
    const state = reduceBridge(
      reduceBridge(starting, progress, 0),
      { type: "session_started", conversation_id: "c", llm_source: "create_payload" },
      0,
    );
    expect(state.startup).toBeNull();
  });
});

describe("GPU", () => {
  it("un petit voisin n'est pas de la contention, même présent sur deux GPU", () => {
    const csv = "/usr/local/bin/python, 306\n/opt/llm/llama-server, 12946\n/usr/local/bin/python, 306\n";
    expect(foreignGpuUse(csv)).toEqual({ heavy: [], others: ["python (612 MiB)"] });
  });

  it("un gros consommateur en est", () => {
    expect(foreignGpuUse("/usr/bin/train, 4096\n")).toEqual({ heavy: ["train (4096 MiB)"], others: [] });
  });
});

describe("emplacement de la vue", () => {
  it("le chat vit dans la barre latérale secondaire", () => {
    const { contributes } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(contributes.viewsContainers.secondarySidebar[0].id).toBe("agenticenvChat");
    expect(contributes.viewsContainers.activitybar).toBeUndefined();
    expect(Object.keys(contributes.views)).toEqual(["agenticenvChat"]);
  });
});
