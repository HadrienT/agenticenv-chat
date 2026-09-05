import type { HostToWebview } from "../../messages";
import { appendItems } from "./reduceHelpers";
import type { AppState } from "./types";

/** Sous-routeur des messages de permission (C07), extrait de `reduceHost`. */
export function applyPermission(
  state: AppState,
  msg: Extract<HostToWebview, { type: "pendingAction" | "permissionMode" | "permissionOutcome" }>,
  at: number,
): AppState {
  switch (msg.type) {
    case "pendingAction": {
      const p = state.phase;
      if (msg.action) {
        if (p.kind === "running") {
          return {
            ...state,
            phase: {
              kind: "awaiting",
              conversationId: p.conversationId,
              turnId: p.turnId,
              pending: msg.action,
            },
          };
        }
        if (p.kind === "awaiting") {
          return { ...state, phase: { ...p, pending: msg.action } };
        }
        return state;
      }
      return p.kind === "awaiting"
        ? {
            ...state,
            phase: { kind: "running", conversationId: p.conversationId, turnId: p.turnId, startedAt: at },
          }
        : state;
    }

    case "permissionMode": {
      const notices =
        msg.mode === "autoAll"
          ? [
              ...state.notices.filter((n) => n.id !== "perm-yolo"),
              {
                id: "perm-yolo",
                level: "warn" as const,
                text: "Auto-approve ALL mode: every action runs without asking (denylist still applies).",
                dismissible: false,
              },
            ]
          : state.notices.filter((n) => n.id !== "perm-yolo");
      return { ...state, permissions: { mode: msg.mode, trusted: msg.trusted }, notices };
    }

    case "permissionOutcome": {
      // C07 §2 : « une autorisation invisible n'est pas une autorisation ».
      const next = appendItems(state, [
        {
          kind: "permission",
          id: `perm-${state.eventSeq}`,
          verdict: msg.verdict,
          rule: msg.rule,
          summary: msg.summary,
          ts: at,
        },
      ]);
      return { ...next, eventSeq: state.eventSeq + 1 };
    }
  }
}
