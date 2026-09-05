import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { HOST_TO_WEBVIEW_TYPES, WEBVIEW_TO_HOST_TYPES } from "../../src/messages";
import { OUTBOUND_TYPES } from "../../src/protocol";
import { read, SRC_DIR } from "./helpers";

/**
 * exhaustive-routers (05-TESTING §5) : les deux routeurs traitent toute l'union,
 * `assertNever` en garde. Vérification statique : chaque discriminant a un `case`
 * dans le routeur correspondant, et le routeur se termine par `assertNever`.
 */
describe("discipline — routeurs exhaustifs", () => {
  it("le réducteur webview traite tout HostToWebview + tout Outbound et garde assertNever", () => {
    const host = read(join(SRC_DIR, "webview", "store", "reduceHost.ts"));
    const bridge = read(join(SRC_DIR, "webview", "store", "reduceBridge.ts"));
    for (const t of HOST_TO_WEBVIEW_TYPES) {
      expect(host, `case "${t}" manquant dans applyHost`).toContain(`case "${t}"`);
    }
    for (const t of OUTBOUND_TYPES) {
      expect(bridge, `case "${t}" manquant dans applyBridge`).toContain(`case "${t}"`);
    }
    expect(host).toMatch(/assertNever\(msg, "HostToWebview"\)/);
    expect(bridge).toMatch(/assertNever\(msg, "Outbound"\)/);
  });

  it("le routeur hôte traite tout WebviewToHost et garde assertNever", () => {
    const src = read(join(SRC_DIR, "chatViewProvider.ts"));
    for (const t of WEBVIEW_TO_HOST_TYPES) {
      expect(src, `case "${t}" manquant dans onWebviewMessage`).toContain(`case "${t}"`);
    }
    expect(src).toMatch(/assertNever\(msg, "WebviewToHost"\)/);
  });
});
