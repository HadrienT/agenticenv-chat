import { afterEach, describe, expect, it } from "vitest";
import { BridgeClient } from "../../src/bridgeClient";
import { OUTBOUND_TYPES, type Outbound } from "../../src/protocol";
import { startFakeBridge, wp08dResponder, type FakeBridge } from "../fake-bridge/server";

let fake: FakeBridge | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (pred()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error("timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

/**
 * Fil complet WP08d contre le rejoueur `wp08dResponder` : négociation,
 * `start_session.mode`, `checkpoint` avant le tour, `file_diff`, `bundle_diff`,
 * `apply_changes` → `changes_applied` (+ `skipped`), `discard_changes`,
 * `restore_checkpoint`. Vérifie les **formes du fil** et la monotonie de `seq`.
 */
describe("WP08d — fil bridge complet (BridgeClient ↔ faux bridge)", () => {
  it("négociation + tour + apply/discard/diff/restore, seq monotone", async () => {
    fake = await startFakeBridge({ onMessage: wp08dResponder({ applySkips: [{ path: "src/other.cpp", reason: "host file changed since session start" }] }) });

    const seen: Outbound[] = [];
    const client = new BridgeClient(fake.url, {
      onState: () => undefined,
      onMessage: (m) => seen.push(m),
    });
    client.start();
    const last = (): Outbound | undefined => seen[seen.length - 1];
    const got = (t: string): Outbound | undefined => [...seen].reverse().find((m) => m.type === t);

    await waitFor(() => client.send({ type: "hello", protocol: 2, client: "test" }));
    await waitFor(() => got("welcome") !== undefined);
    const welcome = got("welcome") as Extract<Outbound, { type: "welcome" }>;
    expect(welcome.capabilities).toEqual(["turns", "cancel", "diffs", "checkpoints", "apply"]);

    client.send({ type: "start_session", mcp_servers: [], project_path: "/p", mode: "agent" });
    await waitFor(() => got("session_started") !== undefined);
    expect((got("session_started") as Extract<Outbound, { type: "session_started" }>).mode).toBe("agent");

    client.send({ type: "user_message", text: "edit black.cpp" });
    await waitFor(() => got("turn_finished") !== undefined);
    // checkpoint précède turn_started (spec §3)
    const cpIdx = seen.findIndex((m) => m.type === "checkpoint");
    const tsIdx = seen.findIndex((m) => m.type === "turn_started");
    expect(cpIdx).toBeGreaterThanOrEqual(0);
    expect(cpIdx).toBeLessThan(tsIdx);
    expect(got("files_changed")).toBeDefined();

    client.send({ type: "request_diff", path: "src/black.cpp" });
    await waitFor(() => got("file_diff") !== undefined);
    expect((got("file_diff") as Extract<Outbound, { type: "file_diff" }>).unified).toContain("+y");

    client.send({ type: "request_bundle_diff" });
    await waitFor(() => got("bundle_diff") !== undefined);

    client.send({ type: "apply_changes", paths: null });
    await waitFor(() => got("changes_applied") !== undefined);
    const applied = got("changes_applied") as Extract<Outbound, { type: "changes_applied" }>;
    expect(applied.applied.map((a) => a.path)).toContain("src/black.cpp");
    expect(applied.skipped[0]).toMatchObject({ reason: "host file changed since session start" });

    client.send({ type: "discard_changes", paths: ["src/black.cpp"] });
    client.send({ type: "restore_checkpoint", checkpoint_id: "cp-1" });
    await waitFor(() => got("checkpoint_restored") !== undefined);

    // toutes les frames sont des Outbound connus, `seq` strictement croissant
    let prev = 0;
    for (const m of seen) {
      expect((OUTBOUND_TYPES as readonly string[])).toContain(m.type);
      expect(typeof m.seq).toBe("number");
      expect(m.seq!).toBeGreaterThan(prev);
      prev = m.seq!;
    }
    expect(last()).toBeDefined();
    client.stop();
  });

  it("mode read_only : `session_started.mode` le reflète", async () => {
    fake = await startFakeBridge({ onMessage: wp08dResponder() });
    const seen: Outbound[] = [];
    const client = new BridgeClient(fake.url, { onState: () => undefined, onMessage: (m) => seen.push(m) });
    client.start();
    await waitFor(() => client.send({ type: "hello", protocol: 2, client: "test" }));
    client.send({ type: "start_session", mcp_servers: [], project_path: "/p", mode: "read_only" });
    await waitFor(() => seen.some((m) => m.type === "session_started"));
    const ss = seen.find((m) => m.type === "session_started") as Extract<Outbound, { type: "session_started" }>;
    expect(ss.mode).toBe("read_only");
    client.stop();
  });
});
