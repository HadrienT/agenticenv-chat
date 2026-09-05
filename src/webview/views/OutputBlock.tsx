import { useState } from "react";
import { escapeHtml } from "../render/highlight";
import { fileRefsToHtml } from "../render/fileLinks";
import { truncateOutput } from "../render/truncate";
import { useThreadServices } from "./threadContext";

/**
 * Sortie d'outil : `<pre>` monospace, tronqué au-delà de 200 lignes / 20 Kio
 * (C02 §8), avec liens de fichiers cliquables dans le texte (items 27, 44).
 */
export function OutputBlock(props: { text: string }): JSX.Element {
  const svc = useThreadServices();
  const [expanded, setExpanded] = useState(false);
  const t = truncateOutput(props.text);

  const body = !t.truncated || expanded ? props.text : `${t.head}\n… ${t.hiddenLines} lines hidden …\n${t.tail}`;

  return (
    <div className="agx-output">
      <pre
        className="agx-output__pre"
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest("a.agx-filelink");
          if (!a) {
            return;
          }
          e.preventDefault();
          const path = a.getAttribute("data-agx-file");
          const line = a.getAttribute("data-agx-line");
          if (path) {
            svc.onOpenFile(path, line ? Number(line) : undefined);
          }
        }}
        dangerouslySetInnerHTML={{ __html: fileRefsToHtml(body, svc.sandboxRoot, escapeHtml) }}
      />
      {t.truncated && !expanded && !t.preferEditor && (
        <button className="agx-code__btn" onClick={() => setExpanded(true)}>
          Show all ({t.hiddenLines} more lines)
        </button>
      )}
      {t.truncated && t.preferEditor && (
        <button className="agx-code__btn" onClick={() => svc.codeActions.createFile("output.log", props.text)}>
          Open in editor ({t.hiddenLines} more lines)
        </button>
      )}
    </div>
  );
}
