import * as vscode from "vscode";
import { log } from "../logging";
import { asString, parseFrontmatter } from "./frontmatter";
import { parseInstructionFile, type LoadedFile } from "./assemble";
import { parsePrompt, type PromptDef } from "./prompts";

/**
 * Chargement des fichiers d'instructions / prompts / modes du dépôt (C10 §1).
 *
 * **Workspace Trust** (C07 §7) : dans un dossier non fiable, **rien** n'est
 * chargé — ce sont des instructions qui pilotent un agent qui exécute des
 * commandes. Rechargement à chaud via `FileSystemWatcher` ; l'effet s'applique au
 * tour suivant.
 */

const ROOT_FILES = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];

export interface ModeDef {
  name: string;
  permissions?: string;
  mcp: string[];
  model?: string;
  instructions: string;
}

export class InstructionLoader {
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly onChange: () => void) {}

  private folder(): vscode.Uri | null {
    const f = vscode.workspace.workspaceFolders?.[0];
    return f && f.uri.scheme === "file" ? f.uri : null;
  }

  private enabled(): boolean {
    return vscode.workspace.isTrusted && this.folder() !== null;
  }

  watch(context: vscode.ExtensionContext): void {
    const folder = this.folder();
    if (!folder || this.watcher) {
      return;
    }
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        folder,
        "{AGENTS.md,CLAUDE.md,.github/copilot-instructions.md,.agenticenv/**/*.md}",
      ),
    );
    const fire = (): void => this.onChange();
    this.watcher.onDidChange(fire);
    this.watcher.onDidCreate(fire);
    this.watcher.onDidDelete(fire);
    context.subscriptions.push(this.watcher);
  }

  private async read(rel: string): Promise<string | null> {
    const folder = this.folder();
    if (!folder) {
      return null;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, rel));
      return new TextDecoder().decode(bytes);
    } catch (err) {
      log.trace(`instructions: ${rel} absent`, err);
      return null;
    }
  }

  async loadRoots(): Promise<LoadedFile[]> {
    if (!this.enabled()) {
      return [];
    }
    const out: LoadedFile[] = [];
    for (const rel of ROOT_FILES) {
      const content = await this.read(rel);
      if (content !== null) {
        out.push({ rel, content: content.trim() });
      }
    }
    return out;
  }

  async loadScoped(): Promise<LoadedFile[]> {
    if (!this.enabled()) {
      return [];
    }
    return this.loadDir(".agenticenv/instructions", ".instructions.md", (rel, raw) =>
      parseInstructionFile(rel, raw),
    );
  }

  async loadPrompts(): Promise<PromptDef[]> {
    if (!this.enabled()) {
      return [];
    }
    return this.loadDir(".agenticenv/prompts", ".prompt.md", (rel, raw) =>
      parsePrompt(rel.split("/").pop() ?? rel, raw),
    );
  }

  async loadModes(): Promise<ModeDef[]> {
    if (!this.enabled()) {
      return [];
    }
    return this.loadDir(".agenticenv/modes", ".mode.md", (rel, raw) => {
      const { data, body } = parseFrontmatter(raw);
      return {
        name: asString(data.name) ?? (rel.split("/").pop() ?? rel).replace(/\.mode\.md$/, ""),
        permissions: asString(data.permissions),
        mcp: Array.isArray(data.mcp) ? data.mcp : data.mcp ? [data.mcp] : [],
        model: asString(data.model),
        instructions: body.trim(),
      };
    });
  }

  private async loadDir<T>(
    dir: string,
    suffix: string,
    parse: (rel: string, raw: string) => T,
  ): Promise<T[]> {
    const folder = this.folder();
    if (!folder) {
      return [];
    }
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(folder, dir));
    } catch (err) {
      log.trace(`instructions: dir ${dir} absent`, err);
      return [];
    }
    const out: T[] = [];
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith(suffix)) {
        const raw = await this.read(`${dir}/${name}`);
        if (raw !== null) {
          out.push(parse(`${dir}/${name}`, raw));
        }
      }
    }
    return out;
  }

  /** Mémoire projet (item 117) : ajoute une puce à `AGENTS.md` sous une section dédiée. */
  async remember(bullet: string): Promise<{ ok: boolean; message: string }> {
    const folder = this.folder();
    if (!folder) {
      return { ok: false, message: "No folder open." };
    }
    if (!vscode.workspace.isTrusted) {
      return { ok: false, message: "This folder is not trusted." };
    }
    const uri = vscode.Uri.joinPath(folder, "AGENTS.md");
    const heading = "## Agent memory";
    let text = (await this.read("AGENTS.md")) ?? "";
    const line = `- ${bullet.trim()}`;
    if (text.includes(heading)) {
      text = text.replace(new RegExp(`(${heading}\\r?\\n(?:.*\\r?\\n)*?)(?=\\n#|$)`), (m) =>
        m.replace(/\s*$/, `\n${line}\n`),
      );
    } else {
      text = `${text.trimEnd()}\n\n${heading}\n\n${line}\n`;
    }
    const ok = await vscode.window.showInformationMessage(
      `Add to AGENTS.md → "${heading}":\n\n${line}`,
      { modal: true },
      "Write",
    );
    if (ok !== "Write") {
      return { ok: false, message: "Cancelled." };
    }
    try {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
      return { ok: true, message: `Added to AGENTS.md.` };
    } catch (err) {
      log.warn("remember write failed:", err);
      return { ok: false, message: `AGENTS.md is not writable: ${String(err)}` };
    }
  }
}
