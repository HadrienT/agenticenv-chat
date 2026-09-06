import * as vscode from "vscode";
import { git, isGitRepo } from "../edits/git";
import { log } from "../logging";
import {
  commitMessagePrompt,
  explainMessage,
  fixMessage,
  prDescriptionPrompt,
  terminalCommandPrompt,
  type CommitStyle,
  type DiagnosticInput,
} from "./message";

/**
 * Points d'accroche natifs (C11). Ce module ne crée **aucune** capacité : il
 * rebranche C02/C03/C04 sur les diagnostics, le SCM et le terminal. Un tour lancé
 * ici est visible dans le panneau comme les autres.
 */
export interface EditorHost {
  openWithMessage(text: string, autoSend: boolean): Promise<void>;
  runCapturedTurn(text: string): Promise<string | null>;
}

const FIX = "agenticenvChat.fixDiagnostic";
const EXPLAIN = "agenticenvChat.explainDiagnostic";

export function registerEditorIntegration(
  context: vscode.ExtensionContext,
  host: EditorHost,
): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider("*", new AgentCodeActions(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerCommand(FIX, (d: DiagnosticInput) =>
      host.openWithMessage(fixMessage(d), autoSend()),
    ),
    vscode.commands.registerCommand(EXPLAIN, (d: DiagnosticInput) =>
      host.openWithMessage(explainMessage(d), autoSend()),
    ),
    vscode.commands.registerCommand("agenticenvChat.generateCommitMessage", () =>
      generateCommitMessage(host),
    ),
    vscode.commands.registerCommand("agenticenvChat.generatePrDescription", () =>
      generatePrDescription(host),
    ),
    vscode.commands.registerCommand("agenticenvChat.terminalChat", () => terminalChat(host)),
  );
}

function autoSend(): boolean {
  return vscode.workspace
    .getConfiguration("agenticenvChat")
    .get<boolean>("editor.autoSendCodeActions", false);
}

/** « Fix with agent » / « Explain this error » sur les diagnostics Error/Warning. */
class AgentCodeActions implements vscode.CodeActionProvider {
  provideCodeActions(
    doc: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    ctx: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const relevant = ctx.diagnostics.filter(
      (d) =>
        d.severity === vscode.DiagnosticSeverity.Error ||
        d.severity === vscode.DiagnosticSeverity.Warning,
    );
    if (relevant.length === 0) {
      return [];
    }
    const d = relevant[0];
    const input: DiagnosticInput = {
      severity: d.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning",
      message: d.message.split("\n")[0],
      file: vscode.workspace.asRelativePath(doc.uri),
      line: d.range.start.line + 1,
      source: d.source,
      enclosing: enclosingText(doc, d.range),
    };
    const fix = new vscode.CodeAction("Fix with agent", vscode.CodeActionKind.QuickFix);
    fix.command = { command: FIX, title: "Fix with agent", arguments: [input] };
    fix.diagnostics = [d];
    const explain = new vscode.CodeAction("Explain this error", vscode.CodeActionKind.QuickFix);
    explain.command = { command: EXPLAIN, title: "Explain this error", arguments: [input] };
    explain.diagnostics = [d];
    return [fix, explain];
  }
}

/** Bloc de lignes autour du diagnostic (fenêtre bornée — jamais le fichier entier). */
function enclosingText(doc: vscode.TextDocument, range: vscode.Range): string {
  const start = Math.max(0, range.start.line - 8);
  const end = Math.min(doc.lineCount - 1, range.end.line + 8);
  return doc.getText(new vscode.Range(start, 0, end, doc.lineAt(end).text.length));
}

async function repoRoot(): Promise<string | null> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || folder.uri.scheme !== "file") {
    return null;
  }
  return (await isGitRepo(folder.uri.fsPath)) ? folder.uri.fsPath : null;
}

interface GitInputBox {
  value: string;
}
function commitInputBox(): GitInputBox | null {
  try {
    const ext = vscode.extensions.getExtension<{
      getAPI(v: 1): { repositories: { inputBox: GitInputBox }[] };
    }>("vscode.git");
    return ext?.isActive ? ext.exports.getAPI(1).repositories[0]?.inputBox ?? null : null;
  } catch (err) {
    log.debug("scm: git input box unavailable", err);
    return null;
  }
}

async function generateCommitMessage(host: EditorHost): Promise<void> {
  const root = await repoRoot();
  if (!root) {
    void vscode.window.showWarningMessage("No Git repository in this folder.");
    return;
  }
  const box = commitInputBox();
  const staged = (await git(root, ["diff", "--cached"])).stdout;
  const diff = staged.trim() ? staged : (await git(root, ["diff"])).stdout;
  if (!diff.trim()) {
    void vscode.window.showInformationMessage("Nothing to describe — no changes.");
    return;
  }
  if (box && box.value.trim() && !(await confirmOverwrite("commit message"))) {
    return;
  }
  const style = vscode.workspace
    .getConfiguration("agenticenvChat")
    .get<CommitStyle>("scm.commitStyle", "conventional");
  const msg = await host.runCapturedTurn(commitMessagePrompt(clip(diff), style, staged.trim().length > 0));
  if (!msg) {
    return;
  }
  if (box) {
    box.value = msg;
  } else {
    void vscode.env.clipboard.writeText(msg);
    void vscode.window.showInformationMessage("Commit message copied to the clipboard.");
  }
}

async function generatePrDescription(host: EditorHost): Promise<void> {
  const root = await repoRoot();
  if (!root) {
    void vscode.window.showWarningMessage("No Git repository in this folder.");
    return;
  }
  const base =
    (await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])).stdout.trim() ||
    "origin/main";
  const logText = (await git(root, ["log", "--pretty=format:- %s", `${base}..HEAD`])).stdout;
  const diff = (await git(root, ["diff", `${base}...HEAD`])).stdout;
  if (!logText.trim()) {
    void vscode.window.showInformationMessage(`No commits between ${base} and HEAD.`);
    return;
  }
  const body = await host.runCapturedTurn(prDescriptionPrompt(base, logText, clip(diff)));
  if (!body) {
    return;
  }
  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: body });
  await vscode.window.showTextDocument(doc);
}

async function terminalChat(host: EditorHost): Promise<void> {
  const term = vscode.window.activeTerminal;
  if (!term || term.name === "AgenticEnv") {
    void vscode.window.showWarningMessage("Open a terminal first (the AgenticEnv service terminal is excluded).");
    return;
  }
  const request = await vscode.window.showInputBox({
    prompt: "Describe the command to generate — it will be inserted, not run",
  });
  if (!request) {
    return;
  }
  const cmd = await host.runCapturedTurn(terminalCommandPrompt(request));
  if (cmd) {
    term.sendText(cmd.split("\n")[0].trim(), false);
  }
}

function confirmOverwrite(what: string): Thenable<boolean> {
  return vscode.window
    .showWarningMessage(`Replace the existing ${what}?`, { modal: true }, "Replace")
    .then((a) => a === "Replace");
}

/** Borne le diff envoyé au modèle (le provider tronque aussi côté contexte). */
function clip(diff: string): string {
  const cap = 60_000;
  return diff.length > cap ? diff.slice(0, cap) + "\n… (diff truncated)" : diff;
}
