import * as vscode from "vscode";
import { log } from "../logging";

/**
 * Provider `terminal` (C04 §terminal, item 74).
 *
 * `[À CONFIRMER]` **tranché** : la capture de la sortie d'une commande demande
 * l'API *shell integration* (`window.onDidEndTerminalShellExecution` +
 * `TerminalShellExecution.read()`), **stable depuis VS Code 1.93**. `package.json`
 * exige `^1.93.0`. On feature-detecte quand même : si l'intégration shell n'est
 * pas active pour le terminal courant, seule « terminal selection » est proposée.
 *
 * Le terminal « AgenticEnv » / « AgenticEnv Chat » (nos commandes de service) est
 * **exclu**.
 */

const EXCLUDED_NAMES = ["AgenticEnv", "AgenticEnv Chat"];

interface ShellExecutionRecord {
  commandLine: string;
  exitCode: number | undefined;
  output: string;
}

const lastExecution = new Map<string, ShellExecutionRecord>();
let subscribed = false;

/** Branché une fois à l'activation : mémorise la dernière commande par terminal. */
export function watchTerminals(context: vscode.ExtensionContext): void {
  if (subscribed) {
    return;
  }
  subscribed = true;
  const api = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: vscode.Event<vscode.TerminalShellExecutionEndEvent>;
  };
  if (typeof api.onDidEndTerminalShellExecution !== "function") {
    log.info("terminal: shell integration API unavailable — only terminal selection will be offered");
    return;
  }
  context.subscriptions.push(
    api.onDidEndTerminalShellExecution(async (e) => {
      if (EXCLUDED_NAMES.includes(e.terminal.name)) {
        return;
      }
      try {
        let output = "";
        for await (const chunk of e.execution.read()) {
          output += chunk;
        }
        lastExecution.set(e.terminal.name, {
          commandLine: e.execution.commandLine.value,
          exitCode: e.exitCode,
          output,
        });
      } catch (err) {
        log.debug("terminal: failed to read shell execution output", err);
      }
    }),
  );
}

export function shellIntegrationAvailable(): boolean {
  return (
    typeof (vscode.window as unknown as Record<string, unknown>).onDidEndTerminalShellExecution ===
    "function"
  );
}

export function lastCommandContext(): { label: string; body: string; truncated: boolean } | null {
  const active = vscode.window.activeTerminal;
  const record =
    (active && !EXCLUDED_NAMES.includes(active.name) && lastExecution.get(active.name)) ||
    [...lastExecution.values()].pop();
  if (!record) {
    return null;
  }
  const lines = record.output.split("\n");
  const truncated = lines.length > 100;
  const tail = truncated ? lines.slice(-100).join("\n") : record.output;
  const exit = record.exitCode === undefined ? "" : ` (exit ${record.exitCode})`;
  return {
    label: `terminal: ${record.commandLine}${exit}`,
    body: `$ ${record.commandLine}${exit}\n\n${tail}`,
    truncated,
  };
}

export function terminalSelectionContext(): { label: string; body: string } | null {
  const active = vscode.window.activeTerminal as
    | (vscode.Terminal & { selection?: string })
    | undefined;
  const sel = active?.selection;
  if (!sel || EXCLUDED_NAMES.includes(active?.name ?? "")) {
    return null;
  }
  return { label: "terminal selection", body: sel };
}
