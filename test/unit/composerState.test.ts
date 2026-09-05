import { describe, expect, it } from "vitest";
import { host, local } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { budgetStatus, effectiveAttachments } from "../../src/webview/store/selectors";
import { initialState } from "../../src/webview/store/types";
import { pushHistory } from "../../src/webview/store/composerHelpers";
import type { ContextChip } from "../../src/messages";

const chip = (uri: string, bytes = 400): ContextChip => ({
  ref: { kind: "file", uri },
  label: uri,
  estBytes: bytes,
});

describe("chips — cycle (C03 §2)", () => {
  it("ajout, doublon fusionné, retrait", () => {
    let s = initialState();
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("a") }));
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("a") })); // doublon
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("b") }));
    expect(s.composer.attachments).toHaveLength(2);
    s = reduce(s, local({ type: "composer/removeAttachment", index: 0 }));
    expect(s.composer.attachments.map((a) => a.ref)).toEqual([{ kind: "file", uri: "b" }]);
  });

  it("auto-chips : retrait mémorisé, non ré-affiché", () => {
    let s = initialState();
    s = reduce(s, host({ type: "autoContext", chips: [chip("active.cpp")] }));
    expect(effectiveAttachments(s)).toHaveLength(1);
    const key = JSON.stringify({ kind: "file", uri: "active.cpp" });
    s = reduce(s, local({ type: "composer/dismissAuto", refKey: key }));
    expect(effectiveAttachments(s)).toHaveLength(0);
    // le retrait survit à un nouveau push d'auto-contexte
    s = reduce(s, host({ type: "autoContext", chips: [chip("active.cpp")] }));
    expect(effectiveAttachments(s)).toHaveLength(0);
  });

  it("auto-chip masquée si déjà attachée explicitement", () => {
    let s = initialState();
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("x.cpp") }));
    s = reduce(s, host({ type: "autoContext", chips: [chip("x.cpp")] }));
    expect(effectiveAttachments(s)).toHaveLength(1);
  });
});

describe("historique de prompts (item 9)", () => {
  it("dédupliqué, plafonné à 50, poussé à l'envoi", () => {
    let h: string[] = [];
    h = pushHistory(h, "first");
    h = pushHistory(h, "second");
    h = pushHistory(h, "first"); // remonte en fin
    expect(h).toEqual(["second", "first"]);
    for (let i = 0; i < 60; i++) {
      h = pushHistory(h, `m${i}`);
    }
    expect(h).toHaveLength(50);
  });

  it("intent/sendMessage pousse le texte dans l'historique", () => {
    let s = reduce(initialState(), host({ type: "bridge", message: { type: "session_started", conversation_id: "c", llm_source: "create_payload" } }));
    s = reduce(s, local({ type: "intent/sendMessage", text: "hello world" }));
    expect(s.composer.history).toEqual(["hello world"]);
    expect(s.composer.attachments).toEqual([]);
  });
});

describe("budget (item 16)", () => {
  it("seuils ok / warn / high / over selon la fenêtre de contexte", () => {
    let s = initialState();
    s = reduce(s, host({ type: "bridge", message: { type: "usage", accumulated_cost: 0, prompt_tokens: 0, completion_tokens: 0, context_window: 1000 } }));
    // fenêtre = 1000 tok * 4 = 4000 octets
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("a", 1000) }));
    expect(budgetStatus(s).level).toBe("ok");
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("b", 2000) }));
    expect(budgetStatus(s).level).toBe("warn");
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("c", 700) }));
    expect(budgetStatus(s).level).toBe("high");
    s = reduce(s, local({ type: "composer/addAttachment", chip: chip("d", 1000) }));
    expect(budgetStatus(s).level).toBe("over");
  });
});

describe("commandResult", () => {
  it("prefill remplit le brouillon, note pousse une info", () => {
    let s = reduce(initialState(), host({ type: "commandResult", command: "help", note: "shortcuts…" }));
    expect(s.notices.some((n) => n.id === "cmd-help")).toBe(true);
    s = reduce(s, host({ type: "commandResult", command: "foo", prefill: "/foo bar" }));
    expect(s.composer.draft).toBe("/foo bar");
  });

  it("clearThread vide le fil sans quitter la session", () => {
    let s = reduce(initialState(), host({ type: "bridge", message: { type: "session_started", conversation_id: "c", llm_source: "create_payload" } }));
    s = reduce(s, host({ type: "bridge", message: { type: "event", event: { kind: "MessageEvent", llm_message: { role: "assistant", content: [{ text: "hi" }] } } } }));
    s = reduce(s, host({ type: "clearThread" }));
    expect(s.items).toEqual([]);
    expect(s.phase).toEqual({ kind: "idle", conversationId: "c" });
  });
});
