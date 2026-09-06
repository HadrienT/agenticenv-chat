import type { KeyboardEvent } from "react";

/**
 * Clavier du composer, extrait de `Composer.tsx` pour tenir la limite de taille.
 * Navigation du menu `#`/`/` (flèches, Enter/Tab valident, Esc ferme), sinon
 * Enter envoie et ↑/↓ parcourent l'historique.
 */
export interface ComposerKeyCtx {
  menuOpen: boolean;
  menuCount: number;
  setMenuIndex: (fn: (i: number) => number) => void;
  fieldEl: HTMLElement | null | undefined;
  draft: string;
  caret: number;
  commit: (text: string, caret: number) => void;
  submit: () => void;
  historyHandle: (key: "ArrowUp" | "ArrowDown") => boolean;
}

export function handleComposerKey(e: KeyboardEvent<HTMLTextAreaElement>, ctx: ComposerKeyCtx): void {
  if (ctx.menuOpen && ctx.menuCount > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      ctx.setMenuIndex((i) => Math.min(i + 1, ctx.menuCount - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      ctx.setMenuIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      ctx.fieldEl
        ?.closest(".agx-composer")
        ?.querySelector<HTMLElement>(".agx-menu__item--active")
        ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      ctx.commit(ctx.draft.slice(0, ctx.caret) + " " + ctx.draft.slice(ctx.caret), ctx.caret + 1);
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    ctx.submit();
    return;
  }
  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && ctx.historyHandle(e.key)) {
    e.preventDefault();
  }
}
