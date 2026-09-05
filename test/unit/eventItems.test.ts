import { describe, expect, it } from "vitest";
import { eventToItems } from "../../src/webview/store/eventItems";

const AT = 1_700_000_000_000;

describe("eventToItems — traduction pure SdkEvent → ChatItem", () => {
  it("MessageEvent assistant → bulle assistant streaming:false, ts hérité", () => {
    const items = eventToItems(
      { kind: "MessageEvent", llm_message: { role: "assistant", content: [{ text: "hi " }, { text: "there" }] } },
      3,
      AT,
    );
    expect(items).toEqual([
      { kind: "assistant", id: "ev-3", text: "hi there", streaming: false, revision: 0, ts: AT },
    ]);
  });

  it("timestamp SDK ISO prioritaire sur `at`", () => {
    const [item] = eventToItems(
      { kind: "MessageEvent", timestamp: "2023-01-01T00:00:00Z", llm_message: { role: "user", content: [{ text: "x" }] } },
      0,
      AT,
    );
    expect(item).toMatchObject({ kind: "user", ts: Date.parse("2023-01-01T00:00:00Z") });
  });

  it("MessageEvent sans texte → ignoré", () => {
    expect(
      eventToItems({ kind: "MessageEvent", llm_message: { role: "assistant", content: [] } }, 0, AT),
    ).toEqual([]);
  });

  it("ActionEvent → item tool status running, pensée aplatie", () => {
    const [item] = eventToItems(
      { kind: "ActionEvent", tool_name: "bash", thought: [{ text: "let me " }, { text: "check" }], action: { cmd: "ls" } },
      1,
      AT,
    );
    expect(item).toMatchObject({ kind: "tool", toolName: "bash", thought: "let me check", status: "running" });
  });

  it("ObservationEvent → item observation", () => {
    const [item] = eventToItems({ kind: "ObservationEvent", tool_name: "bash", observation: { out: "x" } }, 2, AT);
    expect(item).toMatchObject({ kind: "observation", toolName: "bash", result: { out: "x" } });
  });

  it("AgentErrorEvent → item error", () => {
    expect(eventToItems({ kind: "AgentErrorEvent", error: "boom" }, 4, AT)).toEqual([
      { kind: "error", id: "ev-4", text: "boom", ts: AT },
    ]);
  });
});
