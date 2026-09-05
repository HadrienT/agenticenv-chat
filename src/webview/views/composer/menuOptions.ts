import type { ContextChip, FileHit, SlashCommand } from "../../../messages";

export const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "new", description: "Start a new session", source: "builtin", local: true },
  { name: "clear", description: "Clear the conversation", source: "builtin", local: true },
  { name: "stop", description: "Stop the current turn", source: "builtin", local: true },
  { name: "components", description: "Toggle the Components panel", source: "builtin", local: true },
  { name: "help", description: "Show composer shortcuts", source: "builtin", local: true },
];

const BUILTIN_NAMES = new Set(BUILTIN_COMMANDS.map((c) => c.name));

export function isKnownCommand(name: string, extra: SlashCommand[]): boolean {
  return BUILTIN_NAMES.has(name) || extra.some((c) => c.name === name);
}

export function slashMatches(query: string, extra: SlashCommand[]): SlashCommand[] {
  const seen = new Set<string>();
  return [...BUILTIN_COMMANDS, ...extra]
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .filter((c) => c.name.startsWith(query.toLowerCase()));
}

export interface MentionOption {
  label: string;
  detail: string;
  chip: ContextChip;
}

const SPECIAL: { key: string; label: string; make: () => ContextChip }[] = [
  {
    key: "problems",
    label: "#problems — diagnostics of the active file",
    make: () => ({ ref: { kind: "diagnostics", scope: "file" }, label: "diagnostics: file", estBytes: 3000 }),
  },
  {
    key: "terminal",
    label: "#terminal — last command + output",
    make: () => ({
      ref: { kind: "terminal", which: "lastCommand" },
      label: "terminal: last command",
      estBytes: 3000,
    }),
  },
  {
    key: "git",
    label: "#git — status + diff",
    make: () => ({ ref: { kind: "git", what: "diff" }, label: "git diff", estBytes: 4000 }),
  },
  {
    key: "selection",
    label: "#selection — current selection",
    make: () => ({ ref: { kind: "selection", uri: "", range: [0, 0] }, label: "selection", estBytes: 1000 }),
  },
];

export function mentionOptions(query: string, fileHits: FileHit[]): MentionOption[] {
  const q = query.toLowerCase();
  return [
    ...SPECIAL.filter((s) => s.key.startsWith(q)).map((s) => ({
      label: s.label,
      detail: "",
      chip: s.make(),
    })),
    ...fileHits.map((h) => ({
      label: h.rel,
      detail: "file",
      chip: { ref: { kind: "file" as const, uri: h.uri }, label: h.rel, estBytes: 0 },
    })),
  ].slice(0, 12);
}
