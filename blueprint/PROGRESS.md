# Suivi d'implémentation — branches `wp/C0X`

Journal de bord de l'implémentation autonome du blueprint. Mis à jour au fil de
l'eau. Chaque WP est développé sur sa branche `wp/C0X-slug`, mergée dans `main`
quand ses critères d'acceptation **automatisables** sont verts.

> **Limites de l'environnement d'implémentation** : pas de VS Code GUI (donc pas
> de vérification F5 ni de captures d'écran avant/après), pas d'accès à un bridge
> AgenticEnv réel (donc pas de fixtures capturées ni de commits croisés
> AgenticEnv ; les messages du protocole v2 sont codés côté client et testés
> contre le faux bridge). Ces points sont listés « à finir » par WP.

**État global (C14 clôturé)** : les 15 work packages `C00`–`C14` sont mergés dans
`main`. C01/C06/C07/C09/C12/C13 ont une **moitié AgenticEnv** en attente (bridge
v2 — voir `src/protocol.ts` → `CLIENT_AHEAD_OF_BRIDGE` et la section
« Bridge dependencies » du README). Différés côté client : Mermaid/KaTeX (C02),
`openInEditor` (C08), chat inline éditeur (C11), virtualisation + recherche
interne du fil (C14), extraction `EditsController` de `chatViewProvider.ts`.
270 tests ; bundle 460 Ko webview / 128 Ko extension. F5 reste à faire sur chaque
WP (pas de GUI ici).

| WP | Titre | Branche | État | Notes |
|---|---|---|---|---|
| C00 | Fondations | `wp/C00-foundations` | ✅ **fait** (commit `5353b2c`) | F5 + fixtures réelles à finir |
| C01 | Protocole v2 : tours, deltas, annulation | `wp/C01-turn-protocol` | ✅ **client fait** | moitié AgenticEnv (bridge v2) + F5 à finir |
| C02 | Rendu du fil (markdown, code, liens) | `wp/C02-thread-rendering` | ✅ **fait** (Mermaid/KaTeX différés) | F5 (thèmes) + fixture markdown réelle |
| C03 | Composer (chips, /-commandes, #-refs) | `wp/C03-composer` | ✅ **fait** | drag&drop + image différés ; F5 (ancrage menu) |
| C04 | Fournisseurs de contexte (hôte) | `wp/C04-context-providers` | ✅ **fait** | parties vscode non testées (F5/e2e) ; budget C13 |
| C05 | Rendu des appels d'outils | `wp/C05-tool-rendering` | ✅ **fait** | filtre sortie + renderers browser/apply_patch différés |
| C06 | Éditions, diffs, checkpoints | `wp/C06-edits-and-diffs` | ✅ **fait** | hors-git limité ; F5 ; extraire EditsController (C14) |
| C07 | Permissions, approbations | `wp/C07-permissions` | ✅ **fait** | `pending_action` bridge + F5 (persistance workspace) |
| C08 | Sessions, historique | `wp/C08-sessions` | ✅ **fait** | `openInEditor` différé ; F5 |
| C09 | Plan, todo, pilotage boucle agent | `wp/C09-agent-loop` | ✅ **client fait** | `todo`/`interrupt` = moitié AgenticEnv ; terminaux bg + suivi (31) différés ; F5 |
| C10 | Instructions, prompts, mémoire | `wp/C10-instructions` | ✅ **fait** | chip instructions à rendre ; F5 |
| C11 | Intégration éditeur & commandes | `wp/C11-editor-integration` | 🟡 **partiel** | code actions, SCM ✨, terminal, clés de contexte, raccourcis, a11y faits ; chat inline (89) + CodeLens (95) différés ; F5 |
| C12 | MCP opérationnel & sélection modèle | `wp/C12-mcp-models` | 🟡 **partiel (client)** | sélecteurs modèle/mode faits ; MCP réellement branché = AgenticEnv (non démarré) |
| C13 | Budget de contexte, compaction | `wp/C13-context-budget` | ✅ **client fait** | `context_stats`/`history_compacted`/`compact` = moitié AgenticEnv ; F5 |
| C14 | Robustesse, a11y, packaging | `wp/C14-hardening` | 🟡 **partiel** | erreurs actionnables, responsive, packaging, revue de clôture faits ; virtualisation + recherche interne différées |

Ordre d'exécution suivi : C00 → C01 → C02 → C05 → C04 → C03 → C06 → C07 → C08 →
C10 → C13 → C09 → C12 → C11 → C14 (chemin critique d'abord, cf. `blueprint/README.md`).

---

## C00 — Fondations ✅

Commit `5353b2c` sur `wp/C00-foundations`. Voir le détail dans le message de
commit et `blueprint/wp/C00-foundations.md` §9.

- Store pur + machine à états, `theme/tokens.css`, `paths.ts`, `logging.ts`,
  `messages.ts`, persistance versionnée, `chatViewProvider.ts` extrait.
- 59 tests (unit / render / discipline ×11 / intégration faux bridge), CI.
- **À finir avant merge dans main** : F5 (5 écrans, thèmes, reload fenêtre) ;
  fixtures `test/fixtures/events/` capturées d'un vrai bridge.

## C01 — Protocole v2 ✅ (client)

Branche `wp/C01-turn-protocol`. Items catalogue 19, 20, 38, 39, 110, 112.

**Fait (client, testé contre le faux bridge)** :
- `protocol.ts` v2 : `hello`/`welcome`, `turn_started`/`turn_finished`,
  `event_delta`, `cancel_turn`, `tool_status`, `progress`, `seq`, `resume`/`resumed`.
- Négociation `hello` avec repli v1 dégradé après 2 s (bannière).
- Machine à états définitive : `idle ↔ running` **uniquement** sur `turn_*`
  (invariants I1–I6 tous actifs). `pendingSend` pour l'optimisme (item 112).
- Deltas concaténés + coalescés sur `requestAnimationFrame` ; `event` final
  écrase ; delta en retard ignoré.
- Bouton Stop (`cancel_turn` avec `turn_id` tenu par l'hôte) ; `cancelling` sans
  timeout ; second clic → « Force new session ».
- `tool_status` → ⟳/✓/✗ sur l'item outil ; `progress` → ligne d'état (jamais
  inventée, P3).
- File d'envoi `BridgeClient.enqueue()` : `hello`/`resume`/`list_mcp_servers`
  bufferisés et rejoués à l'ouverture ; `user_message`/`start_session`/`confirm`/
  `cancel_turn` restent stricts + notice.
- `resume {conversation_id, last_seq}` à la reconnexion ; `seq` + `conversationId`
  persistés en `workspaceState` (survivent au reload de fenêtre).
- `PERSIST_VERSION` 1 → 2 (forme `ChatItem`/`AppState` changée).

**Reste (hors de portée ici)** :
- Moitié AgenticEnv : implémenter les messages v2 dans
  `packages/openhands-bridge` puis vider `CLIENT_AHEAD_OF_BRIDGE` dans
  `src/protocol.ts` (commits croisés). Le bridge local est encore v1 — le test de
  dérive le confirme et tolère l'écart.
- F5 : streaming sans flash, reload en plein tour, Stop réel contre un bridge v2.

## C02 — Rendu du fil ✅

Branche `wp/C02-thread-rendering`. Items 21–29, 32–34, 44.

**Fait** :
- `render/markdownRender.ts` : markdown-it (`html:false`) + DOMPurify (allowlist
  de balises/attributs/schémas d'URL). Post-traitement pur pour les liens
  `path:line` hors `<a>/<code>/<pre>`.
- `render/highlight.ts` : highlight.js, sous-ensemble
  (cpp, c, cmake, diff, json, yaml, bash, python, ts, js, sql, markdown) + alias.
- `render/blocks.ts` : découpe prose / blocs de code de 1er niveau, parse
  l'info-string (`lang path= title=`), gère le bloc non fermé (streaming).
- `render/truncate.ts` : troncature > 200 lignes / 20 Kio, tête+queue,
  « Open in editor » au-delà de 2000.
- `render/Markdown.tsx` (pur), `views/RichText.tsx`, `views/CodeBlock.tsx`
  (barre Copy/Insert/New file/Run), `views/OutputBlock.tsx`,
  `views/items/{MessageItem,ThinkingItem}.tsx`, `views/Timestamp.tsx`.
- `views/threadContext.ts` : services du fil (open file, code actions, feedback)
  passés par contexte plutôt qu'en cascade de props.
- Hôte : routes `openFile` (révélation de ligne), `copy`, `insertAtCursor`,
  `createFile` (untitled + langage), `runInTerminal` (confirmation modale en
  attendant C07), `feedback` → `sessions/feedback.ts` (`storageUri/feedback.jsonl`,
  **aucune télémétrie**). `workspace` porte désormais `sandboxRoot`,
  `editorAvailable`, `expandThinking`.
- Réglage `agenticenvChat.thread.expandThinking`.
- 96 tests (markdown/XSS/incomplet, CodeBlock, blocks, truncate). Bundle **411 Ko**.

**Différé (décision d'archi requise)** :
- **Mermaid (25)** : ~1 Mo, exige `import()` dynamique → code-splitting →
  incompatible avec le bundle **IIFE unique** (D2) et la **CSP nonce** (D6) sans
  élargir `script-src`. Bloc rendu en code brut.
- **KaTeX (26)** : ~300 Ko + polices woff2 à inliner. Maths rendues en `code`.
- Ces deux points demandent soit un passage de la webview en ESM + `script-src`
  élargi et argumenté, soit un WP dédié.

## C05 — Rendu des appels d'outils ✅

Branche `wp/C05-tool-rendering`. Items 30, 35, 36, 37, 40, 43, 45.

**Fait** :
- `tools/registry.tsx` + `tools/renderers/{fileEditor,terminal,search,generic}.tsx` :
  `rendererFor()` ne renvoie jamais `null`, repli générique garanti (JSON
  colorié, chaînes > 500 car. abrégées). Familles reconnues par nom exact +
  heuristique (les MCP tombent sur le repli).
- Noms d'outils **relevés** dans le venv AgenticEnv : `file_editor`, `terminal`,
  `grep`, `glob`, `apply_patch`, `task_tracker`, `browser`, `finish`.
- `render/lineDiff.ts` (LCS pur) + `render/Diff.tsx` : `+A −B`, source du compte
  signalée (`(est.)` vs mesuré).
- Fusion action ↔ observation par `tool_call_id` dans `reduceTurn.applyEvent` :
  un seul `ToolItem { args, observation, status }` ; observation orpheline
  rendue seule ; `AgentErrorEvent` apparié marque l'outil en erreur ; statut
  dérivé de `exit_code`/`error`.
- `views/ToolGroup.tsx` + `threadGroups.ts` : regroupement 3+ outils consécutifs
  même famille, replié sauf erreur, libellé dérivé.
- `views/UsedReferences.tsx` : « Used N references », plages fusionnées,
  reconstruit depuis les `view`.
- `views/FileRefList.tsx` : sortie grep/glob en liste cliquable `path:line`.
- Corps déplié d'office sur erreur ; tooltip args complets sur l'entête.
- 115 tests. Bundle 422 Ko.

**Différé** : filtre rapide sur sortie de commande (C05 §7) ; renderers
`apply_patch` / `browser` / `task_tracker` (repli générique) ; icônes codicon
(glyphes texte en attendant).

## C04 — Fournisseurs de contexte ✅

Branche `wp/C04-context-providers`. Items 2, 71–75, 79, 81.

- `context/index.ts` : `resolveRefs(refs, budget)` — résolution **à l'envoi**,
  un provider en échec renvoie un `ResolvedContext` d'erreur (ne bloque pas).
- `context/files.ts` : fichier actif (ignore éditeurs virtuels), sélection avec
  marge de 5 lignes, fichiers récents (`tabGroups`), recherche floue
  (`fuzzyScore` + `.gitignore` + exclusions).
- `context/symbols.ts` : définition du symbole (range + `#include` + classe
  englobante), pas le fichier entier.
- `context/diagnostics.ts` : `condense()` pur (groupé/trié, Error+Warning,
  plafond 50, cascade C++ dédupliquée).
- `context/terminal.ts` : `[À CONFIRMER]` levé — shell integration ≥ 1.93
  (`engines.vscode` → `^1.93.0`), `watchTerminals()` mémorise la dernière
  commande ; dégrade en « selection » sinon ; terminal AgenticEnv exclu.
- `context/git.ts` : `[À CONFIRMER]` levé — API `vscode.git` `getAPI(1)` ;
  status/diff/log ; binaires exclus ; dépôt absent = message.
- `context/ignore.ts` : `.gitignore` + `.agenticenvignore` + `SENSITIVE_GLOBS`
  toujours exclus de l'auto. Test « secret » sur `.env`.
- `context/budget.ts` : `allocate()` — chips explicites avant automatiques,
  part minimale garantie.
- Protocole hôte↔webview : `userMessage` porte `context: ContextRef[]` ;
  `searchFiles`/`fileResults`, `pickContext`/`attachContext`. Store :
  `composer.attachments: ContextChip[]` (persisté, `PERSIST_VERSION` 2→3).
- 134 tests.

**Reste** : parties touchant l'API VS Code non testables ici (F5 / e2e C14) ;
budget sur `context_window` réel = C13.

## C03 — Composer ✅

Branche `wp/C03-composer`. Items 1, 3–11, 14, 16, 18.

- `views/composer/` : `Composer.tsx` (orchestrateur), `ChipBar`, `Menu`
  (`SlashMenu`/`MentionMenu`), `BudgetMeter`, `StarterPrompts`,
  `composerParse.ts` (détection `#`/`/` sous le caret, pur),
  `menuOptions.ts`, `useHistoryNav.ts`.
- Store : `composer.{attachments,history}` + `autoContext`/`dismissedAuto` +
  `commands`/`starters`/`fileSearch`. `effectiveAttachments`/`budgetStatus`/
  `composerPlaceholder` selectors. `PERSIST_VERSION` 3→4.
- `#` : menu webview, `searchFiles` débouncé, jeton retiré du texte, contexte
  dans `context[]`. `/` : builtins (`new`/`clear`/`stop`/`components`/`help`),
  `/x` inconnu = texte, prompts MCP/`.prompt.md` = C10/C12.
- Auto-chips fichier actif + sélection ; retrait mémorisé.
- Historique de prompts (`↑`/`↓` sur champ vide, 50, persistant).
- `BudgetMeter` : seuils vs `context_window`, aucune troncature auto.
- Hôte : `sendAutoContext`, `starterPrompts()` (diagnostics/git réels),
  `runCommand`, `runPickContext` (quick-pick natif), `resolveCommand`.
- Effets de bord d'App extraits en hooks (`useHostMessages`, `usePersist`).
- 155 tests.

**Différé** : glisser-déposer (item 7), collage d'image (item 8 — pas de vision).

## C06 — Éditions, diffs, checkpoints ✅

Branche `wp/C06-edits-and-diffs`. Items 41, 46–53, 66, 102, 122.

- `edits/checkpoints.ts` : **stratégie A côté hôte** — `git stash create` au
  `turn_started` (commit dangling invisible), `git diff <sha>` = checkpoint →
  maintenant, restauration par fichier / par tour, détection de conflit par hash,
  purge 20 / 7 j. Hors-git : désactivé avec message clair.
- `edits/git.ts` (exec git minimal), `edits/openDiff.ts`
  (`TextDocumentContentProvider` `agenticenv-checkpoint:` + `vscode.diff`),
  `edits/decorations.ts` (gouttière du tour), `edits/hunkRevert.ts`
  (`WorkspaceEdit` annulable Ctrl+Z, refus si lignes décalées).
- `render/parseDiff.ts` : parseur unified pur (hunks, renommage, binaire,
  no-newline, multi-fichiers). `views/Diff.tsx` : replié > 40 lignes,
  `revert hunk` par hunk.
- `views/panels/WorkingSet.tsx` réécrit : « N files changed by this turn »,
  badges M/A/D, compteurs +/− paresseux, diff par fichier, `Undo turn`,
  `Open all` (≤ 10), stratégie affichée.
- Protocole : `request_diff`/`file_diff`/`checkpoint`/`restore_checkpoint`
  ajoutés à `CLIENT_AHEAD_OF_BRIDGE` (le chemin hôte-git ne les requiert pas).
  Messages hôte↔webview `workingSet`/`fileDiff`/`revert*`/`undoTurn`.
- Commandes `undoTurn`/`restoreCheckpoint`/`openTurnDiff`/`purgeCheckpoints` ;
  réglages `edits.autoOpen`, `edits.decorations`.
- 169 tests.

**Reste** : hors-git (besoin du message bridge `checkpoint`) ; F5 ;
`chatViewProvider.ts` ≈ 960 l. → extraire `EditsController` en C14.

## C07 — Permissions, approbations ✅

Branche `wp/C07-permissions`. Items 28, 42, 57–60, 107, 114.

- `permissions/policy.ts` : `evaluate()` **pur**. `deny` gagne toujours ;
  commande enchaînée (`CHAIN_CHARS`) jamais auto ; regex invalide → `invalidRules`
  (jamais `allow`) ; chemin sensible → `ask` même en `autoAll`.
  `destructiveMatches()` pour l'item 114.
- `permissions/store.ts` : politique effective (config `agenticenvChat.permissions`
  + `allow` session/workspace) ; `readOnly` forcé si `!isTrusted`.
- `permissions/synthesize.ts` : reconstruit `PendingActionView` depuis le dernier
  `ActionEvent` quand le bridge v1 n'envoie qu'`awaiting_confirmation` sans détail
  (`blind: true` si rien) ; `allowPatternFor` (premier mot ancré).
- `src/glob.ts` : `globToRegExp` pur partagé (dédup `ignore.ts` ↔ `policy.ts`).
- `ConfirmCard` réécrite : commande exacte + cwd + diff, `Edit…`,
  `Allow always…` (session/folder), focus sur Reject, aucun timeout.
- Hôte : `handlePendingAction` (évalue, auto-allow/deny + `permissionOutcome`,
  ou `pendingAction` → carte) ; `onConfirm` (`remember` → `addAllow`) ; Run passe
  par `evaluate()` ; `sendPermissionMode`.
- `package.json` : `capabilities.untrustedWorkspaces: "limited"`, réglage
  `agenticenvChat.permissions`, doc honnête (allowlist = accidents, pas attaquant).
- Store : `phase.awaiting.pending`, item `permission`, `state.permissions`,
  `reducePermission.ts`. `PERSIST_VERSION` 4→5.
- 207 tests (matrice mode×allow×deny, 16 vecteurs de contournement, destructif).

**Reste** : `pending_action` / `confirm_action{edited_command}` côté bridge
(`CLIENT_AHEAD`) ; F5 (persistance workspace, capture terminal réelle).

## C08 — Sessions, historique ✅

Branche `wp/C08-sessions`. Items 82–88, 90–93, 105, 106.

- `sessions/store.ts` : `ConversationStore` (`node:fs`, `rename` atomique),
  `storageUri/conversations/<id>.json` + `index.json` reconstructible, recherche
  plein texte, purge 100 / 90 j annoncée. `titleFrom` sans LLM.
- `sessions/export.ts` : `toMarkdown` (outils en `<details>`, chemins relatifs)
  + `toJson`.
- Webview : `useSnapshot` (envoi débouncé de `persistSnapshot` à l'hôte),
  `reduceThread.ts` (`truncateFrom`/`editMessage`/`restoreBranch`, `state.branches`,
  bloqué pendant `running`), `titleFor` selector, `views/ThreadBar.tsx`,
  actions Edit/Regenerate/Truncate au survol d'un message user.
- Hôte : `persistConversation`, `openHistory` (quick-pick + recherche),
  `restoreConversation` (relecture read-only), `exportConversation`,
  `maybeNotify` (item 106), `setBadge` (item 105).
- Commandes `agenticenvChat.history` / `exportConversation` ; réglage
  `agenticenvChat.notifications`.
- `PERSIST_VERSION` 5→6 (`branches`). 221 tests.

**Reste** : `openInEditor` (item 88, `WebviewPanel` + transfert d'état) ; F5.

## C10 — Instructions, prompts, mémoire ✅

Branche `wp/C10-instructions`. Items 15, 76–78, 117–119.

- `instructions/frontmatter.ts` : parseur minimal pur (`clé: valeur`, listes).
- `instructions/assemble.ts` : `assembleInstructions` pur — racines dans l'ordre,
  `applyTo` (match si un fichier attaché correspond), sans `applyTo` → ignoré +
  raison, plafond 16 Kio, bloc étiqueté par source.
- `instructions/prompts.ts` : `.prompt.md` → `PromptDef` ; `substitute`
  (`${arg}`/`${selection}`/`${file}`/`${workspaceFolder}`) + variables manquantes.
- `instructions/loader.ts` : chargement `AGENTS.md`/`CLAUDE.md`/
  `copilot-instructions.md` + `.agenticenv/{instructions,prompts,modes}` ;
  `FileSystemWatcher` hot-reload ; **Workspace Trust** (rien si non fiable) ;
  `remember()` → puce dans `AGENTS.md` avec confirmation modale.
- `instructions/hooks.ts` : hooks côté hôte (`onTurn*`/`onFilesChanged`/
  `onSessionStarted`), passent par `evaluate()`, jamais chargés du dépôt.
- `PermissionStore.setModeOverride` : un mode restreint, ne relâche jamais (`RANK`).
- Hôte : instructions `unshift`ées dans `context[]` (`kind:"instructions"`),
  `sendCommandsAndModes`, `resolvePromptCommand`, `applyMode`.
- Store : `state.modes`/`selectedMode`/`instructions`, item `hook`. McpPicker :
  sélecteur de mode. Builtin `/remember`. `PERSIST_VERSION` inchangé (nouveau
  kind d'item tolère l'ancien état... en fait 6→7 : bumpé).
- 231 tests.

**Reste** : rendre la chip « N instruction files » ; `context:` d'un prompt
n'attache pas encore les chips ; F5.

## C13 — Budget de contexte, compaction ✅ (client)

Branche `wp/C13-context-budget`. Items 65, 80, 108, 115, 120.

**Fait (client, testé contre le faux bridge)** :
- `protocol.ts` : `context_stats` (usage poussé **pendant** le tour, pas
  seulement à la fin), `history_compacted` (compaction faite par le bridge,
  résumé consultable), `compact` (le client ne résume **jamais** lui-même).
  Capability `compact`. Ajoutés à `CLIENT_AHEAD_OF_BRIDGE`.
- `messages.ts` : `metrics {contextWindow?, tokensPerSec?}` (hôte→webview,
  renseigne la jauge avant le premier tour + débit) ; `compact` (webview→hôte).
- Store : `UsageState.tokensPerSec`, `AppState.compacted`, `ChatItem` kind
  `compaction`. `reduceBridge` route `context_stats`/`history_compacted` ;
  `reduceHost` route `metrics`. `persist` dérive `compacted` du fil
  (`PERSIST_VERSION` inchangé — 8, déjà bumpé plus tôt dans la branche).
- `views/ContextGauge.tsx` réécrit : visible dès que la fenêtre est connue,
  trois zones (< 60 % / 60–85 % / > 85 %), tooltip de ventilation
  (fenêtre / attaché / historique), débit tokens/s, coût. En zone alerte :
  trois options concrètes (retirer des chips / `/compact` / nouvelle session),
  aucune imposée.
- `views/items/CompactionItem.tsx` : marqueur **toujours visible**
  « history compacted — N turns », résumé dépliable.
- `statusBar.ts` : `StatusBarItem` à droite (item 120), visible seulement en
  session. Modèle · contexte % · coût ; pendant un tour : spinner + durée
  écoulée ; en attente d'approbation : fond d'avertissement. Format
  `agenticenvChat.statusBar.format`, masquable via `statusBar.hidden`.
- Hôte : `StatusBar` câblé (`session_started`/`turn_started`/`turn_finished`/
  `usage`/`context_stats`/`pending_action`/mode) ; `usage` calcule le débit
  (`completion_tokens` / durée du tour) ; `metrics` poussé au `ready` et au
  `session_started`. Builtin `/compact` → message bridge (inerte si v1).
- Réglages `agenticenvChat.defaultContextWindow`, `statusBar.format`,
  `statusBar.hidden`. 238 tests. Bundle 449 Ko webview / 119 Ko extension.

**Reste** : moitié AgenticEnv (`context_stats`/`history_compacted`/`compact`
dans `packages/openhands-bridge`) ; F5 (statusline en thème clair, jauge en
plein tour, `/compact` réel).

## C09 — Plan, todo, pilotage de la boucle agent ✅ (client)

Branche `wp/C09-agent-loop`. Items 31, 54, 55, 56, 61, 62, 63, 67, 123, 124.

> Ce WP est le plus dépendant d'AgenticEnv : un todo ou un mode plan sont des
> comportements d'agent, pas des simulations client. Le client **affiche et
> pilote** ; le harness **produit**. Rien qui afficherait un panneau vide faute
> de support bridge.

**Fait (client, testé contre le faux bridge)** :
- `protocol.ts` : `todo {items:[{id,text,state}]}` (état **complet**, jamais un
  patch — le client n'infère aucune étape), `interrupt {turn_id, text}`,
  capability `interrupt`. Ajoutés à `CLIENT_AHEAD_OF_BRIDGE`.
- `messages.ts` : `todo` / `planMode` (hôte→webview) ; `interrupt` /
  `setPlanMode` / `continueTurn` (webview→hôte).
- **Panneau Todo** (`views/panels/TodoPanel.tsx`, items 54/124) : n'apparaît
  **qu'au premier `todo` reçu**, sinon absent. Étape active mise en évidence,
  clic → scroll vers `.agx-todo__item--active`. Étape `skipped` visible, barrée.
  Archivé au reload (`PERSIST_VERSION` 8→9).
- **Mode plan** (`ComposerFoot` sélecteur Plan/Agent, items 55/123) : côté hôte
  force `permissions.mode = readOnly` via `applyPermissionOverride()` — le plus
  strict de (`.mode.md`, plan) gagne ; protection **réelle** en attendant un mode
  sandbox, dit dans l'UI (`agx-planbanner`). `views/PlanApproval.tsx` : en fin de
  tour plan, « Approve & run » / « Edit plan » / « Keep planning », rien d'imposé.
- **Interruption** (item 61) : le composer reste actif pendant un tour ; `Send`
  devient `Send note`. Avec la capability `interrupt` → `interrupt {turn_id,text}`
  (« note added mid-turn »). Sans → mise en file hôte + item « queued — will be
  sent when the turn ends », envoyée comme `user_message` au `turn_finished`.
  **Jamais** de retard silencieux.
- **Cap d'itérations** (item 67) : `turn_finished{reason:"max_iterations"}` →
  carte `MaxIterationsItem` dans le fil (Continue / Continue with guidance… /
  Stop here). « Continue » envoie `Continue.` — ne reformule jamais la demande.
- 247 tests (`test/unit/agentLoop.test.ts`). Bundle 456 Ko webview / 120 Ko ext.
- Nettoyage taille : `App.tsx` → `views/ChatScreen.tsx` ; `Composer.tsx` →
  `ComposerFoot.tsx` + `composerKeys.ts` ; `reduceHost.ts` → `reduceHostAux.ts`.
  Tokens manquants `--agx-muted` / `--agx-warning` ajoutés à `tokens.css`
  (introduits sans définition en C13).

**Différé / moitié AgenticEnv** :
- Émission de `todo` et réception de `interrupt` côté `packages/openhands-bridge`
  (issues à ouvrir, cf. §1 du WP).
- **Questions de suivi** (item 31) : aucun message bridge défini dans
  03-PROTOCOL §2.3 → pas démarré (P1 : pas de génération côté client).
- **Terminaux d'arrière-plan** (item 62) : aucun message/capability bridge →
  panneau non créé (pas d'émulation par polling).
- **Changement de modèle en cours** (item 63) : sélecteur = C12 ; le garde
  « refusé pendant `running` » y sera ajouté.
- **Auto-correction** (item 56) : comportement d'agent, rien à coder côté client.
- F5 : todo live, bascule plan → tentative d'écriture refusée, interruption
  réelle contre un bridge v2.

## C12 — MCP opérationnel & sélection de modèle/mode 🟡 (client partiel)

Branche `wp/C12-mcp-models`. Items 12, 13, 121.

> Ce WP est **majoritairement côté AgenticEnv** : rendre les serveurs MCP
> joignables depuis le conteneur et exposer `models`/`set_model` dans le bridge.
> La part client faite ici est celle qui ne crée **aucune promesse vide** :
> sélecteurs gated, affichage de l'état réel.

**Fait (client, testé contre le faux bridge)** :
- `protocol.ts` : `list_models` / `set_model {model_id}` (client→bridge),
  `models {models:[{id,label,context_window,current,state?,error?}]}`
  (bridge→client). Ajoutés à `CLIENT_AHEAD_OF_BRIDGE`. `list_models` enqueué à
  la négociation.
- `messages.ts` : `models` / `sessionMode` (hôte→webview) ; `setModel` /
  `setSessionMode` (webview→hôte). `ModelView`, `SessionMode`.
- **Sélecteur de modèle** (`views/ModelPicker.tsx`, item 12) : n'apparaît que si
  le bridge a répondu à `list_models` (`state.models !== null`) — jamais de liste
  en dur. Modèle courant visible en permanence ; `context_window` du modèle
  courant **alimente la jauge C13** avant le premier `usage` (`applyModels`).
  Changement pendant `running` refusé (message clair). Rechargement : état
  `loading` → renvoi au panneau Components, pas de spinner ; `error` → message
  brut de `llama-server`. Un changement est **inscrit dans le fil**
  (`ChatItem` kind `model-switch`).
- **Sélecteur de mode** (`ComposerFoot`, item 13) : **trois modes réels**
  Ask / Agent / Plan (pas de « Edit » qui n'aurait pas de contrepartie sandbox).
  `ask` et `plan` forcent `permissions.mode = readOnly` côté hôte
  (`applyPermissionOverride` : le plus strict de `.mode.md` et mode de session
  gagne). Bannière d'explication ; mémorisé au reload (`PERSIST_VERSION` 9→10,
  `planMode` bool → `sessionMode`).
- 256 tests (`test/unit/modelsAndMode.test.ts`, `test/render/ModelPicker.test.tsx`).
  Bundle 458 Ko webview / 121 Ko extension.

**Non démarré (attend AgenticEnv — cf. avertissement du WP)** :
- **MCP réellement branché** (§1) : joignabilité des serveurs depuis le conteneur,
  état **vérifié** par serveur, `tools/list` réel, appels MCP dans le fil,
  citations MCP encadrées. Aucune capability/vérif bridge aujourd'hui → on
  n'affiche pas un état inventé. Le texte d'avertissement du picker actuel reste
  tant que la capacité n'est pas réelle.
- **Prompts MCP en `/`-commandes** (item 121) : `McpServerEntry` ne porte pas de
  prompts ; à plumber quand le bridge les expose.
- `set_model` réel + rechargement `llama-server` : moitié AgenticEnv.
- F5 : sélecteurs en situation, échec VRAM affiché, mode Ask → écriture refusée.

## C11 — Intégration éditeur & commandes VS Code 🟡 (partiel)

Branche `wp/C11-editor-integration`. Items 89, 94–97, 99, 103, 104.

> Ce WP **rebranche** C02/C03/C04 sur les points d'accroche natifs — il ne crée
> aucune capacité. Aucune dépendance bridge : c'est du code extension host.

**Fait** :
- `src/editor/message.ts` : constructeurs **purs** des messages (fix / explain /
  commit / PR / terminal) — testés en Node.
- `src/editor/register.ts` :
  - **CodeActionProvider** (quickfix) sur les diagnostics Error/Warning →
    « Fix with agent » / « Explain this error ». Message = diagnostic + fenêtre de
    ±8 lignes (jamais le fichier entier). **Ouvre le panneau prérempli**, n'envoie
    pas le tour (réglage `agenticenvChat.editor.autoSendCodeActions` pour l'envoi
    direct).
  - **SCM** : commande `agenticenvChat.generateCommitMessage` dans `scm/inputBox`
    (✨) — `git diff --cached` (ou non stagé, en le disant), tour capturé, écrit
    dans la boîte SCM (confirmation si non vide), **jamais commité**. Style
    `agenticenvChat.scm.commitStyle` (`conventional`/`plain`).
  - **PR** : `agenticenvChat.generatePrDescription` — commits + diff contre l'amont,
    résultat dans un document markdown non enregistré.
  - **Terminal** : `agenticenvChat.terminalChat` (menu `terminal/context`) —
    quick-pick, commande **insérée non exécutée** (`sendText(cmd, false)`),
    terminal « AgenticEnv » exclu.
- `ChatViewProvider` : `openWithMessage()` (préremplit), `runCapturedTurn()`
  (lance un tour **visible dans le panneau** et capture son texte final),
  `stopTurn()`. Clés de contexte `agenticenvChat.turnRunning` /
  `awaitingConfirmation` / `hasCheckpoint` posées depuis la machine à états
  (`setContextKey`), pas dupliquées.
- `package.json` : commandes + `keybindings` (Ctrl+Alt+I focus, Ctrl+Alt+N new,
  Esc stop, Ctrl+Alt+Backspace undo — tous avec `when` restrictif et
  redéfinissables), `commandPalette` filtré par clé de contexte (aucune commande
  visible qui échouerait), réglages.
- **A11y (C11 §6)** : `views/PhaseAnnouncer.tsx` — annonce **une fois** par phase
  (`assertive` pour l'attente d'approbation, `polite` sinon), classe
  `.agx-sr-only`, `@media (prefers-reduced-motion)`. Le fil est déjà
  `aria-live="polite"` (C02).
- 263 tests (`test/unit/editorMessage.test.ts`, `test/render/PhaseAnnouncer.test.tsx`).

**Différé** :
- **Chat inline `Ctrl+I`** (item 89) : l'API d'inline chat VS Code (`[À CONFIRMER]`
  du WP) mérite sa propre décision d'archi — widget maison coûteux, ou
  `ChatParticipant`. Non démarré pour ne pas livrer un widget qui vieillira mal.
- **CodeLens Explain/Fix** (item 95) : « désactivé par défaut » dans le WP même ;
  reporté (le CodeActionProvider couvre le besoin principal).
- F5 : parcours clavier complet, annonces lecteur d'écran, ✨ SCM en situation,
  Ctrl+I terminal, aucun conflit de raccourci dans une fenêtre vierge.

## C14 — Robustesse, performance, packaging 🟡 (partiel)

Branche `wp/C14-hardening`. Items 109, 113 + clôture des exigences transverses.

**Fait** :
- **Erreurs actionnables (§3, item 109)** : `store/errorNotice.ts` (pur) mappe
  chaque code de 03-PROTOCOL §5 → texte + actions concrètes (`Retry`,
  `Open Components`, `Open settings`, `Force new session`, `Copy command`,
  `Run in terminal`). `withNotice` **regroupe** les répétitions (« ×4 »).
  `Notices.tsx` rend les boutons ; routage dans `dispatch.noticeAction`
  (nouvelles messages `reconnect` / `openSettings`). `Health` passe sous
  contrôle du store (`panels.health`) pour que « Open Components » l'ouvre.
- **Responsive (§4, item 113)** : `@media (max-width: 280px)` (chips + modèle en
  colonne, foot compacte, statusline/jauge réduites), colonne de lecture centrée
  > 700 px, contenu large (`pre`/`table`/diff) qui scrolle **dans son conteneur**,
  jamais le corps.
- **Robustesse (§5)** : durées bornées à 0 si l'horloge recule (`Timestamp`,
  `statusBar`). Tests `test/unit/hardening.test.ts` : fil de 2000 items cohérent,
  `turn_finished` inconnu ignoré, double `turn_started` → notice. (Les scénarios
  faux-bridge coupure/`resume`/désordre `seq` sont déjà couverts par C01/C08.)
- **Packaging (§6)** : `package.json` `keywords`/`bugs`/`galleryBanner`/`qna` ;
  `.vscodeignore` (exclut `src`/`test`/`blueprint`/`docs`/maps/`*.test.*`) ;
  `README.md` réécrit (bandeau « requires AgenticEnv », table des réglages, liste
  des dépendances bridge, install par `.vsix` — **pas** de Marketplace tant que le
  bridge n'a pas d'install publique) ; `CHANGELOG.md` (une entrée par WP).
- **Revue de clôture (§7)** : voir ci-dessous.

**Différé** :
- **Virtualisation du fil (§1)** : le réducteur copie `items` à chaque append
  (O(n²)). La virtualisation à hauteur variable + mémoïsation `(id, revision)` est
  la bonne réponse mais casse facilement l'auto-scroll / `aria-live` / la
  recherche si faite naïvement, et n'est pas vérifiable sans GUI ici. Non
  démarrée ; à faire avec un banc de perf.
- **Recherche interne au fil (§2)** : conséquence de la virtualisation. Tant que
  le fil n'est pas virtualisé, le `Ctrl+F` natif du webview voit tous les items —
  le besoin est moins urgent. Différée avec la virtualisation.
- **E2E `@vscode/test-electron`** : demande un environnement VS Code complet.
- **Extraction `EditsController`** de `chatViewProvider.ts` (~1200 l.) : dette
  identifiée en C06/C08, non traitée.

## Revue de clôture (C14 §7)

- **Critères d'acceptation C00–C13** : cochés dans chaque `blueprint/wp/*.md` §
  acceptation, avec l'écart écrit quand la moitié AgenticEnv manque (C01, C06,
  C07, C09, C12, C13) ou quand une fonctionnalité est différée (C02 Mermaid/KaTeX,
  C08 openInEditor, C11 inline chat, C14 virtualisation).
- **`[À CONFIRMER]`** : `terminal` (shell integration ≥ 1.93) et `git`
  (`getAPI(1)`) tranchés en C04 ; `inline chat` (C11 §1) explicitement reporté ;
  aucun autre en suspens.
- **`docs/parity-copilot-claude-code.md`** : chaque item touché par un WP porte
  son état réel (fait / partiel + limite / hors périmètre).
- **Dépendances bridge** : listées dans le README (« Bridge dependencies ») et
  dans `src/protocol.ts` → `CLIENT_AHEAD_OF_BRIDGE` ; le dépôt AgenticEnv n'étant
  pas accessible depuis cet environnement, les issues correspondantes restent à
  ouvrir (référencées WP par WP).
- **Aucune UI ne promet une capacité inexistante** : sélecteurs modèle / todo /
  panneaux gated sur la négociation de capability ; le texte d'avertissement du
  picker MCP est **conservé** tant que MCP n'est pas réellement branché.

## État final

C00–C13 : faits côté client (C01/C06/C07/C09/C12/C13 ont une moitié AgenticEnv
en attente). C14 : durci et packagé, virtualisation + recherche interne + E2E
différées. Prochaine dette : virtualisation du fil, extraction `EditsController`,
et les commits croisés AgenticEnv pour vider `CLIENT_AHEAD_OF_BRIDGE`.
