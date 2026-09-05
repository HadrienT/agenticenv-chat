import * as vscode from "vscode";
import { log } from "../logging";
import type { ContextChip } from "../messages";
import { displayPath, toSandboxPath } from "../paths";

/**
 * Provider `symbol` (C04 §symbols, items 75, 81). La subtilité qui compte :
 * **attacher la définition du symbole, pas le fichier entier**. Pour du C++ avec
 * clangd, c'est 300 tokens contre 30 000.
 *
 * Le corps = le `range` du `DocumentSymbol` (ou du résultat de définition) + les
 * `#include`/`import` en tête de fichier + la déclaration de classe englobante.
 */

export async function searchSymbols(query: string): Promise<ContextChip[]> {
  const results = await safeCommand<vscode.SymbolInformation[]>(
    "vscode.executeWorkspaceSymbolProvider",
    query,
  );
  const chips: ContextChip[] = [];
  for (const sym of (results ?? []).slice(0, 30)) {
    const sandboxPath = toSandboxPath(sym.location.uri);
    if (!sandboxPath) {
      continue;
    }
    chips.push({
      ref: { kind: "symbol", uri: sym.location.uri.toString(), name: sym.name },
      label: sym.name,
      detail: `${vscode.SymbolKind[sym.kind]} · ${displayPath(sandboxPath)}`,
      estBytes: 2048,
    });
  }
  return chips;
}

export async function resolveSymbol(
  uriString: string,
  name: string,
  maxBytes: number,
): Promise<{ label: string; body: string; truncated: boolean; bytes: number }> {
  const uri = vscode.Uri.parse(uriString);
  const sandboxPath = toSandboxPath(uri) ?? uriString;
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const symbols =
      (await safeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", uri)) ?? [];
    const target = findSymbol(symbols, name);
    if (!target) {
      return { label: `${name} (not found)`, body: "", truncated: false, bytes: 0 };
    }
    const header = fileHeader(doc);
    const enclosing = enclosingDeclaration(symbols, target, doc);
    const bodyText = doc.getText(target.range);
    const combined = [header, enclosing, bodyText].filter(Boolean).join("\n\n");
    const truncated = Buffer.byteLength(combined, "utf8") > maxBytes;
    const body = truncated ? combined.slice(0, maxBytes) + "\n… (truncated)" : combined;
    return {
      label: `${name} — ${displayPath(sandboxPath)}:${target.range.start.line + 1}`,
      body,
      truncated,
      bytes: Buffer.byteLength(body, "utf8"),
    };
  } catch (err) {
    log.debug("resolveSymbol failed:", err);
    return { label: name, body: `[unavailable: ${String(err)}]`, truncated: false, bytes: 0 };
  }
}

function findSymbol(symbols: vscode.DocumentSymbol[], name: string): vscode.DocumentSymbol | null {
  for (const s of symbols) {
    if (s.name === name || s.name.startsWith(`${name}(`)) {
      return s;
    }
    const child = findSymbol(s.children ?? [], name);
    if (child) {
      return child;
    }
  }
  return null;
}

function fileHeader(doc: vscode.TextDocument): string {
  const lines: string[] = [];
  for (let i = 0; i < Math.min(doc.lineCount, 60); i++) {
    const text = doc.lineAt(i).text;
    if (/^\s*(#include|#import|import |from |using )/.test(text)) {
      lines.push(text);
    }
  }
  return lines.join("\n");
}

function enclosingDeclaration(
  symbols: vscode.DocumentSymbol[],
  target: vscode.DocumentSymbol,
  doc: vscode.TextDocument,
): string {
  for (const s of symbols) {
    if (
      (s.kind === vscode.SymbolKind.Class ||
        s.kind === vscode.SymbolKind.Struct ||
        s.kind === vscode.SymbolKind.Namespace) &&
      s.range.contains(target.range) &&
      s !== target
    ) {
      return doc.lineAt(s.range.start.line).text.trim();
    }
  }
  return "";
}

async function safeCommand<T>(command: string, ...args: unknown[]): Promise<T | undefined> {
  try {
    return await vscode.commands.executeCommand<T>(command, ...args);
  } catch (err) {
    log.debug(`command ${command} failed:`, err);
    return undefined;
  }
}
