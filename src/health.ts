import { execFile } from "node:child_process";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ComponentHealth, HealthActionId } from "./protocol";

const DEFAULT_IMAGE = "ghcr.io/openhands/agent-server:1.21.0-python";
const LLAMA_UNIT = "llama-server";
const BRIDGE_UNIT = "llama-bridge.socket";

function run(cmd: string, args: string[], timeoutMs = 4000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      const e = err as (Error & { code?: number }) | null;
      resolve({ code: e?.code ?? (err ? 1 : 0), out: `${stdout}${stderr}`.trim() });
    });
  });
}

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Resolves the pinned agent-server image from configs/openhands.yaml, best-effort. */
function agentServerImage(agenticEnvPath: string): string {
  try {
    const yaml = fs.readFileSync(path.join(agenticEnvPath, "configs", "openhands.yaml"), "utf8");
    const m = yaml.match(/^\s*image:\s*(\S+)/m);
    return m?.[1] ?? DEFAULT_IMAGE;
  } catch {
    return DEFAULT_IMAGE;
  }
}

export interface HealthContext {
  bridgeUrl: string;
  agenticEnvPath: string;
}

/** Shell command for a (component, action), run by the extension in a terminal. */
export function actionCommand(
  id: ComponentHealth["id"],
  action: HealthActionId,
  ctx: HealthContext,
): string | undefined {
  const dir = expandHome(ctx.agenticEnvPath);
  switch (id) {
    case "llama-server":
      return action === "pull" ? undefined : `sudo systemctl ${action} ${LLAMA_UNIT}`;
    case "llama-bridge":
      return action === "pull" ? undefined : `sudo systemctl ${action} ${BRIDGE_UNIT}`;
    case "docker":
      return action === "start" ? "sudo systemctl start docker" : undefined;
    case "agent-server-image":
      return action === "pull" ? `docker pull ${agentServerImage(dir)}` : undefined;
    case "bridge":
      return action === "start" ? `cd ${dir} && uv run openhands-bridge` : undefined;
    default:
      return undefined;
  }
}

export async function checkHealth(ctx: HealthContext): Promise<ComponentHealth[]> {
  const dir = expandHome(ctx.agenticEnvPath);
  const image = agentServerImage(dir);

  const [bridge, llama, bridgeUnit, docker, imageInspect, gpu] = await Promise.all([
    checkBridge(ctx.bridgeUrl),
    checkLlamaServer(),
    checkUnit(BRIDGE_UNIT),
    run("docker", ["version", "--format", "{{.Server.Version}}"]),
    run("docker", ["image", "inspect", image, "--format", "{{.Id}}"]),
    checkGpu(),
  ]);

  const dockerUp = docker.code === 0;

  return [
    bridge,
    llama,
    {
      id: "llama-bridge",
      label: "llama-bridge (proxy)",
      status: bridgeUnit ? "up" : "down",
      detail: bridgeUnit ? "systemd socket active" : `${BRIDGE_UNIT} inactive`,
      actions: bridgeUnit ? ["restart", "stop"] : ["start"],
    },
    {
      id: "docker",
      label: "Docker",
      status: dockerUp ? "up" : "down",
      detail: dockerUp ? `engine ${docker.out}` : "docker not reachable",
      actions: dockerUp ? [] : ["start"],
    },
    {
      id: "agent-server-image",
      label: "agent-server image",
      status: !dockerUp ? "unknown" : imageInspect.code === 0 ? "up" : "down",
      detail: !dockerUp
        ? "Docker down"
        : imageInspect.code === 0
          ? image.split("/").pop() ?? image
          : `${image} not pulled`,
      actions: dockerUp && imageInspect.code !== 0 ? ["pull"] : [],
    },
    gpu,
  ];
}

async function checkBridge(url: string): Promise<ComponentHealth> {
  const m = url.match(/^wss?:\/\/([^/:]+):(\d+)/);
  const host = m?.[1] ?? "127.0.0.1";
  const port = m ? Number(m[2]) : 8300;
  const up = await tcpProbe(host, port);
  return {
    id: "bridge",
    label: "openhands-bridge",
    status: up ? "up" : "down",
    detail: `${host}:${port}${up ? "" : " — not listening"}`,
    actions: up ? [] : ["start"],
  };
}

async function checkLlamaServer(): Promise<ComponentHealth> {
  const active = await checkUnit(LLAMA_UNIT);
  if (!active) {
    return {
      id: "llama-server",
      label: "llama-server",
      status: "down",
      detail: "systemd unit inactive",
      actions: ["start"],
    };
  }
  const ready = await run("curl", [
    "-sf",
    "-o",
    "/dev/null",
    "-m",
    "3",
    "http://127.0.0.1:8000/v1/models",
  ]);
  const ok = ready.code === 0;
  return {
    id: "llama-server",
    label: "llama-server",
    status: ok ? "up" : "degraded",
    detail: ok ? "model loaded, /v1/models 200" : "unit active but model not ready (loading / OOM?)",
    actions: ["restart", "stop"],
  };
}

async function checkUnit(unit: string): Promise<boolean> {
  const r = await run("systemctl", ["is-active", unit]);
  return r.out.startsWith("active");
}

async function checkGpu(): Promise<ComponentHealth> {
  const mem = await run("nvidia-smi", [
    "--query-gpu=memory.used,memory.total",
    "--format=csv,noheader,nounits",
  ]);
  if (mem.code !== 0) {
    return { id: "gpu", label: "GPU", status: "unknown", detail: "nvidia-smi unavailable", actions: [] };
  }
  const apps = await run("nvidia-smi", [
    "--query-compute-apps=process_name",
    "--format=csv,noheader",
  ]);
  const procs = apps.out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const foreign = procs.filter((p) => !p.includes("llama-server"));
  const lines = mem.out.split("\n").map((l) => l.trim()).filter(Boolean);
  const summary = lines
    .map((l, i) => {
      const [used, total] = l.split(",").map((n) => Number(n.trim()));
      return `GPU${i} ${Math.round(used / 1024)}/${Math.round(total / 1024)}GiB`;
    })
    .join(", ");
  return {
    id: "gpu",
    label: "GPU",
    status: foreign.length > 0 ? "degraded" : "up",
    detail:
      foreign.length > 0
        ? `${summary} — contention: ${foreign.join(", ")}`
        : summary,
    actions: [],
  };
}
