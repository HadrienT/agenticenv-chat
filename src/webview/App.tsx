import { useCallback, useMemo, useReducer, useRef } from "react";
import { local } from "./store/actions";
import { createActions } from "./store/dispatch";
import { PERSIST_VERSION, fromPersisted, toPersisted } from "./store/persist";
import { reduce } from "./store/reducer";
import { canStartSession, isPickingScreen, isStarting } from "./store/selectors";
import { initialState } from "./store/types";
import { useHostMessages } from "./store/useHostMessages";
import { usePersist } from "./store/usePersist";
import { useSnapshot } from "./store/useSnapshot";
import { loadPersisted } from "./vscodeApi";
import { ChatScreen } from "./views/ChatScreen";
import { ConnectionBanner } from "./views/ConnectionBanner";
import { Notices } from "./views/Notices";
import type { ThreadServices } from "./views/threadContext";
import { Health } from "./views/panels/Health";
import { McpPicker } from "./views/panels/McpPicker";

/**
 * `App` fait de la **composition seulement** : elle lit le store et place les
 * vues (01-ARCHITECTURE §2). Les effets de bord (postMessage, persistance) sont
 * dans des hooks dédiés.
 */
export function App(): JSX.Element {
  const stale = useRef(false);
  const [state, dispatch] = useReducer(reduce, undefined, () => {
    const res = fromPersisted(loadPersisted());
    stale.current = !res.ok && res.reason === "unknown-version";
    return res.ok ? res.state : initialState();
  });

  const actions = useMemo(() => createActions(dispatch), []);

  const onReady = useCallback(() => {
    actions.ready(PERSIST_VERSION);
    if (stale.current) {
      dispatch(
        local({
          type: "notice/push",
          notice: {
            id: "persist-stale",
            level: "info",
            text: "Stored conversation state was from an older version and has been cleared.",
            dismissible: true,
          },
        }),
      );
    }
  }, [actions]);

  useHostMessages(dispatch, onReady);
  usePersist(() => toPersisted(state), [state]);
  useSnapshot(state, actions.snapshot);

  const canEditThread =
    state.phase.kind === "idle" || state.phase.kind === "picking" || state.phase.kind === "starting";
  const services = useMemo<ThreadServices>(
    () => ({
      sandboxRoot: state.workspace.sandboxRoot,
      editorAvailable: state.workspace.editorAvailable,
      expandThinking: state.workspace.expandThinking,
      canEditThread,
      codeActions: {
        copy: actions.copy,
        insert: actions.insertAtCursor,
        createFile: actions.createFile,
        runInTerminal: actions.runInTerminal,
      },
      onOpenFile: actions.openFile,
      onFeedback: actions.feedback,
      onEditMessage: actions.editMessage,
      onRegenerate: actions.regenerate,
      onTruncate: actions.truncateFrom,
      onContinueAfterCap: actions.continueTurn,
      onStopAfterCap: actions.resolveMaxIterations,
    }),
    [actions, state.workspace, canEditThread],
  );

  return (
    <div className="agx-app">
      <ConnectionBanner
        connection={state.connection}
        protocol={state.protocol}
        llmSource={state.session?.llmSource}
      />
      <Health components={state.health} onRefresh={actions.refreshHealth} onAction={actions.healthAction} />
      <Notices notices={state.notices} onDismiss={actions.dismissNotice} />
      {isPickingScreen(state) ? (
        <McpPicker
          servers={state.mcp.servers}
          selected={state.mcp.selected}
          modes={state.modes}
          selectedMode={state.selectedMode}
          workspaceFolder={state.workspace.folder}
          disabled={!canStartSession(state)}
          starting={isStarting(state)}
          onToggle={actions.toggleMcp}
          onSelectMode={actions.selectMode}
          onStart={() => actions.startSession(state.mcp.selected, state.selectedMode)}
        />
      ) : (
        <ChatScreen state={state} actions={actions} services={services} />
      )}
    </div>
  );
}
