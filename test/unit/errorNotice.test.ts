import { describe, expect, it } from "vitest";
import { errorNotice } from "../../src/webview/store/errorNotice";
import { host } from "../../src/webview/store/actions";
import { reduce } from "../../src/webview/store/reducer";
import { initialState, type AppState } from "../../src/webview/store/types";
import type { Outbound } from "../../src/protocol";

const bridge = (message: Outbound, at = 1000) => host({ type: "bridge", message }, at);

function degraded(): AppState {
  let s = reduce(initialState(), host({ type: "connection", state: "open" }));
  return reduce(s, host({ type: "protocol", version: 1, capabilities: [], degraded: true }));
}

describe("C14 §3 — erreurs actionnables", () => {
  it("chaque code connu porte au moins une action", () => {
    for (const code of [
      "BRIDGE_UNREACHABLE",
      "SESSION_BUSY",
      "PROJECT_READONLY",
      "MODEL_UNAVAILABLE",
      "DOCKER_DOWN",
      "IMAGE_MISSING",
      "GPU_CONTENTION",
      "SOMETHING_ELSE",
    ]) {
      const n = errorNotice(code, "detail");
      expect(n.actions?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("PROJECT_READONLY porte la commande exacte à copier / exécuter", () => {
    const n = errorNotice("PROJECT_READONLY", "read only", { command: "setfacl -m u:1000:rwx /workspace" });
    expect(n.text).toContain("setfacl -m u:1000:rwx /workspace");
    const copy = n.actions?.find((a) => a.kind === "copy");
    expect(copy?.payload).toBe("setfacl -m u:1000:rwx /workspace");
    expect(n.actions?.some((a) => a.kind === "runInTerminal")).toBe(true);
  });

  it("SESSION_BUSY propose une nouvelle session", () => {
    const n = errorNotice("SESSION_BUSY", "busy");
    expect(n.actions?.some((a) => a.kind === "forceNewSession")).toBe(true);
  });

  it("les erreurs répétées sont regroupées (×N), pas empilées", () => {
    let s = degraded();
    s = reduce(s, bridge({ type: "error", code: "MODEL_UNAVAILABLE", message: "oom", details: {} }));
    s = reduce(s, bridge({ type: "error", code: "MODEL_UNAVAILABLE", message: "oom", details: {} }));
    s = reduce(s, bridge({ type: "error", code: "MODEL_UNAVAILABLE", message: "oom", details: {} }));
    const errs = s.notices.filter((n) => n.id === "bridge-MODEL_UNAVAILABLE");
    expect(errs).toHaveLength(1);
    expect(errs[0].count).toBe(3);
  });
});
