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

  it("agent-server-image → docker pull <image épinglée>", () => {
    const argv = actionArgv("agent-server-image", "pull", ctx);
    expect(argv?.slice(0, 2)).toEqual(["docker", "pull"]);
    expect(argv?.[2]).toMatch(/agent-server/);
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
