import * as vscode from "vscode";
import { log } from "../logging";

/**
 * Journal de retour utilisateur (item 34). **Aucune télémétrie** (D7) : les
 * pouces 👍/👎 sont écrits dans `storageUri/feedback.jsonl`, propre au dossier,
 * pour servir de corpus d'évaluation à AgenticEnv. C'est le seul usage.
 */
export async function appendFeedback(
  context: vscode.ExtensionContext,
  entry: {
    itemId: string;
    value: "up" | "down";
    conversationId: string | undefined;
    llmSource: string | undefined;
  },
): Promise<void> {
  const dir = context.storageUri;
  if (!dir) {
    log.debug("feedback: no storageUri (no folder open), dropped");
    return;
  }
  const file = vscode.Uri.joinPath(dir, "feedback.jsonl");
  const line =
    JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n";
  try {
    await vscode.workspace.fs.createDirectory(dir);
    let existing = "";
    try {
      existing = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
    } catch (err) {
      log.trace("feedback: starting a new feedback.jsonl", err);
    }
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(existing + line));
  } catch (err) {
    log.warn("feedback: could not write feedback.jsonl:", err);
  }
}
