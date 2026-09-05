# Suivi d'implémentation — branches `wp/C0X`

Journal de bord de l'implémentation autonome du blueprint. Mis à jour au fil de
l'eau. Chaque WP est développé sur sa branche `wp/C0X-slug`, mergée dans `main`
quand ses critères d'acceptation **automatisables** sont verts.

> **Limites de l'environnement d'implémentation** : pas de VS Code GUI (donc pas
> de vérification F5 ni de captures d'écran avant/après), pas d'accès à un bridge
> AgenticEnv réel (donc pas de fixtures capturées ni de commits croisés
> AgenticEnv ; les messages du protocole v2 sont codés côté client et testés
> contre le faux bridge). Ces points sont listés « à finir » par WP.

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
| C08 | Sessions, historique | `wp/C08-sessions` | 🚧 en cours | |
| C09 | Plan, todo, pilotage boucle agent | — | ⏳ à faire | |
| C10 | Instructions, prompts, mémoire | — | ⏳ à faire | |
| C11 | Intégration éditeur & commandes | — | ⏳ à faire | |
| C12 | MCP opérationnel & sélection modèle | — | ⏳ à faire | |
| C13 | Budget de contexte, compaction | — | ⏳ à faire | |
| C14 | Robustesse, a11y, packaging | — | ⏳ à faire | |

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

## C08 — Sessions, historique 🚧

En cours.
