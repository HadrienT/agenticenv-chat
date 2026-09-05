import * as vscode from "vscode";
import { ChatViewProvider } from "./chatViewProvider";
import { watchTerminals } from "./context/terminal";
import { createOutputChannel, log, type LogLevel } from "./logging";

const VIEW_ID = "agenticenvChat.view";

export function activate(context: vscode.ExtensionContext): void {
  const channel = createOutputChannel();
  const level = vscode.workspace
    .getConfiguration("agenticenvChat")
    .get<LogLevel>("logLevel", "info");
  log.init(channel, level);
  context.subscriptions.push(channel);
  log.info("AgenticEnv Chat activated");

  watchTerminals(context);

  const provider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("agenticenvChat.newSession", () => provider.newSession()),
    vscode.commands.registerCommand("agenticenvChat.reconnect", () => provider.reconnect()),
    vscode.commands.registerCommand("agenticenvChat.undoTurn", () => provider.undoTurn()),
    vscode.commands.registerCommand("agenticenvChat.openTurnDiff", () => provider.openTurnDiff()),
    vscode.commands.registerCommand("agenticenvChat.purgeCheckpoints", () => provider.purgeCheckpoints()),
    vscode.commands.registerCommand("agenticenvChat.restoreCheckpoint", () => provider.undoTurn()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agenticenvChat.logLevel")) {
        log.setLevel(
          vscode.workspace
            .getConfiguration("agenticenvChat")
            .get<LogLevel>("logLevel", "info"),
        );
      }
    }),
  );
}

export function deactivate(): void {
  // Le BridgeClient est arrêté par le `onDidDispose` de la vue.
}
