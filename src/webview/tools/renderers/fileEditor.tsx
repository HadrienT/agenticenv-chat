import { Diff } from "../../views/Diff";
import { CodeBlock } from "../../views/CodeBlock";
import { num, str, type ToolRenderer } from "../types";

const NOOP_ACTIONS = {
  copy: () => undefined,
  insert: () => undefined,
  createFile: () => undefined,
  runInTerminal: () => undefined,
};

/** `file_editor` (OpenHands `FileEditorTool`) — view / create / str_replace / insert / undo_edit. */
export const fileEditorRenderer: ToolRenderer = {
  icon: "✎",

  summary(call, obs) {
    const a = call.args ?? {};
    const command = str(a.command) ?? "edit";
    const o = (obs?.raw ?? {}) as Record<string, unknown>;
    const name = basename(str(a.path) ?? str(o.path) ?? "file");

    if (command === "view") {
      const range = Array.isArray(a.view_range) ? (a.view_range as number[]) : undefined;
      return `Read ${name}${range ? `:${range[0]}-${range[1]}` : ""}`;
    }
    if (command === "create") {
      const text = str(a.file_text) ?? "";
      return `Create ${name} · ${text ? text.split("\n").length : 0} lines`;
    }
    if (command === "insert") {
      return `Insert into ${name}${num(a.insert_line) ? `:${num(a.insert_line)}` : ""}`;
    }
    if (command === "undo_edit") {
      return `Undo edit ${name}`;
    }
    const { added, removed, measured } = countChange(a, o);
    return `Edit ${name} · +${added} −${removed}${measured ? "" : " (est.)"}`;
  },

  body(call, obs) {
    const a = call.args ?? {};
    const command = str(a.command) ?? "edit";
    const o = (obs?.raw ?? {}) as Record<string, unknown>;
    const lang = langOf(str(a.path));

    if (command === "view" || command === "create") {
      const code = command === "create" ? (str(a.file_text) ?? obs?.text ?? "") : (obs?.text ?? "");
      return (
        <CodeBlock code={code} lang={lang} open={false} editorAvailable={false} actions={NOOP_ACTIONS} />
      );
    }
    const oldText = str(o.old_content) ?? str(a.old_str) ?? "";
    const newText = str(o.new_content) ?? str(a.new_str) ?? "";
    if (oldText || newText) {
      return <Diff oldText={oldText} newText={newText} measured={"old_content" in o} />;
    }
    return obs?.text ? <pre className="agx-output__pre">{obs.text}</pre> : null;
  },

  defaultExpanded(_call, obs, status) {
    return status === "error" || obs?.error === true;
  },
};

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

function countChange(
  args: Record<string, unknown>,
  obs: Record<string, unknown>,
): { added: number; removed: number; measured: boolean } {
  const measured = "old_content" in obs || "new_content" in obs;
  const oldText = str(obs.old_content) ?? str(args.old_str) ?? "";
  const newText = str(obs.new_content) ?? str(args.new_str) ?? "";
  return {
    added: newText ? newText.split("\n").length : 0,
    removed: oldText ? oldText.split("\n").length : 0,
    measured,
  };
}

function langOf(path: string | undefined): string {
  const ext = path?.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", h: "cpp", c: "c",
    ts: "typescript", tsx: "typescript", js: "javascript", py: "python",
    json: "json", yaml: "yaml", yml: "yaml", sh: "bash", sql: "sql",
    md: "markdown", cmake: "cmake",
  };
  return map[ext] ?? "";
}
