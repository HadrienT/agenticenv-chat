import { describe, expect, it } from "vitest";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { PendingActionView } from "../../src/messages";
import type { Outbound } from "../../src/protocol";
import { allowPatternFor, synthesizePending } from "../../src/permissions/synthesize";

const bridge = (m: Outbound) => host({ type: "bridge", message: m }, 1000);

function running(): AppState {
  let s = reduce(initialState(), host({ type: "protocol", version: 2, capabilities: [], degraded: false }));
  s = reduce(s, bridge({ type: "session_started", conversation_id: "c", llm_source: "create_payload" }));
  return reduce(s, bridge({ type: "turn_started", turn_id: "t1" }));
}

const pending: PendingActionView = {
  actionId: "a1",
  kind: "command",
  summary: "rm -rf build",
  command: "rm -rf build",
  warnings: [{ pattern: "x", message: "recursive delete" }],
  blind: false,
};

describe("pendingAction (C07 §1)", () => {
  it("running → awaiting avec la charge utile ; null → retour running", () => {
    let s = reduce(running(), host({ type: "pendingAction", action: pending }));
    expect(s.phase.kind).toBe("awaiting");
    if (s.phase.kind === "awaiting") {
      expect(s.phase.pending?.command).toBe("rm -rf build");
    }
    s = reduce(s, host({ type: "pendingAction", action: null }));
    expect(s.phase.kind).toBe("running");
  });

  it("permissionMode autoAll ⇒ bannière permanente non-dismissible", () => {
    const s = reduce(initialState(), host({ type: "permissionMode", mode: "autoAll", trusted: true }));
    const banner = s.notices.find((n) => n.id === "perm-yolo");
    expect(banner?.dismissible).toBe(false);
    const s2 = reduce(s, host({ type: "permissionMode", mode: "ask", trusted: true }));
    expect(s2.notices.find((n) => n.id === "perm-yolo")).toBeUndefined();
  });

  it("permissionOutcome ⇒ item visible dans le fil avec la règle", () => {
    const s = reduce(
      running(),
      host({ type: "permissionOutcome", verdict: "allowed", rule: "^ctest\\b", summary: "ctest" }),
    );
    const item = s.items.find((i) => i.kind === "permission");
    expect(item).toMatchObject({ verdict: "allowed", rule: "^ctest\\b" });
  });
});

describe("synthesize (bridge v1 sans charge utile)", () => {
  it("dernier ActionEvent terminal ⇒ pending command + warnings", () => {
    const p = synthesizePending({ toolName: "terminal", args: { command: "rm -rf x" } }, "a1");
    expect(p).toMatchObject({ kind: "command", command: "rm -rf x", blind: false });
    expect(p.warnings.length).toBe(1);
  });

  it("aucun ActionEvent ⇒ blind:true (aveu honnête)", () => {
    expect(synthesizePending(null, "a1").blind).toBe(true);
  });

  it("allowPatternFor : premier mot ancré", () => {
    expect(allowPatternFor(synthesizePending({ toolName: "terminal", args: { command: "ctest --v" } }, "a"))).toBe("^ctest\\b");
  });
});
