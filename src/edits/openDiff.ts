import * as vscode from "vscode";
import { log } from "../logging";
import type { CheckpointStore } from "./checkpoints";

/**
 * Diff **virtuel** dans l'éditeur (C06 §2). Un `TextDocumentContentProvider` sur
 * le schéma `agenticenv-checkpoint:` sert la version *d'avant le tour* — sans
 * jamais écrire de fichier temporaire sur le disque de l'utilisateur. Puis
 * `vscode.diff` compare cette version au fichier réel (navigation native, item 50).
 */
export const SCHEME = "agenticenv-checkpoint";

export class CheckpointContentProvider implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;
  private cache = new Map<string, string>();

  put(key: string, content: string): vscode.Uri {
    this.cache.set(key, content);
    const uri = vscode.Uri.from({ scheme: SCHEME, path: "/" + key });
    this.emitter.fire(uri);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.path.replace(/^\//, "")) ?? "";
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

export async function openCheckpointDiff(
  provider: CheckpointContentProvider,
  store: CheckpointStore,
  turnId: string,
  root: string,
  relPath: string,
): Promise<void> {
  const base = await store.baseContent(turnId, relPath);
  const fileUri = vscode.Uri.joinPath(vscode.Uri.file(root), relPath);
  if (base === null) {
    log.debug("openCheckpointDiff: no base content (not a git checkpoint)");
    await vscode.commands.executeCommand("vscode.open", fileUri);
    return;
  }
  const key = `${turnId}/${relPath}`.replace(/[^\w./-]/g, "_");
  const beforeUri = provider.put(key, base);
  await vscode.commands.executeCommand(
    "vscode.diff",
    beforeUri,
    fileUri,
    `${relPath} — before this turn ↔ now`,
    { preview: true },
  );
}
