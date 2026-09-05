import * as vscode from "vscode";
import { log } from "../logging";
import type { ContextChip, FileHit } from "../messages";
import { displayPath, toSandboxPath } from "../paths";
import { truncateToBytes } from "./budget";
import { isNoise, isSensitivePath, loadIgnore } from "./ignore";

/**
 * Provider `file` / `selection` + recherche floue + fichiers récents
 * (C04 §files, items 6, 71). Aucun contenu ne transite par la webview : la
 * webview envoie une `ContextRef`, l'hôte lit le fichier à l'envoi.
 */

export const SELECTION_MARGIN_DEFAULT = 5;

/** Éditeurs à ignorer pour « fichier actif » : output, diff, webview, untitled… */
export function isRealFileEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  return editor !== undefined && editor.document.uri.scheme === "file";
}

export function activeFileRef(): ContextChip | null {
  const editor = vscode.window.activeTextEditor;
  if (!isRealFileEditor(editor)) {
    return null;
  }
  const sandboxPath = toSandboxPath(editor.document.uri);
  if (!sandboxPath) {
    return null;
  }
  return {
    ref: { kind: "file", uri: editor.document.uri.toString() },
    label: displayPath(sandboxPath),
    detail: "active editor",
    estBytes: Buffer.byteLength(editor.document.getText(), "utf8"),
    sensitive: isSensitivePath(sandboxPath),
  };
}

export function selectionRef(margin = SELECTION_MARGIN_DEFAULT): ContextChip | null {
  const editor = vscode.window.activeTextEditor;
  if (!isRealFileEditor(editor) || editor.selection.isEmpty) {
    return null;
  }
  const sandboxPath = toSandboxPath(editor.document.uri);
  if (!sandboxPath) {
    return null;
  }
  const start = Math.max(0, editor.selection.start.line - margin);
  const end = Math.min(editor.document.lineCount - 1, editor.selection.end.line + margin);
  return {
    ref: { kind: "selection", uri: editor.document.uri.toString(), range: [start + 1, end + 1] },
    label: `${displayPath(sandboxPath)}:${start + 1}-${end + 1}`,
    detail: "selection",
    estBytes: Buffer.byteLength(editor.document.getText(new vscode.Range(start, 0, end + 1, 0)), "utf8"),
    sensitive: isSensitivePath(sandboxPath),
  };
}

/** Les 10 derniers fichiers `file:` visités, filtrés — jamais attachés d'office. */
export function recentFiles(): FileHit[] {
  const seen = new Set<string>();
  const hits: FileHit[] = [];
  for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
    const input = tab.input;
    if (!(input instanceof vscode.TabInputText) || input.uri.scheme !== "file") {
      continue;
    }
    const sandboxPath = toSandboxPath(input.uri);
    if (!sandboxPath || seen.has(sandboxPath) || isSensitivePath(sandboxPath) || isNoise(sandboxPath)) {
      continue;
    }
    seen.add(sandboxPath);
    hits.push({ uri: input.uri.toString(), rel: displayPath(sandboxPath) });
  }
  return hits.slice(0, 10);
}

export async function searchFiles(query: string, folder: vscode.Uri): Promise<FileHit[]> {
  const ignore = await loadIgnore(folder);
  const found = await vscode.workspace.findFiles(
    "**/*",
    "**/{node_modules,.git,build,dist,out,.venv}/**",
    2000,
  );
  const scored = found
    .map((uri) => {
      const sandboxPath = toSandboxPath(uri);
      return sandboxPath ? { uri, rel: displayPath(sandboxPath), sandboxPath } : null;
    })
    .filter((x): x is { uri: vscode.Uri; rel: string; sandboxPath: string } => x !== null)
    .filter((x) => !isSensitivePath(x.sandboxPath) && !ignore.ignores(x.rel))
    .map((x) => ({ hit: { uri: x.uri.toString(), rel: x.rel }, score: fuzzyScore(query, x.rel) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  return scored.map((x) => x.hit);
}

export async function resolveFile(
  uriString: string,
  maxBytes: number,
): Promise<{ label: string; body: string; truncated: boolean; bytes: number }> {
  const uri = vscode.Uri.parse(uriString);
  const sandboxPath = toSandboxPath(uri) ?? uriString;
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const { body, truncated } = truncateToBytes(doc.getText(), maxBytes);
    return {
      label: displayPath(sandboxPath) + (truncated ? " (truncated)" : ""),
      body,
      truncated,
      bytes: Buffer.byteLength(body, "utf8"),
    };
  } catch (err) {
    log.debug("resolveFile failed:", err);
    return { label: displayPath(sandboxPath), body: `[unavailable: ${String(err)}]`, truncated: false, bytes: 0 };
  }
}

/** Score flou simple : sous-séquence, bonus pour début de segment. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) {
    return 1;
  }
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) {
      return 0;
    }
    streak = found === ti ? streak + 2 : 1;
    score += streak + (found > 0 && "/.-_".includes(t[found - 1]) ? 3 : 0);
    ti = found + 1;
  }
  const base = t.slice(t.lastIndexOf("/") + 1);
  if (base === q) {
    score += 12;
  } else if (base.startsWith(q)) {
    score += 8;
  }
  return score + (t.endsWith(q) ? 5 : 0);
}
