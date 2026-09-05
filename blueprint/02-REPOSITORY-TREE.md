# 02 — Arborescence cible

**Lire si** vous créez un fichier. La colonne « WP » dit qui crée quoi.

Aujourd'hui le repo tient en 6 fichiers (1552 lignes) dont deux gros
(`components.tsx` 480, `App.tsx` 295). La cible ci-dessous est le découpage
qu'introduit **C00**, puis que chaque WP remplit.

---

## 1. Racine

```
agenticenv-chat/
├── blueprint/                  ← ce dossier
├── docs/
│   └── parity-copilot-claude-code.md   ← catalogue des 124 items
├── media/icon.svg
├── src/                        ← voir §2
├── test/                       ← voir §4
├── esbuild.mjs
├── package.json
├── tsconfig.json
└── .eslintrc.json
```

## 2. `src/` — hôte d'extension

| Fichier | Responsabilité | WP |
|---|---|---|
| `extension.ts` | `activate`, enregistrement des commandes et providers. **Rien d'autre** — aujourd'hui il fait aussi provider, santé, terminal ; C00 le dégraisse. | C00 |
| `chatViewProvider.ts` | `WebviewViewProvider` : HTML+CSP, routage `WebviewToHost`, cycle de vie du bridge | C00 |
| `bridgeClient.ts` | client WS, reconnexion à backoff, file d'envoi tant que le socket n'est pas ouvert | C00, C01 |
| `protocol.ts` | miroir TS de `openhands_bridge/protocol.py` (v2) | C01 |
| `messages.ts` | contrat `HostToWebview` / `WebviewToHost` (séparé du protocole bridge) | C00 |
| `paths.ts` | **unique** traducteur sandbox↔hôte (01-ARCHITECTURE §5) | C00 |
| `health.ts` | sondes système + `actionCommand` (existe déjà) | — |
| `logging.ts` | `OutputChannel` « AgenticEnv Chat », niveaux, redaction | C00 |
| **`context/`** | | |
| `context/index.ts` | résout un `ContextRef[]` en `ResolvedContext[]`, applique le budget | C04 |
| `context/files.ts` | fichier actif, sélection, fichiers récents, quick-pick de recherche | C04 |
| `context/symbols.ts` | `executeWorkspaceSymbolProvider`, définition d'un symbole | C04 |
| `context/diagnostics.ts` | `languages.getDiagnostics`, condensation | C04 |
| `context/terminal.ts` | dernière commande + sortie, sélection terminal | C04 |
| `context/git.ts` | branche, statut, diff, derniers commits (API de l'extension Git) | C04 |
| `context/ignore.ts` | `.gitignore` + `.agenticenvignore`, filtrage des secrets | C04, C07 |
| **`edits/`** | | |
| `edits/checkpoints.ts` | snapshot avant tour, restauration, purge | C06 |
| `edits/diff.ts` | diff unifié → modèle de hunks ; application/annulation par hunk | C06 |
| `edits/decorations.ts` | décorations de gouttière sur les lignes touchées | C06 |
| `edits/openDiff.ts` | ouverture d'un diff virtuel (`TextDocumentContentProvider`) | C06 |
| **`permissions/`** | | |
| `permissions/policy.ts` | évaluation allowlist/denylist, modes d'auto-approbation | C07 |
| `permissions/store.ts` | persistance `workspaceState`, import/export | C07 |
| `permissions/sensitive.ts` | détection `.env`, clés, commandes destructrices | C07 |
| **`sessions/`** | | |
| `sessions/store.ts` | persistance des conversations dans `storageUri` | C08 |
| `sessions/export.ts` | export markdown / json | C08 |
| **`instructions/`** | | |
| `instructions/loader.ts` | `CLAUDE.md`, `.github/copilot-instructions.md`, `*.instructions.md` | C10 |
| `instructions/prompts.ts` | `*.prompt.md` → `/`-commandes | C10 |
| **`editor/`** | | |
| `editor/inlineChat.ts` | widget Ctrl+I dans l'éditeur | C11 |
| `editor/codeActions.ts` | « Fix with agent » sur diagnostics, CodeLens | C11 |
| `editor/scm.ts` | message de commit, description de PR | C11 |
| `editor/terminalChat.ts` | Ctrl+I dans le terminal | C11 |
| `statusBar.ts` | modèle, contexte restant, coût | C13 |

## 3. `src/webview/` — UI

| Fichier | Responsabilité | WP |
|---|---|---|
| `index.tsx` | montage React | — |
| `App.tsx` | **composition seulement** : lit le store, place les vues. Aucune logique. | C00 |
| `vscodeApi.ts` | `acquireVsCodeApi`, `post`, `getState`/`setState` | C00 |
| **`store/`** | | |
| `store/reducer.ts` | machine à états (01-ARCHITECTURE §3) | C00 |
| `store/types.ts` | `ChatItem`, `SessionPhase`, `Attachment`… | C00 |
| `store/selectors.ts` | dérivations mémorisées (peut-on envoyer ? item courant ?) | C00 |
| `store/persist.ts` | sérialisation vers `setState`, hydratation, versionnage | C00 |
| **`theme/`** | | |
| `theme/tokens.css` | **seul** endroit où un hex apparaît (fallbacks) | C00 |
| `theme/base.css` | reset, typographie, densité, media queries de largeur | C00, C14 |
| **`render/`** | pur : donnée → JSX | |
| `render/Markdown.tsx` | markdown assaini, streaming-safe | C02 |
| `render/CodeBlock.tsx` | coloration + barre d'outils | C02 |
| `render/Diff.tsx` | diff unifié coloré, repliable par hunk | C02, C06 |
| `render/Mermaid.tsx` | diagrammes | C02 |
| `render/Math.tsx` | KaTeX | C02 |
| `render/FileLink.tsx` | `chemin:ligne` cliquable | C02 |
| **`views/`** | | |
| `views/Thread.tsx` | liste virtualisée du fil, ancrage bas | C02, C14 |
| `views/items/*.tsx` | un composant par type d'item (message, outil, diff, todo, erreur) | C02, C05, C06, C09 |
| `views/composer/*.tsx` | zone de saisie, chips, menus `/` et `#`, pièces jointes | C03 |
| `views/panels/Health.tsx` | panneau Components (déplacé depuis `components.tsx`) | C00 |
| `views/panels/WorkingSet.tsx` | fichiers modifiés + actions | C06 |
| `views/panels/Todo.tsx` | plan / liste de tâches | C09 |
| `views/ConfirmCard.tsx` | approbation détaillée | C07 |
| `views/ContextGauge.tsx` | budget de contexte | C13 |
| **`tools/`** | | |
| `tools/registry.tsx` | `toolName → renderer`, avec repli générique | C05 |
| `tools/renderers/*.tsx` | un fichier par outil connu (`bash`, `str_replace_editor`, `read`, …) | C05 |

> `src/webview/components.tsx` **disparaît** en C00 : son contenu est réparti
> entre `theme/`, `render/`, `views/` et `views/panels/Health.tsx`. Le dossier
> vide `src/webview/components/` est supprimé (remplacé par `views/`).

## 4. `test/`

| Chemin | Contenu | WP |
|---|---|---|
| `test/unit/**` | réducteur, sélecteurs, `paths.ts`, `policy.ts`, parseurs | C00+ |
| `test/render/**` | rendu des composants purs (Testing Library, jsdom) | C02+ |
| `test/discipline/**` | règles de frontière et d'hygiène (05-TESTING §5) | C00 |
| `test/fixtures/events/*.json` | vrais `Event.model_dump()` capturés depuis le bridge | C00 |
| `test/fake-bridge/server.ts` | faux bridge WS rejouant un scénario | C00 |
| `test/e2e/**` | `@vscode/test-electron` : ouvre une vraie fenêtre | C14 |

## 5. Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichier de composant | `PascalCase.tsx` | `CodeBlock.tsx` |
| Fichier de module | `camelCase.ts` | `checkpoints.ts` |
| Commande VS Code | `agenticenvChat.<verbe><Objet>` | `agenticenvChat.restoreCheckpoint` |
| Réglage | `agenticenvChat.<domaine>.<clé>` | `agenticenvChat.permissions.mode` |
| Clé de contexte | `agenticenvChat.<état>` | `agenticenvChat.turnRunning` |
| Type de message | `camelCase` webview↔hôte, `snake_case` sur le fil bridge | `startSession` / `start_session` |
