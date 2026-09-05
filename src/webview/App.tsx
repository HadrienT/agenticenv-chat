import { useEffect, useMemo, useReducer, useRef } from "react";
import { isHostToWebview } from "../messages";
import { host, local } from "./store/actions";
import { createActions } from "./store/dispatch";
import { PERSIST_VERSION, fromPersisted, toPersisted } from "./store/persist";
import { reduce } from "./store/reducer";
import {
  canSendMessage,
  canStartSession,
  isPickingScreen,
  isStarting,
  isTurnActive,
  pendingConfirmation,
} from "./store/selectors";
import { initialState } from "./store/types";
import { loadPersisted, savePersisted } from "./vscodeApi";
import { Composer } from "./views/Composer";
import { ConfirmCard } from "./views/ConfirmCard";
import { ConnectionBanner } from "./views/ConnectionBanner";
import { Notices } from "./views/Notices";
import { Thread } from "./views/Thread";
import { ContextGauge } from "./views/ContextGauge";
import { Health } from "./views/panels/Health";
import { McpPicker } from "./views/panels/McpPicker";
import { WorkingSet } from "./views/panels/WorkingSet";

/**
 * `App` fait de la **composition seulement** : elle lit le store et place les
 * vues (01-ARCHITECTURE §2). Toute la logique métier vit dans `store/`.
 */
export function App(): JSX.Element {
  const boot = useRef<{ stale: boolean } | null>(null);
  const [state, dispatch] = useReducer(reduce, undefined, () => {
    const res = fromPersisted(loadPersisted());
    boot.current = { stale: !res.ok && res.reason === "unknown-version" };
    return res.ok ? res.state : initialState();
  });

  const actions = useMemo(() => createActions(dispatch), []);

  useEffect(() => {
    const handler = (e: MessageEvent): void => {
      if (isHostToWebview(e.data)) {
        dispatch(host(e.data));
      }
    };
    window.addEventListener("message", handler);
    actions.ready(PERSIST_VERSION);
    if (boot.current?.stale) {
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
    return () => window.removeEventListener("message", handler);
  }, [actions]);

  useEffect(() => {
    savePersisted(toPersisted(state));
  }, [state]);

  return (
    <div className="agx-app">
      <ConnectionBanner connection={state.connection} llmSource={state.session?.llmSource} />
      <Health
        components={state.health}
        onRefresh={actions.refreshHealth}
        onAction={actions.healthAction}
      />
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
          <Thread items={state.items} working={isTurnActive(state)} />
          {pendingConfirmation(state) && <ConfirmCard onAnswer={actions.confirm} />}
          <WorkingSet files={state.workingSet} onOpen={actions.openDiff} />
          {state.usage && <ContextGauge usage={state.usage} />}
          <Composer
            draft={state.composer.draft}
            canSend={canSendMessage(state)}
            placeholder={
              state.connection.state === "open" ? "Message the agent…" : "Not connected"
            }
            onDraft={actions.setDraft}
            onSend={() => {
              actions.sendMessage(state.composer.draft.trim());
              actions.setDraft("");
            }}
          />
        </>
      )}
    </div>
  );
}
