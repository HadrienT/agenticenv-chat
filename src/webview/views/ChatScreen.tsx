import type { Actions } from "../store/dispatch";
import {
  budgetStatus,
  canSendMessage,
  composerButton,
  composerPlaceholder,
  effectiveAttachments,
  isTurnActive,
  pendingConfirmation,
  turnStatusLine,
} from "../store/selectors";
import type { AppState } from "../store/types";
import { routeLocalCommand } from "./composer/commandRoute";
import { Composer } from "./composer/Composer";
import { StarterPrompts } from "./composer/StarterPrompts";
import { ConfirmCard } from "./ConfirmCard";
import { ContextGauge } from "./ContextGauge";
import { ModelPicker } from "./ModelPicker";
import { PlanApproval } from "./PlanApproval";
import { Thread } from "./Thread";
import { ThreadBar } from "./ThreadBar";
import type { ThreadServices } from "./threadContext";
import { TodoPanel } from "./panels/TodoPanel";
import { WorkingSet } from "./panels/WorkingSet";

/**
 * Écran de conversation (tout sauf l'écran de sélection MCP). Extrait de `App`
 * pour garder chaque fichier de vue sous la limite de taille.
 */
export function ChatScreen(props: {
  state: AppState;
  actions: Actions;
  services: ThreadServices;
}): JSX.Element {
  const { state, actions, services } = props;
  const interruptCapable = state.protocol.capabilities.includes("interrupt");
  const turnActive = isTurnActive(state);
  const modeNote =
    state.sessionMode === "ask"
      ? "Ask mode — the agent reads and answers; writing and running are blocked."
      : state.sessionMode === "plan"
        ? "Plan mode — the agent explores and proposes; writing and running are blocked."
        : null;

  const jumpToActiveTodo = (): void => {
    document
      .querySelector<HTMLElement>(".agx-todo__item--active")
      ?.scrollIntoView({ block: "center" });
  };

  return (
    <>
      <ThreadBar
        branchCount={state.branches.length}
        onHistory={actions.openHistory}
        onExport={() => actions.exportConversation("markdown")}
        onRestoreBranch={() => actions.restoreBranch(state.branches.length - 1)}
      />
      <TodoPanel
        items={state.todo}
        open={state.panels.todo}
        onToggle={() => actions.togglePanel("todo")}
        onJumpToActive={jumpToActiveTodo}
      />
      {modeNote && <div className="agx-planbanner">{modeNote}</div>}
      <Thread
        items={state.items}
        statusLine={turnActive ? turnStatusLine(state) : null}
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
      <PlanApproval state={state} actions={actions} />
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
      {state.usage && (
        <ContextGauge
          usage={state.usage}
          attachedBytes={budgetStatus(state).bytes}
          canCompact={state.protocol.capabilities.includes("compact")}
          compacted={state.compacted}
          onCompact={actions.compact}
          onNewSession={actions.forceNewSession}
        />
      )}
      {state.items.length === 0 && state.phase.kind === "idle" && (
        <StarterPrompts prompts={state.starters} onPick={actions.setDraft} />
      )}
      <ModelPicker
        models={state.models}
        disabled={turnActive}
        onSelect={actions.setModel}
      />
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
        turnActive={turnActive}
        sessionMode={state.sessionMode}
        modeSelectorAvailable={state.phase.kind === "idle" || state.phase.kind === "picking"}
        onDraft={actions.setDraft}
        onSend={() => {
          actions.sendMessage(
            state.composer.draft.trim(),
            effectiveAttachments(state).map((a) => a.chip.ref),
          );
          actions.setDraft("");
        }}
        onInterrupt={(text) => actions.interrupt(text, interruptCapable)}
        onStop={actions.cancelTurn}
        onForceNew={actions.forceNewSession}
        onSetMode={actions.setSessionMode}
        onSearchFiles={actions.searchFiles}
        onAddChip={actions.addAttachment}
        onRemoveChip={(index, auto, key) =>
          auto ? actions.dismissAuto(key) : actions.removeAttachment(index)
        }
        onPickContext={() => actions.pickContext("menu")}
        onCommand={(cmd, args) => routeLocalCommand(actions, cmd, args)}
      />
    </>
  );
}
