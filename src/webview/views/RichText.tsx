import { Markdown } from "../render/Markdown";
import { closeOpenFence } from "../render/markdownRender";
import { splitBlocks } from "../render/blocks";
import { CodeBlock, type CodeActions } from "./CodeBlock";

/**
 * Rendu riche d'un message : prose markdown + blocs de code interactifs
 * (C02 §2–3). Pendant le streaming (`incomplete`), un bloc de code non fermé est
 * fermé virtuellement à l'affichage — on n'attend pas le ``` final (C02 §5).
 */
export function RichText(props: {
  text: string;
  incomplete: boolean;
  sandboxRoot: string | null;
  editorAvailable: boolean;
  codeActions: CodeActions;
  onOpenFile: (path: string, line?: number) => void;
}): JSX.Element {
  const source = props.incomplete ? closeOpenFence(props.text) : props.text;
  const segments = splitBlocks(source);

  return (
    <div className="agx-rich">
      {segments.map((seg, i) =>
        seg.kind === "prose" ? (
          <Markdown
            key={i}
            text={seg.text}
            sandboxRoot={props.sandboxRoot}
            onOpenFile={props.onOpenFile}
          />
        ) : (
          <CodeBlock
            key={i}
            code={seg.code}
            lang={seg.lang}
            path={seg.path}
            title={seg.title}
            open={seg.open}
            editorAvailable={props.editorAvailable}
            actions={props.codeActions}
          />
        ),
      )}
    </div>
  );
}
