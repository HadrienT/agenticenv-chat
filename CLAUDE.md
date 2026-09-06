# agenticenv-chat — notes pour Claude Code

Extension VS Code : un panneau de chat pour un agent **OpenHands local**, façon
Copilot Chat / Claude Code. Elle ne fait rien seule — elle est cliente du serveur
WebSocket **`openhands-bridge`**.

**Repo jumeau** : [`AgenticEnv`](https://github.com/HadrienT/AgenticEnv) — le
bridge, l'adaptateur OpenHands, la sandbox Docker, `llama-server`. Les deux
évoluent ensemble. Le contrat du fil bridge vit dans
`AgenticEnv/packages/openhands-bridge/src/openhands_bridge/protocol.py` ;
`src/protocol.ts` en est le **miroir manuel** (test de dérive
`test/discipline/protocol-drift.test.ts`, qui a besoin d'`AgenticEnv` clôné à côté).

## Suivi du travail — GitHub Issues, pas de markdown de handoff

Le « JIRA » du projet, ce sont les **GitHub Issues des deux repos**. `gh` est
authentifié (compte `HadrienT`).

- **Au démarrage d'une session** : `gh issue list --state open` sur **ce repo** ET
  sur `HadrienT/AgenticEnv`. Chaque repo a une issue épinglée **`📋 Board`** qui
  agrège tout (agenticenv-chat#3, AgenticEnv#9).
- **Une tâche ou un bug qui concerne l'autre repo** →
  `gh issue create --repo HadrienT/AgenticEnv …`. **Jamais** un fichier markdown
  de passation.
- **Issue traitée** → `gh issue close <n> --repo … --comment "fait dans <sha>"`,
  et cocher la case correspondante dans le Board.
- **Labels** : `cross-repo` (coordination), `blocked` (attend l'autre repo),
  `needs-verification` (code fait, reste un test manuel), `from-bridge` /
  `from-client`.
- Les gros morceaux de **conception** restent dans `blueprint/wp/*.md` ; l'issue y
  renvoie, elle ne les remplace pas.

## Commandes

| | |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (src + tests) |
| `npm run lint` | eslint |
| `npm test` | vitest — inclut les tests de discipline (dérive protocole, routeurs exhaustifs, hygiène) |
| `npm run build` | esbuild |
| `npm run package` | build production + `vsce package` → `agenticenv-chat-<v>.vsix` |

Installer le `.vsix` : `code --install-extension agenticenv-chat-<v>.vsix --force`
puis *Developer: Reload Window*.

## Divers

- **Conversation avec le mainteneur : en français.** Code, identifiants, messages
  de commit : en anglais. `blueprint/` est en français.
- Toute évolution de `src/protocol.ts` doit rester alignée avec le `protocol.py`
  du bridge — si le bridge n'a pas encore un message, l'ajouter à
  `CLIENT_AHEAD_OF_BRIDGE` et ouvrir une issue `from-client` sur `AgenticEnv`.
- Commits : passer par une branche, pas directement sur `main`. Terminer les
  messages de commit par `Co-Authored-By: Claude <noreply@anthropic.com>`.
