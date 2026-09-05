import { FileRefList } from "../../views/FileRefList";
import { str, type ToolRenderer } from "../types";

/** `grep` (OpenHands `GrepTool`) — recherche de motif. */
export const grepRenderer: ToolRenderer = {
  icon: "⌕",
  summary(call, obs) {
    const pattern = str(call.args?.pattern) ?? str(call.args?.query) ?? "";
    const matches = lineCount(obs?.text);
    return `Search "${clip(pattern)}" · ${matches} match${matches === 1 ? "" : "es"}`;
  },
  body(_call, obs, ctx) {
    return obs ? <FileRefList text={obs.text} sandboxRoot={ctx.sandboxRoot} onOpenFile={ctx.onOpenFile} /> : null;
  },
  defaultExpanded(_call, obs, status) {
    return status === "error" || obs?.error === true;
  },
};

/** `glob` (OpenHands `GlobTool`) — motif de chemins. */
export const globRenderer: ToolRenderer = {
  icon: "⌕",
  summary(call, obs) {
    const pattern = str(call.args?.pattern) ?? "";
    const files = lineCount(obs?.text);
    return `Find "${clip(pattern)}" · ${files} file${files === 1 ? "" : "s"}`;
  },
  body(_call, obs, ctx) {
    return obs ? <FileRefList text={obs.text} sandboxRoot={ctx.sandboxRoot} onOpenFile={ctx.onOpenFile} /> : null;
  },
};

function lineCount(text: string | undefined): number {
  if (!text) {
    return 0;
  }
  return text.split("\n").filter((l) => l.trim()).length;
}

function clip(s: string): string {
  return s.length > 40 ? s.slice(0, 39) + "…" : s;
}
