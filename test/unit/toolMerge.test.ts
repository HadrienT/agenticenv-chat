import { describe, expect, it } from "vitest";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { groupRows } from "../../src/webview/views/threadGroups";
import { initialState, type AppState, type ChatItem } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";

const bridge = (message: Outbound) => host({ type: "bridge", message }, 1000);

function idleRunning(): AppState {
  let s = reduce(initialState(), host({ type: "protocol", version: 2, capabilities: [], degraded: false }));
  s = reduce(s, bridge({ type: "session_started", conversation_id: "c1", llm_source: "create_payload" }));
  return reduce(s, bridge({ type: "turn_started", turn_id: "t1" }));
}

function action(callId: string, tool = "terminal", args: Record<string, unknown> = { command: "ls" }) {
  return { kind: "ActionEvent", tool_name: tool, tool_call_id: callId, action: args } as const;
}

describe("fusion action ↔ observation (C05 §3)", () => {
  it("action + observation appariées par tool_call_id ⇒ un seul item", () => {
    let s = idleRunning();
    s = reduce(s, bridge({ type: "event", event: action("call-1") }));
    expect(s.items.filter((i) => i.kind === "tool")).toHaveLength(1);
    expect((s.items[0] as Extract<ChatItem, { kind: "tool" }>).status).toBe("running");

    s = reduce(
      s,
      bridge({
        type: "event",
        event: { kind: "ObservationEvent", tool_name: "terminal", tool_call_id: "call-1", observation: { output: "a\nb", exit_code: 0 } },
      }),
    );
    const tool = s.items.find((i) => i.kind === "tool") as Extract<ChatItem, { kind: "tool" }>;
    expect(s.items.filter((i) => i.kind === "tool")).toHaveLength(1);
    expect(s.items.filter((i) => i.kind === "observation")).toHaveLength(0);
    expect(tool.observation).toEqual({ output: "a\nb", exit_code: 0 });
    expect(tool.status).toBe("ok");
  });

  it("observation d'erreur ⇒ status error + observationError", () => {
    let s = idleRunning();
    s = reduce(s, bridge({ type: "event", event: action("c2") }));
    s = reduce(
      s,
      bridge({
        type: "event",
        event: { kind: "ObservationEvent", tool_name: "terminal", tool_call_id: "c2", observation: { output: "boom", exit_code: 1 } },
      }),
    );
    const tool = s.items.find((i) => i.kind === "tool") as Extract<ChatItem, { kind: "tool" }>;
    expect(tool.status).toBe("error");
    expect(tool.observationError).toBe(true);
  });

  it("observation orpheline (aucune action) ⇒ item observation seul, jamais perdue", () => {
    let s = idleRunning();
    s = reduce(
      s,
      bridge({
        type: "event",
        event: { kind: "ObservationEvent", tool_name: "grep", tool_call_id: "ghost", observation: { output: "x" } },
      }),
    );
    expect(s.items.filter((i) => i.kind === "observation")).toHaveLength(1);
  });

  it("AgentErrorEvent apparié ⇒ marque l'outil en erreur", () => {
    let s = idleRunning();
    s = reduce(s, bridge({ type: "event", event: action("c3") }));
    s = reduce(
      s,
      bridge({ type: "event", event: { kind: "AgentErrorEvent", tool_call_id: "c3", error: "tool blew up" } }),
    );
    const tool = s.items.find((i) => i.kind === "tool") as Extract<ChatItem, { kind: "tool" }>;
    expect(tool.status).toBe("error");
  });
});

describe("regroupement (C05 §5)", () => {
  const mk = (id: string, tool: string, status: "running" | "ok" | "error" = "ok"): ChatItem => ({
    kind: "tool",
    id,
    toolName: tool,
    thought: "",
    args: {},
    status,
  });

  it("3 outils consécutifs de la même famille ⇒ groupe", () => {
    const rows = groupRows([mk("a", "grep"), mk("b", "glob"), mk("c", "grep")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("group");
  });

  it("2 outils ⇒ pas de groupe", () => {
    const rows = groupRows([mk("a", "grep"), mk("b", "grep")]);
    expect(rows.every((r) => r.kind === "single")).toBe(true);
  });

  it("un message assistant coupe le groupe", () => {
    const rows = groupRows([
      mk("a", "grep"),
      mk("b", "grep"),
      { kind: "assistant", id: "m", text: "hmm", streaming: false, revision: 0 },
      mk("c", "grep"),
    ]);
    expect(rows.every((r) => r.kind === "single")).toBe(true);
  });

  it("groupe avec erreur : signalé", () => {
    const rows = groupRows([mk("a", "grep"), mk("b", "grep", "error"), mk("c", "grep")]);
    expect(rows[0].kind === "group" && rows[0].hasError).toBe(true);
  });
});
