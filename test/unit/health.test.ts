import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionArgv } from "../../src/health";

const ctx = { bridgeUrl: "ws://127.0.0.1:8300", agenticEnvPath: "~/AgenticEnv" };

/** WP08f §3.1 : les actions du panneau Components sont un argv exécuté sans shell. */
describe("actionArgv (WP08f)", () => {
  it("bridge → unit systemctl --user, jamais de sudo", () => {
    expect(actionArgv("bridge", "start", ctx)).toEqual([
      "systemctl",
      "--user",
      "start",
      "agenticenv-bridge",
    ]);
    // le bridge ne se stoppe/redémarre pas depuis le panneau
    expect(actionArgv("bridge", "restart", ctx)).toBeUndefined();
  });

  it("llama-server → sudo -n systemctl <action> llama-server.service", () => {
    expect(actionArgv("llama-server", "restart", ctx)).toEqual([
      "sudo",
      "-n",
      "systemctl",
      "restart",
      "llama-server.service",
    ]);
    expect(actionArgv("llama-server", "pull", ctx)).toBeUndefined();
  });

  it("llama-bridge → start arme le .socket, stop/restart visent le .service", () => {
    expect(actionArgv("llama-bridge", "start", ctx)).toEqual([
      "sudo",
      "-n",
      "systemctl",
      "start",
      "llama-bridge.socket",
    ]);
    expect(actionArgv("llama-bridge", "restart", ctx)).toEqual([
      "sudo",
      "-n",
      "systemctl",
      "restart",
      "llama-bridge.service",
    ]);
  });

  it("docker → sudo -n systemctl start docker.service", () => {
    expect(actionArgv("docker", "start", ctx)).toEqual([
      "sudo",
      "-n",
      "systemctl",
      "start",
      "docker.service",
    ]);
    expect(actionArgv("docker", "stop", ctx)).toBeUndefined();
  });

  function withImage(image: string): typeof ctx {
    const dir = mkdtempSync(join(tmpdir(), "agx-health-"));
    mkdirSync(join(dir, "configs"));
    writeFileSync(join(dir, "configs", "openhands.yaml"), `sandbox:\n  image: ${image}\n`);
    return { ...ctx, agenticEnvPath: dir };
  }

  it("agent-server-image → docker pull <image épinglée>", () => {
    const image = "ghcr.io/openhands/agent-server:1.21.0-python@sha256:abc";
    expect(actionArgv("agent-server-image", "pull", withImage(image))).toEqual(["docker", "pull", image]);
  });

  it("une image construite localement ne se télécharge pas", () => {
    expect(actionArgv("agent-server-image", "pull", withImage("agenticenv/agent:latest"))).toBeUndefined();
  });

  it("aucun argv ne contient d'opérateur shell", () => {
    const ids = ["bridge", "llama-server", "llama-bridge", "docker", "agent-server-image"] as const;
    const actions = ["start", "stop", "restart", "pull"] as const;
    for (const id of ids) {
      for (const action of actions) {
        for (const tok of actionArgv(id, action, ctx) ?? []) {
          expect(tok).not.toMatch(/[&|;><$`]/);
        }
      }
    }
  });
});
