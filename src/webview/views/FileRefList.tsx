import { detectFileRefs } from "../render/fileLinks";

/**
 * Liste de références de fichiers (`path:line`) cliquables — sortie de grep/glob
 * (C05 §2, items 27/44). Chaque ligne non vide devient une entrée ; si elle
 * contient une réf reconnue, elle est cliquable.
 */
export function FileRefList(props: {
  text: string;
  sandboxRoot: string | null;
  onOpenFile: (path: string, line?: number) => void;
}): JSX.Element {
  const lines = props.text.split("\n").filter((l) => l.trim());
  return (
    <ul className="agx-reflist">
      {lines.slice(0, 200).map((line, i) => {
        const ref = props.sandboxRoot ? detectFileRefs(line, props.sandboxRoot)[0] : undefined;
        return (
          <li key={i}>
            {ref ? (
              <button
                className="agx-filelink"
                onClick={() => props.onOpenFile(ref.path, ref.line)}
              >
                {line}
              </button>
            ) : (
              <span>{line}</span>
            )}
          </li>
        );
      })}
      {lines.length > 200 && <li className="agx-reflist__more">… {lines.length - 200} more</li>}
    </ul>
  );
}
