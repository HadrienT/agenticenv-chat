import type { Notice, NoticeAction } from "./notice";

/**
 * Traduit un code d'erreur bridge (03-PROTOCOL §5) en notice **actionnable**
 * (C14 §3, item 109). Fonction pure. Chaque cas propose au moins une action ou
 * dit explicitement qu'il n'y en a pas. Le point de résolution est le panneau
 * Components — on y renvoie plutôt que de dupliquer des boutons partout.
 */
const RETRY: NoticeAction = { label: "Retry", kind: "retry" };
const COMPONENTS: NoticeAction = { label: "Open Components", kind: "openComponents" };

export function errorNotice(code: string, message: string, details?: Record<string, unknown>): Notice {
  const base = { id: `bridge-${code}`, dismissible: true };

  switch (code) {
    case "BRIDGE_UNREACHABLE":
    case "ECONNREFUSED":
      return {
        ...base,
        level: "error",
        text: "The bridge isn't running. Start it from the Components panel, or check the bridge URL in settings.",
        actions: [COMPONENTS, { label: "Open settings", kind: "openSettings" }, RETRY],
      };
    case "SESSION_BUSY":
      return {
        ...base,
        level: "warn",
        text: "Another client owns this session.",
        actions: [{ label: "Force new session", kind: "forceNewSession" }, RETRY],
      };
    case "PROJECT_READONLY": {
      const cmd = typeof details?.command === "string" ? details.command : message;
      return {
        ...base,
        level: "warn",
        text: `The project is read-only in the sandbox. Run:\n${cmd}`,
        dismissible: true,
        actions: [
          { label: "Copy command", kind: "copy", payload: cmd },
          { label: "Run in terminal", kind: "runInTerminal", payload: cmd },
        ],
      };
    }
    case "MODEL_UNAVAILABLE":
      return {
        ...base,
        level: "error",
        text: `The model is unavailable — ${message}`,
        actions: [COMPONENTS, RETRY],
      };
    case "DOCKER_DOWN":
      return {
        ...base,
        level: "error",
        text: "Docker isn't running — the sandbox can't start.",
        actions: [COMPONENTS],
      };
    case "IMAGE_MISSING":
      return {
        ...base,
        level: "error",
        text: `The agent-server image is missing${details?.image ? ` (${String(details.image)})` : ""}.`,
        actions: [COMPONENTS],
      };
    case "GPU_CONTENTION":
      return {
        ...base,
        level: "warn",
        text: `The GPU is busy${details?.processes ? ` — ${String(details.processes)}` : ""}.`,
        actions: [COMPONENTS],
      };
    default:
      return {
        ...base,
        level: "error",
        text: `${code}: ${message}`,
        actions: [RETRY],
      };
  }
}
