import { fileEditorRenderer } from "./renderers/fileEditor";
import { genericRenderer } from "./renderers/generic";
import { grepRenderer, globRenderer } from "./renderers/search";
import { terminalRenderer } from "./renderers/terminal";
import type { ToolRenderer } from "./types";

/**
 * `toolName → renderer`, avec **repli générique** garanti (C05 §1). Les noms
 * d'outils sont ceux du SDK OpenHands, dérivés du nom de classe
 * (`FileEditorTool → file_editor`, etc. — `openhands/sdk/tool/tool.py`). Les MCP
 * ajoutent des noms libres, pris en charge par le repli.
 */
const EXACT: Record<string, ToolRenderer> = {
  file_editor: fileEditorRenderer,
  str_replace_editor: fileEditorRenderer, // alias historique (function-calling Anthropic)
  terminal: terminalRenderer,
  execute_bash: terminalRenderer,
  bash: terminalRenderer,
  grep: grepRenderer,
  glob: globRenderer,
};

export function rendererFor(toolName: string): ToolRenderer {
  return EXACT[toolName] ?? familyRenderer(toolName) ?? genericRenderer;
}

function familyRenderer(toolName: string): ToolRenderer | undefined {
  const n = toolName.toLowerCase();
  if (n.includes("edit") || n.includes("str_replace")) {
    return fileEditorRenderer;
  }
  if (n.includes("bash") || n.includes("terminal") || n.includes("shell") || n.includes("exec")) {
    return terminalRenderer;
  }
  if (n.includes("grep") || n.includes("search") || n.includes("ripgrep")) {
    return grepRenderer;
  }
  if (n.includes("glob") || n.includes("find_files")) {
    return globRenderer;
  }
  return undefined;
}

/** Famille d'un outil, pour le regroupement (C05 §5). */
export function toolFamily(toolName: string): string {
  const r = rendererFor(toolName);
  if (r === fileEditorRenderer) {
    return "edit";
  }
  if (r === terminalRenderer) {
    return "terminal";
  }
  if (r === grepRenderer || r === globRenderer) {
    return "search";
  }
  return "other";
}
