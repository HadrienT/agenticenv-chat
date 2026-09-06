# AgenticEnv Chat

> **This extension requires [AgenticEnv](https://github.com/HadrienT/AgenticEnv).**
> It is a client for the `openhands-bridge` WebSocket server and does nothing
> without it — there is no hosted backend.

A VS Code chat panel for a **local OpenHands agent** running in the AgenticEnv
workshop — a self-hosted alternative to GitHub Copilot Chat / Claude Code's
panel, backed by a local `llama-server` and a Dockerised OpenHands `agent-server`
sandbox. It talks to the **`openhands-bridge`** WebSocket server
(`packages/openhands-bridge` in the AgenticEnv repo), which owns the sandbox
lifecycle and streams events.

## Features

- **Chat panel** in the sidebar (or its own editor tab): streaming replies,
  per-tool rendering, syntax-highlighted code with Copy / Insert / New file / Run
  actions, markdown sanitised against an allowlist.
- **Turn lifecycle**: real `turn_started`/`turn_finished` boundaries, Stop button,
  incremental streaming, optimistic "sending…".
- **Context**: `#`-references (files, selection, symbols, diagnostics, terminal,
  git), `/`-commands, prompt history, an auto-attached active file/selection.
- **Edits**: files-changed panel with per-file diffs, `revert hunk` / `Undo turn`,
  gutter decorations, host-side git checkpoints (invisible dangling refs).
- **Permissions**: informative approval cards (exact command + cwd + diff),
  `Edit…` / `Allow always…`, a pure policy engine (`deny` always wins, chained
  commands never auto-approved, sensitive files never auto-attached).
- **Instructions**: `AGENTS.md` / `.agenticenv/{instructions,prompts,modes}`,
  hot-reloaded, Workspace-Trust gated; `/remember`; client-side hooks (settings
  only, never the repo).
- **Sessions**: durable conversation archive, full-text history search, edit &
  resend / truncate with branch history, export to Markdown/JSON.
- **Context budget**: gauge visible before the first turn, `/compact`, compaction
  marker, configurable status-bar item.
- **Agent loop**: agent-produced todo panel, Ask / Agent / Plan mode selector
  (Ask & Plan force read-only), mid-turn interruption, iteration-cap continuation.
- **Model selector** (when the bridge exposes `models`).
- **Editor hooks**: "Fix with agent" / "Explain this error" on diagnostics, a ✨
  commit-message button in Source Control, a terminal-command generator,
  keyboard shortcuts, screen-reader phase announcements.
- **Components panel**: live status of the bridge, `llama-server`, the
  `llama-bridge` proxy, Docker, the pinned `agent-server` image and the GPU, with
  inline start/stop/restart/pull.

Several features have a **bridge half that AgenticEnv must still ship** — they are
gated on capability negotiation and inert until then. See "Bridge dependencies".

## Requirements

- VS Code ≥ 1.93
- The AgenticEnv bridge running: `just run-bridge` (defaults to `ws://127.0.0.1:8300`).
- Node.js ≥ 20 to build the extension.

## Install

Not published on the Marketplace: it needs a local bridge that has no public
reproducible install yet, so it would be unusable for most people. Build a
`.vsix` and install it:

```bash
npm install && npm run package     # produces agenticenv-chat-<version>.vsix
code --install-extension agenticenv-chat-*.vsix
```

## Develop

```bash
npm install
npm run build          # or: npm run watch
npm run typecheck      # tsc on src + test
npm run lint
npm test               # vitest: unit, render, discipline, fake-bridge integration
# then press F5 in VS Code ("Run Extension")
```

## Settings

| Key | Default | What it does |
|---|---|---|
| `agenticenvChat.bridgeUrl` | `ws://127.0.0.1:8300` | WebSocket URL of `openhands-bridge`. |
| `agenticenvChat.agenticEnvPath` | `~/AgenticEnv` | AgenticEnv checkout, used by the Components panel. |
| `agenticenvChat.logLevel` | `info` | Output-channel verbosity; `trace` shows every bridge frame. |
| `agenticenvChat.thread.expandThinking` | `false` | Expand the agent's reasoning blocks by default. |
| `agenticenvChat.edits.autoOpen` | `never` | Open files the agent edits: `never` / `first` / `all` (≤ 10). |
| `agenticenvChat.edits.decorations` | `true` | Gutter mark on lines changed this turn. |
| `agenticenvChat.hooks` | `{}` | Client-side hooks (settings only, never the repo). |
| `agenticenvChat.notifications` | `awaiting` | When to notify: `never` / `awaiting` / `always`. |
| `agenticenvChat.permissions` | `{ mode: "ask", … }` | Approval policy (`deny` always wins; the allowlist guards against accidents, not attackers). |
| `agenticenvChat.editor.autoSendCodeActions` | `false` | Send code-action messages immediately instead of only prefilling. |
| `agenticenvChat.scm.commitStyle` | `conventional` | Style passed when generating a commit message. |
| `agenticenvChat.defaultContextWindow` | `32768` | Assumed context window for the gauge before the bridge reports one. |
| `agenticenvChat.statusBar.hidden` / `.format` | `false` / template | The status-bar item.

## Layout

| Path | Role |
|---|---|
| `src/extension.ts` | `activate`/`deactivate` and command registration only |
| `src/chatViewProvider.ts` | webview view provider: HTML+CSP, host↔webview routing, bridge lifecycle, health polling |
| `src/bridgeClient.ts` | WebSocket client to `openhands-bridge` (auto-reconnect) |
| `src/protocol.ts` | TypeScript mirror of the bridge wire protocol (`openhands_bridge/protocol.py`) |
| `src/messages.ts` | internal host↔webview contract (separate from the bridge wire) |
| `src/paths.ts` | the single sandbox↔host path translator |
| `src/logging.ts` | "AgenticEnv Chat" output channel, levels, secret redaction |
| `src/webview/store/` | pure reducer + state machine, selectors, persistence, dispatch |
| `src/webview/theme/` | `tokens.css` (the only place a hex appears) + `base.css` |
| `src/webview/views/` | composition-only React views (thread, composer, panels) |
| `test/` | vitest suite: `unit/`, `render/`, `discipline/`, `fake-bridge/`, `integration/` |

## Roadmap

The full development plan lives in [`blueprint/`](blueprint/README.md): 15 work
packages (`C00`–`C14`) with their dependencies, acceptance criteria and the list
of bridge-side changes they need from AgenticEnv.

- [`docs/parity-copilot-claude-code.md`](docs/parity-copilot-claude-code.md) —
  catalogue of 124 numbered Copilot / Claude Code behaviours; every work package
  declares which numbers it covers.
- [`blueprint/00-PRIMER.md`](blueprint/00-PRIMER.md) — read this first.

See [`blueprint/PROGRESS.md`](blueprint/PROGRESS.md) for what each work package
shipped and what it deferred.

## Bridge dependencies (AgenticEnv)

Full wire spec for the bridge side: **[`docs/bridge-v2-spec.md`](docs/bridge-v2-spec.md)**
— every message, capability, SDK mapping and an incremental delivery plan.

These are coded on the client and gated on capability negotiation; they stay
inert until `packages/openhands-bridge` catches up (tracked in
`src/protocol.ts` → `CLIENT_AHEAD_OF_BRIDGE`):

- v2 negotiation, turn boundaries, `event_delta`, `cancel_turn`, `resume`, `seq`
- `pending_action` payload, `request_diff` / `file_diff`, `checkpoint`
- `context_stats`, `history_compacted`, `compact`
- `todo`, `interrupt`
- `models` / `set_model` / `list_models`; MCP reachable from the sandbox
- a real read-only sandbox mode (Ask / Plan currently force `readOnly` client-side)
