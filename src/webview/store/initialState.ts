import type { AppState, UsageState } from "./types";

/** Usage neutre — base de fusion partout où un message met à jour un sous-ensemble des compteurs. */
export function emptyUsage(): UsageState {
  return {
    accumulatedCost: 0,
    promptTokens: 0,
    accumulatedPromptTokens: 0,
    completionTokens: 0,
    contextWindow: 0,
    tokensPerSec: null,
  };
}

/** État initial du store (extrait de types.ts pour tenir < 200 lignes). */
export function initialState(): AppState {
  return {
    connection: { state: "connecting", protocol: null },
    protocol: { version: 2, capabilities: [], degraded: false },
    phase: { kind: "picking" },
    startup: null,
    session: null,
    items: [],
    itemIndex: {},
    eventSeq: 0,
    pendingSend: false,
    progress: null,
    workspace: {
      folder: null,
      path: null,
      // Vide jusqu'au message `workspace` de l'hôte : sans racine connue, aucune
      // référence de fichier n'est rendue cliquable.
      sandboxRoot: "",
      editorAvailable: false,
      expandThinking: false,
    },
    mcp: { servers: [], selected: [] },
    modes: [],
    selectedMode: null,
    instructions: { applied: [], ignored: [], truncated: false },
    health: [],
    llm: { profiles: [], switching: null },
    usage: null,
    compacted: false,
    todo: null,
    sessionMode: "agent",
    models: null,
    pendingInterrupts: [],
    workingSet: [],
    fileDiffs: {},
    checkpointStrategy: "no checkpoint yet",
    editsViaBridge: false,
    permissions: { mode: "ask", trusted: true },
    notices: [],
    composer: { draft: "", attachments: [], history: [] },
    autoContext: [],
    dismissedAuto: [],
    contextChips: [],
    fileSearch: null,
    commands: [],
    starters: [],
    branches: [],
    panels: { health: false, workingSet: true, todo: true },
  };
}
