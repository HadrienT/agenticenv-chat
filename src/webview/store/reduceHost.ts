import { assertNever } from "../../assertNever";
import type { HostToWebview } from "../../messages";
import { applyBridge, endTurnOnError } from "./reduceBridge";
import { hash, resetState, withNotice } from "./reduceHelpers";
import { applyPermission } from "./reducePermission";
import type { AppState } from "./types";

/** Routeur exhaustif des messages hôte → webview (`assertNever` en garde). */
export function applyHost(state: AppState, msg: HostToWebview, at: number): AppState {
  switch (msg.type) {
    case "connection": {
      const connection = {
        state: msg.state,
        protocol: msg.protocol ?? state.connection.protocol,
        detail: msg.detail,
      };
      const notices =
        msg.state === "open" ? state.notices.filter((n) => n.id !== "connection") : state.notices;
      return { ...state, connection, notices };
    }

    case "protocol": {
      const degraded = msg.degraded || msg.version < 2;
      const notices = degraded
        ? [
            ...state.notices.filter((n) => n.id !== "protocol-v1"),
            {
              id: "protocol-v1",
              level: "warn" as const,
              text: `Bridge protocol v${msg.version} — Stop and diffs are unavailable.`,
              dismissible: true,
            },
          ]
        : state.notices.filter((n) => n.id !== "protocol-v1");
      return {
        ...state,
        protocol: { version: msg.version, capabilities: msg.capabilities, degraded },
        notices,
      };
    }

    case "bridge":
      return applyBridge(state, msg.message, at);

    case "mcpServers": {
      const names = new Set(msg.servers.map((s) => s.name));
      return {
        ...state,
        mcp: { servers: msg.servers, selected: state.mcp.selected.filter((n) => names.has(n)) },
      };
    }

    case "health":
      return { ...state, health: msg.components };

    case "fileResults":
      return { ...state, fileSearch: { requestId: msg.requestId, results: msg.results } };

    case "contextChips":
      return { ...state, contextChips: msg.chips };

    case "attachContext": {
      const dup = state.composer.attachments.some(
        (a) => JSON.stringify(a.ref) === JSON.stringify(msg.chip.ref),
      );
      return dup
        ? state
        : {
            ...state,
            composer: { ...state.composer, attachments: [...state.composer.attachments, msg.chip] },
          };
    }

    case "autoContext":
      return { ...state, autoContext: msg.chips };

    case "commands":
      return { ...state, commands: msg.commands };

    case "starters":
      return { ...state, starters: msg.prompts };

    case "commandResult": {
      const withDraft =
        msg.prefill !== undefined
          ? { ...state, composer: { ...state.composer, draft: msg.prefill } }
          : state;
      return msg.note
        ? withNotice(withDraft, {
            id: `cmd-${msg.command}`,
            level: "info",
            text: msg.note,
            dismissible: true,
          })
        : withDraft;
    }

    case "hostError":
      return withNotice(endTurnOnError(state, true), {
        id: `host-${hash(msg.text)}`,
        level: "error",
        text: msg.text,
        dismissible: true,
      });

    case "clearThread":
      return { ...state, items: [], itemIndex: {}, eventSeq: 0, workingSet: [], progress: null };

    case "workingSet":
      return {
        ...state,
        workingSet: msg.files,
        checkpointStrategy: msg.strategy,
        // purge les diffs des fichiers qui ne sont plus dans le set
        fileDiffs: Object.fromEntries(
          Object.entries(state.fileDiffs).filter(([p]) => msg.files.some((f) => f.path === p)),
        ),
      };

    case "fileDiff":
      return {
        ...state,
        fileDiffs: {
          ...state.fileDiffs,
          [msg.path]: { unified: msg.unified, conflict: msg.conflict, error: msg.error },
        },
      };

    case "pendingAction":
    case "permissionMode":
    case "permissionOutcome":
      return applyPermission(state, msg, at);

    case "workspace":
      return {
        ...state,
        workspace: {
          folder: msg.folder,
          path: msg.path,
          sandboxRoot: msg.sandboxRoot,
          editorAvailable: msg.editorAvailable,
          expandThinking: msg.expandThinking,
        },
      };

    case "reset":
      return resetState(state);

    default:
      return assertNever(msg, "HostToWebview");
  }
}
