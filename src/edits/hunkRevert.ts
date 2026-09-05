import * as vscode from "vscode";
import { log } from "../logging";
import { parseUnifiedDiff, type DiffHunk } from "../webview/render/parseDiff";

/**
 * `revert hunk` (item 48, portée réduite C06 §4). Réapplique la version *d'avant*
 * sur les lignes d'un seul hunk, via un `WorkspaceEdit` — donc **annulable par le
 * `Ctrl+Z` natif** de VS Code. Si le fichier a bougé depuis le calcul du diff, le
 * revert est **refusé** (jamais d'application aveugle sur des lignes décalées).
 */
export type RevertResult = "ok" | "not-found" | "shifted" | "error";

export async function revertHunk(
  fileUri: vscode.Uri,
  unified: string,
  hunkHeader: string,
): Promise<RevertResult> {
  const parsed = parseUnifiedDiff(unified)[0];
  const hunk = parsed?.hunks.find((h) => h.header === hunkHeader);
  if (!hunk) {
    return "not-found";
  }

  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(fileUri);
  } catch (err) {
    log.debug("revertHunk: cannot open file", err);
    return "error";
  }

  const eol = doc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  const lines = doc.getText().split(/\r?\n/);

  const start = hunk.newStart - 1;
  const expectedNew = hunk.lines.filter((l) => l.kind !== "del").map((l) => l.text);
  const actual = lines.slice(start, start + expectedNew.length);
  if (actual.join("\n") !== expectedNew.join("\n")) {
    return "shifted"; // le fichier a changé depuis le diff
  }

  const revertedRegion = hunk.lines.filter((l) => l.kind !== "add").map((l) => l.text);

  const range = new vscode.Range(
    new vscode.Position(start, 0),
    new vscode.Position(start + expectedNew.length, 0),
  );
  const replacement = revertedRegion.length ? revertedRegion.join(eol) + eol : "";

  const edit = new vscode.WorkspaceEdit();
  edit.replace(fileUri, range, replacement);
  return (await vscode.workspace.applyEdit(edit)) ? "ok" : "error";
}

/** Le hunk (utilitaire exposé pour les tests). */
export function findHunk(unified: string, header: string): DiffHunk | undefined {
  return parseUnifiedDiff(unified)[0]?.hunks.find((h) => h.header === header);
}
