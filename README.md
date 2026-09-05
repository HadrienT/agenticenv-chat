# AgenticEnv Chat

A VS Code chat panel for a **local OpenHands agent** running in the
[AgenticEnv](https://github.com/HadrienT/AgenticEnv) workshop — a self-hosted
alternative to GitHub Copilot Chat / Claude Code's panel, backed by a local
`llama-server` and a Dockerised OpenHands `agent-server` sandbox.

It talks to the **`openhands-bridge`** WebSocket server (`packages/openhands-bridge`
in the AgenticEnv repo), which owns the sandbox lifecycle and streams events.

## Features (Phase 1)

- Chat panel in the VS Code sidebar, streaming the agent's replies and tool calls.
- List of files the agent changed in the sandbox workspace.
- Context / token-usage gauge and accumulated cost.
- MCP server picker shown before starting a session *(the list is real; actually
  wiring MCP into the sandbox is Phase 2 — see AgenticEnv `blueprint/wp/WP08b` §7)*.
- "Risky action" confirmation cards (Allow / Reject) — the agent pauses and waits.
- **Components panel**: live status of everything the chat needs — the bridge,
  `llama-server` (unit + `/v1/models` readiness), the `llama-bridge` proxy, Docker,
  the pinned `agent-server` image, and GPU (with a contention warning). Inline
  buttons run the start/stop/restart/pull command in an `AgenticEnv` terminal
  (the `systemctl` ones will prompt for `sudo`).

## Requirements

- VS Code ≥ 1.90
- The AgenticEnv bridge running: `just run-bridge` (defaults to `ws://127.0.0.1:8300`).
- Node.js ≥ 20 to build the extension.

## Develop

```bash
npm install
npm run build          # or: npm run watch
npm run typecheck      # tsc on src + test
npm run lint
npm test               # vitest: unit, render, discipline, fake-bridge integration
# then press F5 in VS Code ("Run Extension")
```

Set `agenticenvChat.bridgeUrl` if the bridge isn't on the default port. Set
`agenticenvChat.logLevel` to `trace` to see every bridge frame in the
"AgenticEnv Chat" output channel.

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

Near-term milestones:

- **C00 → C01**: real turn lifecycle (`turn_started`/`turn_finished`), Stop button,
  incremental streaming — replaces today's heuristic turn tracking.
- **C02 → C05**: markdown + syntax-highlighted code + per-tool rendering — the
  biggest visual gap with Copilot Chat.
- **Phase 2** (C12): MCP servers actually reachable from inside the sandbox.
- **Phase 3**: structured multiple-choice questions from the agent (needs a custom
  `agent-server` image), replacing the Allow/Reject-only confirmation.
