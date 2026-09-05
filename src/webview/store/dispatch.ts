import type { ComponentId, HealthActionId } from "../../messages";
import { post } from "../vscodeApi";
import type { Action, LocalAction } from "./actions";
import { local } from "./actions";
import type { PanelId } from "./types";

/**
 * Seul module du store qui appelle `post()` (01-ARCHITECTURE §2). Il traduit une
 * intention utilisateur en deux effets : le message sortant vers l'hôte **et** la
 * mise à jour optimiste du store (item 112, limitée à `pendingSend` depuis C01).
 */
export interface Actions {
  ready(stateVersion: number): void;
  startSession(mcpServers: string[]): void;
  sendMessage(text: string): void;
  cancelTurn(): void;
  forceNewSession(): void;
  confirm(accept: boolean): void;
  setDraft(draft: string): void;
  toggleMcp(name: string): void;
  togglePanel(id: PanelId): void;
  dismissNotice(id: string): void;
  openDiff(path: string): void;
  refreshHealth(): void;
  healthAction(component: ComponentId, action: HealthActionId): void;
}

export function createActions(dispatch: (action: Action) => void, now: () => number = Date.now): Actions {
  const send = (a: LocalAction): void => dispatch(local(a));
  return {
    ready: (stateVersion) => post({ type: "ready", stateVersion }),
    startSession: (mcpServers) => {
      post({ type: "startSession", mcpServers });
      send({ type: "intent/startSession" });
    },
    sendMessage: (text) => {
      post({ type: "userMessage", text });
      send({ type: "intent/sendMessage" });
    },
    cancelTurn: () => {
      post({ type: "cancelTurn" });
      send({ type: "intent/cancelTurn" });
    },
    forceNewSession: () => post({ type: "forceNewSession" }),
    confirm: (accept) => {
      post({ type: "confirm", accept });
      send({ type: "intent/confirm", accept, at: now() });
    },
    setDraft: (draft) => send({ type: "composer/setDraft", draft }),
    toggleMcp: (name) => send({ type: "mcp/toggle", name }),
    togglePanel: (id) => send({ type: "panel/toggle", id }),
    dismissNotice: (id) => send({ type: "notice/dismiss", id }),
    openDiff: (path) => post({ type: "openDiff", path }),
    refreshHealth: () => post({ type: "refreshHealth" }),
    healthAction: (component, action) => post({ type: "healthAction", component, action }),
  };
}
