import * as vscode from "vscode";
import { parseUnifiedDiff } from "../webview/render/parseDiff";

/**
 * Décorations de gouttière (item 102) : les lignes touchées par le **tour
 * courant** portent une marque discrète, colonne d'overview seulement, couleur
 * de token distincte des décorations git. Effacées au tour suivant.
 * Désactivables par `agenticenvChat.edits.decorations`.
 */
export class TurnDecorations {
  private readonly type = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.modifiedForeground"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    isWholeLine: true,
    gutterIconPath: undefined,
  });
  private ranges = new Map<string, vscode.Range[]>();

  /** Recalcule les lignes touchées d'un fichier à partir de son diff unifié. */
  setFromDiff(fsPath: string, unified: string): void {
    const parsed = parseUnifiedDiff(unified)[0];
    if (!parsed) {
      this.ranges.delete(fsPath);
      this.refresh();
      return;
    }
    const ranges: vscode.Range[] = [];
    for (const h of parsed.hunks) {
      let line = h.newStart - 1;
      for (const l of h.lines) {
        if (l.kind === "add") {
          ranges.push(new vscode.Range(line, 0, line, 0));
          line++;
        } else if (l.kind === "ctx") {
          line++;
        }
      }
    }
    this.ranges.set(fsPath, ranges);
    this.refresh();
  }

  clear(): void {
    this.ranges.clear();
    this.refresh();
  }

  refresh(): void {
    if (!this.enabled()) {
      for (const editor of vscode.window.visibleTextEditors) {
        editor.setDecorations(this.type, []);
      }
      return;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.type, this.ranges.get(editor.document.uri.fsPath) ?? []);
    }
  }

  private enabled(): boolean {
    return vscode.workspace
      .getConfiguration("agenticenvChat")
      .get<boolean>("edits.decorations", true);
  }

  dispose(): void {
    this.type.dispose();
  }
}
