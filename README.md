# AgenticEnv Chat

A VS Code chat panel for a local coding agent: a self-hosted alternative to the
GitHub Copilot and Claude Code panels, backed by `llama-server` and an OpenHands
agent running in a disposable Docker sandbox.

**[How it works: interactive map](https://hadrient.github.io/atlas-pages/agenticenv-chat/)**

[![CI](https://github.com/HadrienT/agenticenv-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/HadrienT/agenticenv-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![VS Code](https://img.shields.io/badge/VS%20Code-1.134%2B-007ACC)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

> **This extension requires [AgenticEnv](https://github.com/HadrienT/AgenticEnv).** It
> is a client for AgenticEnv's `openhands-bridge` WebSocket server, which owns the
> sandbox and streams events. There is no hosted backend.

## Features

- **Chat**: streaming replies, per-tool rendering, syntax-highlighted code with Copy,
  Insert, New file and Run actions, and markdown sanitized against an allowlist.
- **Context**: `#` references (files, selection, symbols, diagnostics, terminal, git),
  `/` commands, and a context gauge with `/compact`.
- **Edits**: per-file diffs, revert by hunk, Undo turn, gutter marks, and host-side git
  checkpoints.
- **Permissions**: approval cards showing the exact command, working directory and
  diff. A pure policy engine decides: `deny` always wins and chained commands are
  never auto-approved.
- **Agent modes**: Ask, Agent and Plan, a todo panel, and mid-turn interruption.
- **Instructions**: `AGENTS.md` and `.agenticenv/` files, hot-reloaded and gated by
  Workspace Trust.
- **Sessions**: durable archive, full-text history search, edit and resend with branch
  history, and export to Markdown or JSON.
- **Editor integration**: "Fix with agent" on diagnostics, commit message generation,
  and a terminal command generator.
- **Components panel**: live status of the bridge, `llama-server`, Docker, the agent
  image and the GPU, with inline controls and a selector for the served model.

A few features need a bridge capability that is not shipped yet, such as session
resume. They are gated on capability negotiation and stay inert until then.

## Install

Requires VS Code 1.134 or later, Node.js 20 or later, and the AgenticEnv bridge
(`just run-bridge`, on `ws://127.0.0.1:8300` by default).

It is not on the Marketplace, because it depends on a local bridge. Build a `.vsix`:

```bash
npm install && npm run package
code --install-extension agenticenv-chat-*.vsix
```

The main settings are `agenticenvChat.bridgeUrl`, `agenticenvChat.agenticEnvPath` and
`agenticenvChat.permissions`. All of them are listed in the VS Code Settings UI.

## Development

```bash
npm install
npm run build          # or: npm run watch
npm run typecheck
npm run lint
npm test               # unit, render, discipline and fake-bridge integration tests
```

Press F5 in VS Code to launch the extension.

| Path | Role |
|---|---|
| `src/extension.ts` | Activation and command registration only |
| `src/chatViewProvider.ts` | Webview provider: CSP, routing, bridge lifecycle |
| `src/bridgeClient.ts` | WebSocket client with auto-reconnect |
| `src/protocol.ts` | TypeScript mirror of the bridge protocol, guarded by a drift test |
| `src/paths.ts` | The single sandbox-to-host path translator |
| `src/webview/` | Pure reducer and state machine, composition-only React views |
| `test/` | `unit/`, `render/`, `discipline/`, `fake-bridge/`, `integration/` |

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md): what shipped
- [`docs/bridge-v2-spec.md`](docs/bridge-v2-spec.md): wire protocol
- [`docs/parity-copilot-claude-code.md`](docs/parity-copilot-claude-code.md): catalogue
  of 124 Copilot and Claude Code behaviors used as the target
- [`blueprint/`](blueprint/README.md): development plan

## License

[MIT](LICENSE)
