import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { patchItem, reduce } from "../../src/webview/store/reducer";
import { composerButton } from "../../src/webview/store/selectors";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";

const bridge = (message: Outbound, at = 1000) => host({ type: "bridge", message }, at);

function connected(degraded = false): AppState {
  let s = reduce(initialState(), host({ type: "connection", state: "open" }));
  s = reduce(
    s,
    host({ type: "protocol", version: degraded ? 1 : 2, capabilities: [], degraded }),
  );
  return s;
}

function idle(conversationId = "c1", degraded = false): AppState {
  let s = connected(degraded);
  s = reduce(s, local({ type: "intent/startSession" }));
  return reduce(
    s,
    bridge({ type: "session_started", conversation_id: conversationId, llm_source: "create_payload" }),
  );
}

function running(turnId = "t1"): AppState {
  let s = idle();
  s = reduce(s, local({ type: "intent/sendMessage", text: "hi" }));
  return reduce(s, bridge({ type: "turn_started", turn_id: turnId }, 5000));
}

describe("reducer — machine à états v2 (C01)", () => {
  it("picking → starting → idle", () => {
    let s = connected();
    expect(s.phase.kind).toBe("picking");
    s = reduce(s, local({ type: "intent/startSession" }));
    expect(s.phase.kind).toBe("starting");
    s = reduce(
      s,
      bridge({ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }),
    );
    expect(s.phase).toEqual({ kind: "idle", conversationId: "c1" });
  });

  it("I2 — `running` n'est atteint que par `turn_started`, avec son turnId", () => {
    let s = idle();
    s = reduce(s, local({ type: "intent/sendMessage", text: "hi" }));
    // envoi optimiste : pas encore running, juste pendingSend
    expect(s.phase.kind).toBe("idle");
    expect(s.pendingSend).toBe(true);

    s = reduce(s, bridge({ type: "turn_started", turn_id: "t1" }, 5000));
    expect(s.phase).toMatchObject({ kind: "running", turnId: "t1", startedAt: 5000 });
    expect(s.pendingSend).toBe(false);
  });

  it("I1 — `usage` et `files_changed` ne changent jamais la phase (v2)", () => {
    let s = running();
    s = reduce(s, bridge({ type: "files_changed", changes: [{ status: "UPDATED", path: "a.cpp" }] }));
    expect(s.phase.kind).toBe("running");
    s = reduce(s, bridge(usage()));
    expect(s.phase.kind).toBe("running");
    expect(s.workingSet).toHaveLength(1);
    expect(s.usage?.promptTokens).toBe(10);
  });

  it("`running → idle` uniquement sur `turn_finished` du bon turnId (I3)", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t-other", reason: "completed" }));
    expect(s.phase.kind).toBe("running"); // turnId inconnu → ignoré
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t1", reason: "completed" }));
    expect(s.phase).toEqual({ kind: "idle", conversationId: "c1" });
  });

  it("I6 — deux `turn_started` sans `turn_finished` : le second est ignoré + notice", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "turn_started", turn_id: "t2" }, 6000));
    expect(s.phase).toMatchObject({ kind: "running", turnId: "t1" });
    expect(s.notices.some((n) => n.id === "turn-overlap")).toBe(true);
  });

  it("I5 — awaiting depuis running, y revient sur confirm", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "awaiting_confirmation", conversation_id: "c1" }));
    expect(s.phase).toMatchObject({ kind: "awaiting", turnId: "t1" });
    s = reduce(s, local({ type: "intent/confirm", accept: true, at: 7000 }));
    expect(s.phase).toMatchObject({ kind: "running", turnId: "t1" });
  });

  it("Stop : running → cancelling → idle sur turn_finished{cancelled}", () => {
    let s = running("t1");
    s = reduce(s, local({ type: "intent/cancelTurn" }));
    expect(s.phase.kind).toBe("cancelling");
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t1", reason: "cancelled" }));
    expect(s.phase.kind).toBe("idle");
    expect(s.items.some((i) => i.kind === "turn-cancelled")).toBe(true);
  });

  it("Stop indisponible sur bridge v1 (degraded)", () => {
    let s = idle("c1", true);
    s = reduce(s, local({ type: "intent/sendMessage", text: "hi" }));
    // v1 : pas de turn_started ; le repli termine sur files_changed
    s = reduce(s, bridge({ type: "files_changed", changes: [] }));
    expect(s.phase.kind).toBe("idle");
  });

  it("deltas : concaténation + révision croissante ; l'event final écrase", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "event_delta", turn_id: "t1", event_id: "e9", text: "Hel" }));
    s = reduce(s, bridge({ type: "event_delta", turn_id: "t1", event_id: "e9", text: "lo" }));
    let assistant = s.items.find((i) => i.kind === "assistant");
    expect(assistant).toMatchObject({ text: "Hello", streaming: true, revision: 2 });

    s = reduce(
      s,
      bridge({
        type: "event",
        event: { kind: "MessageEvent", id: "e9", llm_message: { role: "assistant", content: [{ text: "Hello!" }] } },
      }),
    );
    assistant = s.items.find((i) => i.kind === "assistant");
    expect(assistant).toMatchObject({ text: "Hello!", streaming: false });
    expect(s.items.filter((i) => i.kind === "assistant")).toHaveLength(1);
  });

  it("tool_status pilote l'icône de l'item outil correspondant", () => {
    let s = running("t1");
    s = reduce(
      s,
      bridge({
        type: "event",
        event: { kind: "ActionEvent", tool_name: "bash", tool_call_id: "call-1", action: { cmd: "ls" } },
      }),
    );
    expect(s.items.find((i) => i.kind === "tool")).toMatchObject({ status: "running" });
    s = reduce(s, bridge({ type: "tool_status", tool_call_id: "call-1", state: "ok" }));
    expect(s.items.find((i) => i.kind === "tool")).toMatchObject({ status: "ok" });
  });

  it("progress alimente la ligne d'état, effacée en fin de tour", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "progress", turn_id: "t1", label: "Reading black.cpp…" }));
    expect(s.progress).toBe("Reading black.cpp…");
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t1", reason: "completed" }));
    expect(s.progress).toBeNull();
  });

  it("I4 — une déconnexion préserve items et brouillon", () => {
    let s = running("t1");
    s = reduce(s, local({ type: "composer/setDraft", draft: "half" }));
    s = reduce(s, bridge({ type: "event", event: assistantEvent("hi") }));
    const items = s.items;
    s = reduce(s, host({ type: "connection", state: "closed", detail: "socket" }));
    expect(s.connection.state).toBe("closed");
    expect(s.items).toEqual(items);
    expect(s.composer.draft).toBe("half");
  });

  it("I8 — append-only sauf patchItem", () => {
    let s = idle();
    s = reduce(s, bridge({ type: "event", event: assistantEvent("one") }));
    s = reduce(s, bridge({ type: "event", event: assistantEvent("two") }));
    expect(s.items.map((i) => i.id)).toEqual(["ev-0", "ev-1"]);
    const patched = patchItem(s, "ev-1", { text: "TWO" } as Partial<AppState["items"][number]>);
    expect(patched.items[1]).toMatchObject({ id: "ev-1", text: "TWO" });
    expect(patchItem(s, "nope", { text: "x" } as Partial<AppState["items"][number]>)).toBe(s);
  });

  it("protocol dégradé → bannière + notice", () => {
    const s = connected(true);
    expect(s.protocol.degraded).toBe(true);
    expect(s.notices.some((n) => n.id === "protocol-v1")).toBe(true);
  });

  it("notices : liste, dismiss cible l'id", () => {
    let s = idle();
    s = reduce(s, bridge({ type: "error", code: "PROJECT_READONLY", message: "ro", details: {} }));
    s = reduce(s, bridge({ type: "error", code: "TIMEOUT", message: "slow", details: {} }));
    expect(s.notices.filter((n) => n.id.startsWith("bridge-"))).toHaveLength(2);
    s = reduce(s, local({ type: "notice/dismiss", id: "bridge-TIMEOUT" }));
    expect(s.notices.filter((n) => n.id.startsWith("bridge-")).map((n) => n.id)).toEqual([
      "bridge-PROJECT_READONLY",
    ]);
  });

  it("un tour sans `files_changed` ni `usage` se termine quand même sur turn_finished", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "event", event: assistantEvent("done, nothing changed") }));
    s = reduce(s, bridge({ type: "turn_finished", turn_id: "t1", reason: "completed" }));
    expect(s.phase.kind).toBe("idle");
    expect(s.workingSet).toEqual([]);
    expect(s.usage).toBeNull();
  });

  it("`turn_finished` jamais envoyé : cancelling reste actif, aucun timeout", () => {
    let s = running("t1");
    s = reduce(s, local({ type: "intent/cancelTurn" }));
    // beaucoup d'événements plus tard, toujours pas de turn_finished
    s = reduce(s, bridge({ type: "event", event: assistantEvent("still going") }));
    s = reduce(s, bridge(usage()));
    expect(s.phase.kind).toBe("cancelling");
    expect(composerButton(s)).toBe("cancelling");
  });

  it("deltas arrivant après l'`event` final : le final gagne", () => {
    let s = running("t1");
    s = reduce(
      s,
      bridge({
        type: "event",
        event: { kind: "MessageEvent", id: "e1", llm_message: { role: "assistant", content: [{ text: "final" }] } },
      }),
    );
    s = reduce(s, bridge({ type: "event_delta", turn_id: "t1", event_id: "e1", text: " stray" }));
    // le delta tardif est ignoré (l'item est figé) : le final gagne.
    expect(s.items.filter((i) => i.kind === "assistant")).toHaveLength(1);
    expect(s.items.find((i) => i.kind === "assistant")).toMatchObject({
      text: "final",
      streaming: false,
    });
  });

  it("reset conserve connexion / protocole / mcp, vide le fil", () => {
    let s = running("t1");
    s = reduce(s, bridge({ type: "event", event: assistantEvent("hi") }));
    s = reduce(s, host({ type: "reset" }));
    expect(s.phase.kind).toBe("picking");
    expect(s.items).toEqual([]);
    expect(s.connection.state).toBe("open");
    expect(s.protocol.version).toBe(2);
  });
});

function assistantEvent(text: string) {
  return { kind: "MessageEvent", llm_message: { role: "assistant", content: [{ text }] } };
}
function usage(): Outbound {
  return {
    type: "usage",
    accumulated_cost: 0.01,
    prompt_tokens: 10,
    completion_tokens: 5,
    context_window: 8000,
  };
}
