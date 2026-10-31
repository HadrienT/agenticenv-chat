import type { LlmProfileView } from "../../messages";
import type { Notice, NoticeAction } from "./notice";

/**
 * Traduit un code d'erreur bridge (03-PROTOCOL §5) en notice **actionnable**
 * (C14 §3, item 109). Fonction pure. Chaque cas propose au moins une action ou
 * dit explicitement qu'il n'y en a pas. Le point de résolution est le panneau
 * Components — on y renvoie plutôt que de dupliquer des boutons partout.
 */
const RETRY: NoticeAction = { label: "Retry", kind: "retry" };
const COMPONENTS: NoticeAction = { label: "Open Components", kind: "openComponents" };

export function errorNotice(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  profiles: LlmProfileView[] = [],
): Notice {
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
        text: "Another client owns this session. If it stays stuck, the bridge process needs a restart (a session teardown blocked — AgenticEnv#7).",
        actions: [{ label: "Force new session", kind: "forceNewSession" }, COMPONENTS, RETRY],
      };
    // WP08d : états attendus, pas des erreurs — message clair, aucune action.
    case "NO_WORKING_COPY":
      return {
        ...base,
        level: "info",
        text: "This session has no project working copy — diffs and checkpoints aren't available (start a session with a folder open).",
      };
    case "READ_ONLY_SESSION":
      return {
        ...base,
        level: "info",
        text: "This session is read-only (Ask / Plan mode) — switch to Agent mode to write the agent's changes to your repo.",
      };
    case "TURN_IN_PROGRESS":
      return { ...base, level: "info", text: "The agent is still working — wait for this turn to finish, or stop it." };
    case "APPLY_FAILED":
      return {
        ...base,
        level: "error",
        text: `The agent's edits could not be written to your repo. They stay in the sandbox and are retried after the next turn — ${message}`,
      };
    case "TURN_FAILED":
    case "SESSION_START_FAILED":
    case "INTERNAL_ERROR":
      return { ...base, level: "error", text: message || code, actions: [COMPONENTS, RETRY] };
    case "NO_SESSION":
    case "ALREADY_STARTED":
      return { ...base, level: "warn", text: message || code, dismissible: true };
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
    case "DEPENDENCY_ERROR": {
      // `llama-server` sert un autre profil que celui attendu par l'agent
      // (AgenticEnv#16) : bascule en un clic plutôt que l'erreur brute.
      const target = profiles.find((p) => p.servedName === details?.expected);
      if (!target) {
        return generic(base, code, message);
      }
      const served = Array.isArray(details?.served) ? details.served.join(", ") : "";
      return {
        ...base,
        level: "warn",
        text: `llama-server is serving ${served || "another model"}, but the agent needs ${target.servedName}. Switching restarts llama-server (10–30 s) for every client.`,
        actions: [
          { label: `Switch to "${target.name}" profile`, kind: "switchLlmProfile", payload: target.name },
          COMPONENTS,
        ],
      };
    }
    default:
      return generic(base, code, message);
  }
}

function generic(base: { id: string; dismissible: boolean }, code: string, message: string): Notice {
  return { ...base, level: "error", text: `${code}: ${message}`, actions: [RETRY] };
}
