import { useCallback, useMemo, useReducer, useRef } from "react";
import { local } from "./store/actions";
import { createActions } from "./store/dispatch";
import { PERSIST_VERSION, fromPersisted, toPersisted } from "./store/persist";
import { reduce } from "./store/reducer";
import {
  budgetStatus,
  canSendMessage,
  canStartSession,
  composerButton,
  composerPlaceholder,
  effectiveAttachments,
  isPickingScreen,
  isStarting,
  isTurnActive,
  pendingConfirmation,
  turnStatusLine,
} from "./store/selectors";
import { initialState } from "./store/types";
import { useHostMessages } from "./store/useHostMessages";
import { usePersist } from "./store/usePersist";
import { useSnapshot } from "./store/useSnapshot";
import { loadPersisted } from "./vscodeApi";
import { Composer } from "./views/composer/Composer";
import { StarterPrompts } from "./views/composer/StarterPrompts";
import { ConfirmCard } from "./views/ConfirmCard";
import { ConnectionBanner } from "./views/ConnectionBanner";
import { ContextGauge } from "./views/ContextGauge";
import { Notices } from "./views/Notices";
import { Thread } from "./views/Thread";
import { ThreadBar } from "./views/ThreadBar";
import type { ThreadServices } from "./views/threadContext";
import { Health } from "./views/panels/Health";
import { McpPicker } from "./views/panels/McpPicker";
import { WorkingSet } from "./views/panels/WorkingSet";

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
          workspaceFolder={state.workspace.folder}
          disabled={!canStartSession(state)}
          starting={isStarting(state)}
          onToggle={actions.toggleMcp}
          onStart={() => actions.startSession(state.mcp.selected)}
        />
      ) : (
        <>
          <ThreadBar
            branchCount={state.branches.length}
            onHistory={actions.openHistory}
            onExport={() => actions.exportConversation("markdown")}
            onRestoreBranch={() => actions.restoreBranch(state.branches.length - 1)}
          />
          <Thread
            items={state.items}
            statusLine={isTurnActive(state) ? turnStatusLine(state) : null}
            idle={state.phase.kind === "idle"}
            services={services}
          />
          {pendingConfirmation(state) && (
            <ConfirmCard
              pending={state.phase.kind === "awaiting" ? state.phase.pending : null}
              onAnswer={(d) =>
                actions.confirm({
                  ...d,
                  actionId: state.phase.kind === "awaiting" ? state.phase.pending?.actionId : undefined,
                })
              }
            />
          )}
          <WorkingSet
            files={state.workingSet}
            fileDiffs={state.fileDiffs}
            strategy={state.checkpointStrategy}
            onRequestDiff={actions.requestFileDiff}
            onOpenFileDiff={actions.openFileDiff}
            onRevertFile={actions.revertFile}
            onRevertHunk={actions.revertHunk}
            onUndoTurn={actions.undoTurn}
            onOpenAll={() => state.workingSet.slice(0, 10).forEach((f) => actions.openFile(f.path))}
          />
          {state.usage && <ContextGauge usage={state.usage} />}
          {state.items.length === 0 && state.phase.kind === "idle" && (
            <StarterPrompts prompts={state.starters} onPick={actions.setDraft} />
          )}
          <Composer
            draft={state.composer.draft}
            chips={effectiveAttachments(state)}
            history={state.composer.history}
            commands={state.commands}
            fileSearch={state.fileSearch}
            budget={budgetStatus(state)}
            button={composerButton(state)}
            placeholder={composerPlaceholder(state)}
            canSend={canSendMessage(state)}
            onDraft={actions.setDraft}
            onSend={() => {
              actions.sendMessage(
                state.composer.draft.trim(),
                effectiveAttachments(state).map((a) => a.chip.ref),
              );
              actions.setDraft("");
            }}
            onStop={actions.cancelTurn}
            onForceNew={actions.forceNewSession}
            onSearchFiles={actions.searchFiles}
            onAddChip={actions.addAttachment}
            onRemoveChip={(index, auto, key) =>
              auto ? actions.dismissAuto(key) : actions.removeAttachment(index)
            }
            onPickContext={() => actions.pickContext("menu")}
            onCommand={(cmd, args) =>
              cmd.name === "components"
                ? actions.togglePanel("health")
                : actions.resolveCommand(cmd.name, args)
            }
          />
        </>
      )}
    </div>
  );
}
