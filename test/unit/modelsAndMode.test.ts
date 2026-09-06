import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { HostToWebview, ModelView } from "../../src/messages";

const fromHost = (message: HostToWebview, at = 1000) => host(message, at);

function connected(): AppState {
  let s = reduce(initialState(), host({ type: "connection", state: "open" }));
  return reduce(s, host({ type: "protocol", version: 2, capabilities: ["models"], degraded: false }));
}

const m = (over: Partial<ModelView> & { id: string }): ModelView => ({
  label: over.id,
  contextWindow: 0,
  current: false,
  ...over,
});

describe("C12 — sélection de modèle & mode", () => {
  it("sans message `models`, `state.models` reste null (aucun sélecteur)", () => {
    expect(connected().models).toBeNull();
  });

  it("`models` alimente la jauge depuis la fenêtre du modèle courant", () => {
    const s = reduce(connected(), fromHost({ type: "models", models: [
      m({ id: "big", contextWindow: 32768, current: true }),
      m({ id: "small", contextWindow: 8192 }),
    ] }));
    expect(s.models).toHaveLength(2);
    expect(s.usage?.contextWindow).toBe(32768);
  });

  it("un changement de modèle courant est inscrit dans le fil", () => {
    let s = reduce(connected(), fromHost({ type: "models", models: [
      m({ id: "a", label: "model-a", contextWindow: 16000, current: true }),
      m({ id: "b", label: "model-b", contextWindow: 8000 }),
    ] }));
    s = reduce(s, fromHost({ type: "models", models: [
      m({ id: "a", label: "model-a", contextWindow: 16000 }),
      m({ id: "b", label: "model-b", contextWindow: 8000, current: true }),
    ] }));
    const last = s.items[s.items.length - 1];
    expect(last.kind).toBe("model-switch");
    expect(last).toMatchObject({ model: "model-b" });
    expect(s.usage?.contextWindow).toBe(8000);
  });

  it("un modèle `loading` ne produit pas encore de marqueur de bascule", () => {
    let s = reduce(connected(), fromHost({ type: "models", models: [m({ id: "a", current: true })] }));
    s = reduce(s, fromHost({ type: "models", models: [
      m({ id: "a" }),
      m({ id: "b", current: true, state: "loading" }),
    ] }));
    expect(s.items.some((i) => i.kind === "model-switch")).toBe(false);
  });

  it("`sessionMode` (hôte) et `session/setMode` (local) fixent le mode", () => {
    let s = reduce(connected(), fromHost({ type: "sessionMode", mode: "ask", interruptCapable: false }));
    expect(s.sessionMode).toBe("ask");
    s = reduce(s, local({ type: "session/setMode", mode: "agent" }));
    expect(s.sessionMode).toBe("agent");
  });
});
