import { useState } from "react";
import { highlightCode, resolveLanguage } from "../render/highlight";

export interface CodeActions {
  copy: (text: string) => void;
  insert: (text: string) => void;
  createFile: (name: string, content: string) => void;
  runInTerminal: (command: string) => void;
}

const RUN_LANGS = new Set(["bash", "sh", "shell", "zsh"]);

/**
 * Bloc de code : coloration + barre d'outils (C02 §3). La barre apparaît au
 * survol **et** au focus clavier. « Run » n'exécute jamais directement — il passe
 * par la politique de permissions (C07) ; ici il déclenche seulement l'intention.
 *
 * En `views/` (pas `render/`) : `useState` pour le feedback « Copied! » est de
 * l'éphémère non observable, admis par 04-CONVENTIONS §2.
 */
export function CodeBlock(props: {
  code: string;
  lang: string;
  path?: string;
  title?: string;
  open: boolean;
  editorAvailable: boolean;
  actions: CodeActions;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const resolved = resolveLanguage(props.lang);
  const html = highlightCode(props.code, props.lang);

  const onCopy = (): void => {
    props.actions.copy(props.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const label = props.title ?? props.path ?? resolved ?? props.lang ?? "text";

  return (
    <figure className="agx-code">
      <figcaption className="agx-code__bar">
        <span className="agx-code__lang">{label}</span>
        <span className="agx-code__actions">
          <button className="agx-code__btn" onClick={onCopy}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            className="agx-code__btn"
            disabled={!props.editorAvailable}
            title={props.editorAvailable ? undefined : "No active editor"}
            onClick={() => props.actions.insert(props.code)}
          >
            Insert
          </button>
          <button
            className="agx-code__btn"
            onClick={() => props.actions.createFile(suggestName(props.path, resolved), props.code)}
          >
            New file
          </button>
          {RUN_LANGS.has(props.lang) && (
            <button
              className="agx-code__btn"
              title="Runs through the permission policy"
              onClick={() => props.actions.runInTerminal(props.code.trim())}
            >
              Run
            </button>
          )}
        </span>
      </figcaption>
      <pre className="agx-code__pre">
        <code
          className={resolved ? `hljs language-${resolved}` : "hljs"}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
      {props.open && <div className="agx-code__streaming">writing…</div>}
    </figure>
  );
}

function suggestName(path: string | undefined, lang: string | null): string {
  if (path) {
    return path.split("/").pop() ?? "snippet.txt";
  }
  const ext: Record<string, string> = {
    cpp: "cpp",
    c: "c",
    python: "py",
    typescript: "ts",
    javascript: "js",
    json: "json",
    yaml: "yaml",
    bash: "sh",
    sql: "sql",
    markdown: "md",
    cmake: "cmake",
  };
  return `snippet.${lang ? (ext[lang] ?? "txt") : "txt"}`;
}
