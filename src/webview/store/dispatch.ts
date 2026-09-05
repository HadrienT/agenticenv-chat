import type {
  ComponentId,
  ContextChip,
  ContextRef,
  ContextRefKind,
  HealthActionId,
} from "../../messages";
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
  startSession(mcpServers: string[], mode: string | null): void;
  selectMode(name: string | null): void;
  remember(text: string): void;
  sendMessage(text: string, context: ContextRef[]): void;
  searchFiles(query: string, requestId: string): void;
  pickContext(kind: ContextRefKind | "menu"): void;
  resolveCommand(command: string, args: string): void;
  addAttachment(chip: ContextChip): void;
  removeAttachment(index: number): void;
  dismissAuto(refKey: string): void;
  cancelTurn(): void;
  forceNewSession(): void;
  confirm(opts: {
    accept: boolean;
    actionId?: string;
    remember?: "session" | "workspace";
    editedCommand?: string;
  }): void;
  setDraft(draft: string): void;
  toggleMcp(name: string): void;
  togglePanel(id: PanelId): void;
  dismissNotice(id: string): void;
  openDiff(path: string): void;
  requestFileDiff(path: string): void;
  openFileDiff(path: string): void;
  revertFile(path: string): void;
  revertHunk(path: string, hunkHeader: string): void;
  undoTurn(): void;
  truncateFrom(itemId: string, count: number): void;
  editMessage(itemId: string, text: string): void;
  regenerate(itemId: string, text: string): void;
  restoreBranch(index: number): void;
  openHistory(): void;
  compact(): void;
  exportConversation(format: "markdown" | "json"): void;
  snapshot(payload: {
    items: unknown[];
    branches: unknown[];
    title: string | null;
    cost: number;
    promptTokens: number;
    completionTokens: number;
  }): void;
  openFile(path: string, line?: number): void;
  copy(text: string): void;
  insertAtCursor(text: string): void;
  createFile(suggestedName: string, content: string): void;
  runInTerminal(command: string): void;
  feedback(itemId: string, value: "up" | "down"): void;
  refreshHealth(): void;
  healthAction(component: ComponentId, action: HealthActionId): void;
}

export function createActions(dispatch: (action: Action) => void, now: () => number = Date.now): Actions {
  const send = (a: LocalAction): void => dispatch(local(a));
  return {
    ready: (stateVersion) => post({ type: "ready", stateVersion }),
    startSession: (mcpServers, mode) => {
      post({ type: "startSession", mcpServers, mode: mode ?? undefined });
      send({ type: "intent/startSession" });
    },
    selectMode: (name) => send({ type: "mode/select", name }),
    remember: (text) => post({ type: "remember", text }),
    sendMessage: (text, context) => {
      post({ type: "userMessage", text, context });
      send({ type: "intent/sendMessage", text });
    },
    searchFiles: (query, requestId) => post({ type: "searchFiles", query, requestId }),
    pickContext: (kind) => post({ type: "pickContext", kind }),
    resolveCommand: (command, args) => post({ type: "resolveCommand", command, args }),
    addAttachment: (chip) => send({ type: "composer/addAttachment", chip }),
    removeAttachment: (index) => send({ type: "composer/removeAttachment", index }),
    dismissAuto: (key) => {
      post({ type: "dismissAuto", refKey: key });
      send({ type: "composer/dismissAuto", refKey: key });
    },
    cancelTurn: () => {
      post({ type: "cancelTurn" });
      send({ type: "intent/cancelTurn" });
    },
    forceNewSession: () => post({ type: "forceNewSession" }),
    confirm: (opts) => {
      post({ type: "confirm", ...opts });
      send({ type: "intent/confirm", accept: opts.accept, at: now() });
    },
    setDraft: (draft) => send({ type: "composer/setDraft", draft }),
    toggleMcp: (name) => send({ type: "mcp/toggle", name }),
    togglePanel: (id) => send({ type: "panel/toggle", id }),
    dismissNotice: (id) => send({ type: "notice/dismiss", id }),
    openDiff: (path) => post({ type: "openDiff", path }),
    requestFileDiff: (path) => post({ type: "requestFileDiff", path }),
    openFileDiff: (path) => post({ type: "openFileDiff", path }),
    revertFile: (path) => post({ type: "revertFile", path }),
    revertHunk: (path, hunkHeader) => post({ type: "revertHunk", path, hunkHeader }),
    undoTurn: () => post({ type: "undoTurn" }),
    truncateFrom: (itemId, count) => {
      post({ type: "truncateFrom", itemId, count });
      send({ type: "thread/truncateFrom", itemId, at: now() });
    },
    editMessage: (itemId, text) => {
      post({ type: "editMessage", itemId, text });
      send({ type: "thread/editMessage", itemId, text, at: now() });
    },
    regenerate: (itemId, text) => {
      post({ type: "regenerate", itemId, text });
      send({ type: "thread/editMessage", itemId, text, at: now() });
    },
    restoreBranch: (index) => send({ type: "thread/restoreBranch", index }),
    openHistory: () => post({ type: "openHistory" }),
    compact: () => post({ type: "compact" }),
    exportConversation: (format) => post({ type: "exportConversation", format }),
    snapshot: (payload) => post({ type: "persistSnapshot", ...payload }),
    openFile: (path, line) => post({ type: "openFile", path, line }),
    copy: (text) => post({ type: "copy", text }),
    insertAtCursor: (text) => post({ type: "insertAtCursor", text }),
    createFile: (suggestedName, content) => post({ type: "createFile", suggestedName, content }),
    runInTerminal: (command) => post({ type: "runInTerminal", command }),
    feedback: (itemId, value) => post({ type: "feedback", itemId, value }),
    refreshHealth: () => post({ type: "refreshHealth" }),
    healthAction: (component, action) => post({ type: "healthAction", component, action }),
  };
}
