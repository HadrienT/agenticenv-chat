import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { isHostToWebview } from "../messages";
import { host, local } from "./store/actions";
import { createActions } from "./store/dispatch";
import { PERSIST_VERSION, fromPersisted, toPersisted } from "./store/persist";
import { reduce } from "./store/reducer";
import {
  canSendMessage,
  canStartSession,
  composerButton,
  isPickingScreen,
  isStarting,
  isTurnActive,
  pendingConfirmation,
  turnStatusLine,
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
import type { EventDelta } from "../protocol";

/**
 * `App` fait de la **composition seulement** : elle lit le store et place les
 * vues (01-ARCHITECTURE §2). La seule logique ici est le **bord impur** —
 * écoute `postMessage`, coalescing des deltas sur `requestAnimationFrame`
 * (04-CONVENTIONS §6), persistance.
 */
export function App(): JSX.Element {
  const boot = useRef<{ stale: boolean } | null>(null);
  const [state, dispatch] = useReducer(reduce, undefined, () => {
    const res = fromPersisted(loadPersisted());
    boot.current = { stale: !res.ok && res.reason === "unknown-version" };
    return res.ok ? res.state : initialState();
  });

  const actions = useMemo(() => createActions(dispatch), []);

  // --- coalescing des event_delta -----------------------------------------
  const deltaBuf = useRef(new Map<string, EventDelta>());
  const rafId = useRef(0);
  const flushDeltas = useCallback(() => {
    rafId.current = 0;
    const buffered = [...deltaBuf.current.values()];
    deltaBuf.current.clear();
    for (const d of buffered) {
      dispatch(host({ type: "bridge", message: d }));
    }
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent): void => {
      if (!isHostToWebview(e.data)) {
        return;
      }
      const msg = e.data;
      if (msg.type === "bridge" && msg.message.type === "event_delta") {
        const d = msg.message;
        const prev = deltaBuf.current.get(d.event_id);
        deltaBuf.current.set(
          d.event_id,
          prev ? { ...d, text: prev.text + d.text } : d,
        );
        if (!rafId.current) {
          rafId.current = requestAnimationFrame(flushDeltas);
        }
        return;
      }
      dispatch(host(msg));
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
    return () => {
      window.removeEventListener("message", handler);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [actions, flushDeltas]);

  useEffect(() => {
    savePersisted(toPersisted(state));
  }, [state]);

  return (
    <div className="agx-app">
      <ConnectionBanner
        connection={state.connection}
        protocol={state.protocol}
        llmSource={state.session?.llmSource}
      />
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
          <Thread
            items={state.items}
            statusLine={isTurnActive(state) ? turnStatusLine(state) : null}
          />
          {pendingConfirmation(state) && <ConfirmCard onAnswer={actions.confirm} />}
          <WorkingSet files={state.workingSet} onOpen={actions.openDiff} />
          {state.usage && <ContextGauge usage={state.usage} />}
          <Composer
            draft={state.composer.draft}
            button={composerButton(state)}
            canSend={canSendMessage(state)}
            connected={state.connection.state === "open"}
            onDraft={actions.setDraft}
            onSend={() => {
              actions.sendMessage(state.composer.draft.trim());
              actions.setDraft("");
            }}
            onStop={actions.cancelTurn}
            onForceNew={actions.forceNewSession}
          />
        </>
      )}
    </div>
  );
}
