# agenticenv-chat — notes for Claude Code

VS Code extension: a chat panel for a **local OpenHands** agent, in the style of Copilot Chat /
Claude Code. It does nothing alone: it is a client of the **`openhands-bridge`** WebSocket
server.

**Twin repository**: [`AgenticEnv`](https://github.com/HadrienT/AgenticEnv): the bridge, the
OpenHands adapter, the Docker sandbox, `llama-server`. The two evolve together. The bridge wire
contract lives in `AgenticEnv/packages/openhands-bridge/src/openhands_bridge/protocol.py`;
`src/protocol.ts` is its **manual mirror** (drift test
`test/discipline/protocol-drift.test.ts`, which needs `AgenticEnv` cloned alongside).

## Tracking work: GitHub Issues, no handoff markdown

The project's "JIRA" is the **GitHub Issues of both repositories**. `gh` is authenticated
(account `HadrienT`).

- **At the start of a session**: `gh issue list --state open` on **this repository** AND on
  `HadrienT/AgenticEnv`. Each repository has a pinned **`📋 Board`** issue that aggregates
  everything (agenticenv-chat#3, AgenticEnv#9).
- **A task or bug concerning the other repository** →
  `gh issue create --repo HadrienT/AgenticEnv …`. **Never** a markdown handoff file.
- **Issue handled** → `gh issue close <n> --repo … --comment "done in <sha>"`, and tick the
  matching box in the Board.
- **Labels**: `cross-repo` (coordination), `blocked` (waiting on the other repository),
  `needs-verification` (code done, a manual test remains), `from-bridge` / `from-client`.
- Large pieces of **design** stay in `blueprint/wp/*.md`; the issue points to them, it does not
  replace them.

## Commands

| | |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (src + tests) |
| `npm run lint` | eslint |
| `npm test` | vitest, including the discipline tests (protocol drift, exhaustive routers, hygiene) |
| `npm run build` | esbuild |
| `npm run package` | production build + `vsce package` → `agenticenv-chat-<v>.vsix` |

Install the `.vsix`: `code --install-extension agenticenv-chat-<v>.vsix --force`, then
*Developer: Reload Window*.

## Miscellaneous

- **Language: English by default.** Everything you produce is in English: code, identifiers, comments, commit messages, PRs, issues, documentation and interface text. The only exception is the conversation: reply in the language the maintainer writes in, so in French when they write in French. `blueprint/` is historically in French: new content there is in English too.
- Any change to `src/protocol.ts` must stay aligned with the bridge's `protocol.py`: if the
  bridge does not have a message yet, add it to `CLIENT_AHEAD_OF_BRIDGE` and open a
  `from-client` issue on `AgenticEnv`.
- Commits: go through a branch, not directly on `main`. End commit messages with
  `Co-Authored-By: Claude <noreply@anthropic.com>`.
