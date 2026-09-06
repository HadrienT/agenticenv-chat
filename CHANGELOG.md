# Changelog

All notable changes to **AgenticEnv Chat**. Dates are the merge date of each
work package to `main`.

The extension is pre-1.0 and tracks the AgenticEnv bridge: features whose bridge
half is not yet shipped are gated on capability negotiation and inert against a
v1 bridge (listed in `src/protocol.ts` → `CLIENT_AHEAD_OF_BRIDGE`).

## [Unreleased]

### Fixes
- **v1 bridge — protocol mismatch is now silent.** A v1 bridge rejects each v2
  message (`hello`, `resume`, `list_models`, …) with `VALIDATION_ERROR`
  `union_tag_invalid`. These are now recognised (`src/negotiation.ts`) and
  swallowed regardless of negotiation state — the first one switches to degraded
  mode immediately (no 2 s wait, no notice), the rest are just logged.
  `list_models` is only sent after a `welcome` announcing `models`;
  `list_mcp_servers` (v1-safe) is always sent.
- **Unresumable sessions are dropped.** A stored conversation that can't be
  resumed (v1 has no `resume`, or `UNKNOWN_CONVERSATION`) is cleared and the
  webview returns to the session-picker — a visible composer now always means a
  live session. The composer is also locked while the bridge is disconnected.
- The Components "bridge" row reflects the live WebSocket connection
  (`BridgeClient.state`) instead of a raw TCP probe that made the `websockets`
  server log an ERROR on every health poll.
- **`llama-bridge` health**: it is socket-activated — once a connection hands the
  socket to `llama-bridge.service`, `.socket` goes `inactive` while the proxy
  runs. The check now looks at both units; the panel's stop/restart target
  `.service` (`restart llama-bridge.socket` fails while the service holds the fd).
- `@vscode/vsce` added to devDependencies so `npm run package` works out of the box.

### C14 — hardening (in progress)
- Actionable error notices: every known bridge error code (`BRIDGE_UNREACHABLE`,
  `SESSION_BUSY`, `PROJECT_READONLY`, `MODEL_UNAVAILABLE`, `DOCKER_DOWN`,
  `IMAGE_MISSING`, `GPU_CONTENTION`) carries at least one action; repeated errors
  are grouped (`×N`) instead of stacked.
- `Components` panel is store-controlled; "Open Components" from an error opens it.
- Responsive CSS: single-column layout under 280 px, centred reading column past
  700 px, wide content scrolls in its own container (never the body).
- Packaging: `keywords`, `bugs`, `galleryBanner`, `qna` in `package.json`;
  `.vscodeignore` excludes tests/sources/blueprint; README rewritten with a
  requirement callout, a settings table and the bridge-dependency list;
  this changelog.
- Deferred: thread virtualisation and in-thread search (native `Ctrl+F` covers
  the un-virtualised list for now); closure-review sweep.

### C11 — editor integration
- `CodeActionProvider` on diagnostics → "Fix with agent" / "Explain this error"
  (opens the panel prefilled; `agenticenvChat.editor.autoSendCodeActions`).
- Source Control ✨ `Generate Commit Message` (writes the box, never commits);
  `Generate Pull Request Description`; terminal command generator (inserted, not
  run).
- Context keys (`turnRunning`, `awaitingConfirmation`, `hasCheckpoint`) mirrored
  from the state machine; keybindings; palette filtered so no visible command
  fails.
- Screen-reader phase announcements; `prefers-reduced-motion`.

### C12 — model & session-mode selectors
- `list_models` / `set_model` / `models` protocol; gated `ModelPicker`
  (current model always visible, feeds the context gauge, switch refused mid-turn,
  written into the thread).
- Ask / Agent / Plan mode selector — Ask and Plan force `readOnly` host-side.
- MCP-reachability wiring stays on the AgenticEnv side.

### C09 — plan, todo, agent loop
- Agent-produced `todo` panel (never inferred, no empty panel).
- Plan mode + end-of-turn approval card.
- Mid-turn interruption (`interrupt` capability, or queued and sent at
  `turn_finished` — never a silent delay).
- Iteration-cap (`max_iterations`) continuation card.

### C13 — context budget & compaction
- Context gauge visible before the first turn; `context_stats` during the turn;
  tokens/s; `/compact`; always-visible compaction marker.
- Configurable status-bar item.

## Merged

- **C10** — repo instructions, reusable `.prompt.md` commands, project memory
  (`/remember`), client-side hooks, session modes.
- **C08** — durable conversation archive, full-text history search, edit &
  resend / truncate with branch history, export, notifications, activity badge.
- **C07** — informative approval cards, pure host-side policy engine, sensitive
  files never auto-approved, destructive-command warnings, Workspace Trust.
- **C06** — files-changed panel, per-file unified diffs, `revert hunk` /
  `Undo turn`, gutter decorations, host-side git checkpoints.
- **C05** — per-tool rendering, action↔observation merge, tool grouping,
  used-references summary.
- **C04** — context providers (files, selection, symbols, diagnostics, terminal,
  git) resolved at send time, with a byte budget.
- **C03** — composer: chips, `#`-references, `/`-commands, prompt history.
- **C02** — markdown + DOMPurify allowlist + highlight.js, code blocks, link
  detection, truncation.
- **C01** — protocol v2 client: `hello`/`welcome`, turn boundaries, `event_delta`,
  `cancel_turn`, `tool_status`, `progress`, `seq`, `resume`; the definitive state
  machine.
- **C00** — foundations: pure reducer + state machine, `tokens.css`, `paths.ts`,
  `logging.ts`, versioned persistence, discipline test suite, CI.
