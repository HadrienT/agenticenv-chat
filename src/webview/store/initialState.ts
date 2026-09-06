import type { AppState } from "./types";

/** État initial du store (extrait de types.ts pour tenir < 200 lignes). */
export function initialState(): AppState {
  return {
    connection: { state: "connecting", protocol: null },
    protocol: { version: 2, capabilities: [], degraded: false },
    phase: { kind: "picking" },
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
    usage: null,
    compacted: false,
    todo: null,
    sessionMode: "agent",
    models: null,
    pendingInterrupts: [],
    workingSet: [],
    fileDiffs: {},
    checkpointStrategy: "no checkpoint yet",
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
