import { useEffect, useRef } from "react";
import { isHostToWebview } from "../../messages";
import type { EventDelta } from "../../protocol";
import { host } from "./actions";
import type { Action } from "./actions";

/**
 * Bord impur : écoute `postMessage`, **coalesce** les `event_delta` sur un
 * `requestAnimationFrame` (04-CONVENTIONS §6 : au plus un rendu par frame), et
 * les rejoue dans le **même** réducteur que le direct. `onReady` est appelé une
 * fois le listener en place.
 */
export function useHostMessages(dispatch: (a: Action) => void, onReady: () => void): void {
  const buf = useRef(new Map<string, EventDelta>());
  const raf = useRef(0);

  useEffect(() => {
    const flush = (): void => {
      raf.current = 0;
      const pending = [...buf.current.values()];
      buf.current.clear();
      for (const d of pending) {
        dispatch(host({ type: "bridge", message: d }));
      }
    };

    const handler = (e: MessageEvent): void => {
      if (!isHostToWebview(e.data)) {
        return;
      }
      const msg = e.data;
      if (msg.type === "bridge" && msg.message.type === "event_delta") {
        const d = msg.message;
        const prev = buf.current.get(d.event_id);
        buf.current.set(d.event_id, prev ? { ...d, text: prev.text + d.text } : d);
        if (!raf.current) {
          raf.current = requestAnimationFrame(flush);
        }
        return;
      }
      dispatch(host(msg));
    };

    window.addEventListener("message", handler);
    onReady();
    return () => {
      window.removeEventListener("message", handler);
      if (raf.current) {
        cancelAnimationFrame(raf.current);
      }
    };
  }, [dispatch, onReady]);
}
