import { renderProse } from "./markdownRender";

/**
 * Rendu d'un fragment de prose markdown assaini. **Seul endroit du code** avec
 * `dangerouslySetInnerHTML`, et uniquement sur une sortie passée par DOMPurify
 * (04-CONVENTIONS §2).
 *
 * Pur : mêmes props ⇒ même sortie. La délégation de clic sur `.agx-filelink` est
 * un `onClick` de conteneur (pas un effet, pas d'état).
 */
export function Markdown(props: {
  text: string;
  sandboxRoot: string | null;
  onOpenFile: (path: string, line?: number) => void;
}): JSX.Element {
  const html = renderProse(props.text, props.sandboxRoot);
  return (
    <div
      className="agx-md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const target = (e.target as HTMLElement).closest("a.agx-filelink");
        if (!target) {
          return;
        }
        e.preventDefault();
        const path = target.getAttribute("data-agx-file");
        const lineAttr = target.getAttribute("data-agx-line");
        if (path) {
          props.onOpenFile(path, lineAttr ? Number(lineAttr) : undefined);
        }
      }}
    />
  );
}
