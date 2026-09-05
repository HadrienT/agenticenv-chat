# AgenticEnv Chat — état des lieux & catalogue de subtilités Copilot / Claude Code

> But du document : (1) faire le point sur ce qui existe dans l'extension aujourd'hui,
> (2) lister le maximum de « petites choses » que font GitHub Copilot Chat et Claude Code
> pour qu'on décide ensuite, point par point, ce qu'on réplique.

---

## 1. État des lieux (commit `2de7e65`)

### Architecture

```
VS Code webview (React)  ──postMessage──►  extension host (Node)  ──WebSocket──►  openhands-bridge  ──►  agent-server (Docker) + llama-server
     src/webview/                              src/extension.ts          ws://127.0.0.1:8300
```

| Fichier | Rôle | État |
|---|---|---|
| `src/extension.ts` | WebviewViewProvider, pont bridge↔webview, polling santé, terminal pour actions | fonctionnel |
| `src/bridgeClient.ts` | client WS, auto-reconnect backoff exponentiel (1s→15s) | fonctionnel |
| `src/protocol.ts` | miroir TS du protocole Python du bridge | à maintenir à la main |
| `src/health.ts` | sondes santé (TCP, systemd, docker, curl, nvidia-smi) | fonctionnel, spécifique à la machine |
| `src/webview/App.tsx` | machine à états UI (`picking` → `chat`) | fonctionnel, minimal |
| `src/webview/components.tsx` | tous les composants + styles inline (tokens VS Code) | fonctionnel, minimal |
| `src/webview/components/` | dossier vide | — |

### Ce qui marche déjà

- **Panneau de chat** dans l'activity bar, avec bannière de connexion (connecting / open / closed)
  et anti-flapping (debounce 2.5 s sur `closed`, backoff sur la reco).
- **Phase « picking »** : sélection des serveurs MCP avant de démarrer, message indiquant le
  dossier bind-mount dans la sandbox.
- **Streaming des events SDK** : `MessageEvent` (user/assistant), `ActionEvent` (tool + thought),
  `ObservationEvent` (résultat), `AgentErrorEvent`.
- **Bulles chat** user / assistant (texte brut, `white-space: pre-wrap`).
- **Lignes d'outil** repliables : nom d'outil, pensée en italique, bouton `args` / `result`
  qui déplie un `<pre>` de JSON.
- **Liste des fichiers changés** (`files_changed`) : badge A/D/U/M, clic → `git.openChange`.
- **Jauge de contexte** : tokens prompt / context_window, tokens de sortie, coût cumulé
  (barre rouge > 85 %).
- **Carte de confirmation** générique Allow / Reject pour les actions risquées (`awaiting_confirmation`).
- **Barre de notice** persistante (erreurs de tour, `PROJECT_READONLY`).
- **Panneau Components** (au-delà de Copilot) : santé live du bridge, llama-server (+ `/v1/models`),
  llama-bridge, Docker, image agent-server, GPU (avertissement de contention), avec boutons
  start/stop/restart/pull qui écrivent la commande dans un terminal `AgenticEnv`.
- **Commandes** : New Session, Reconnect. `retainContextWhenHidden`.

### Limites / dette actuelle

- **Rendu markdown absent** : le texte assistant est affiché brut. Pas de blocs de code
  colorés, pas de titres/listes/tableaux, pas de liens cliquables.
- **Aucune action sur les blocs de code** : ni Copier, ni Insérer, ni Appliquer, ni diff.
- **Pas de vrai suivi de tour** : `running` est une heuristique remise à `false` sur
  `files_changed` **ou** `usage` — fragile (si aucun fichier ne change et pas d'`usage`, le
  spinner reste ; si `usage` arrive en milieu de tour, il disparaît trop tôt).
- **Pas de streaming token par token** : on suppose que `MessageEvent` arrive entier (pas de deltas).
- **Session unique** : le bridge est mono-session, pas d'historique, pas de reprise, pas d'onglets.
- **Zone de saisie nue** : `<textarea>` + bouton Send. Pas de `/`-commandes, pas de `@`/`#`
  références de contexte, pas de pièces jointes, pas de collage d'image, pas d'historique de prompts
  (flèche haut), pas d'auto-resize réel géré par nous.
- **Pas de bouton Stop / Annuler** pendant que l'agent travaille.
- **Pas d'édition/renvoi** d'un message précédent, pas de regenerate, pas de checkpoints.
- **MCP** : la liste est affichée mais non branchée dans la sandbox (Phase 2).
- **Carte de confirmation aveugle** : ne montre pas *quelle* action est en attente (commande,
  fichier, diff).
- **Pas d'instructions custom** (`CLAUDE.md` / `copilot-instructions.md`).
- **Pas d'intégration éditeur** : pas de chat inline (Ctrl+I), pas de « Fix », pas de message de
  commit, pas de description de PR, pas de génération de tests ciblée.
- **`openDiff`** ouvre le fichier contre HEAD git — ne montre pas le diff *de ce que l'agent a fait*
  (pas de snapshot avant/après côté sandbox).
- **Protocole maintenu à la main** — risque de dérive avec `protocol.py`.
- **`getState`/`setState`** de l'API webview non utilisés → tout est perdu au rechargement.

---

## 2. Catalogue de subtilités — Copilot Chat & Claude Code

Légende de faisabilité :
- 🟢 **UI pure** — faisable dans le webview sans toucher au bridge/agent-server.
- 🟡 **Bridge** — demande un nouveau message/champ dans le protocole du bridge.
- 🔴 **Agent-server** — demande une image agent-server custom ou une capacité SDK.

### 2.1 Zone de saisie (composer)

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 1 | `/`-commandes (`/fix`, `/tests`, `/explain`, `/doc`, `/new`, `/clear`) avec menu filtrable | les deux | 🟢/🟡 |
| 2 | `@`-participants (`@workspace`, `@terminal`, `@vscode`, `@github`) routant le prompt | Copilot | 🟡 |
| 3 | `#`-références de contexte (`#file`, `#selection`, `#editor`, `#codebase`, `#<symbole>`, `#terminalSelection`, `#problems`) | Copilot | 🟢 (collecte) / 🟡 (envoi) |
| 4 | Bouton « Ajouter du contexte » → quick-pick de fichiers / symboles / problèmes / terminal / images | les deux | 🟢 |
| 5 | Chips de contexte au-dessus du champ, retirables individuellement, avec compteur | les deux | 🟢 |
| 6 | Auto-attache du fichier actif + de la sélection (retirable) | les deux | 🟢 |
| 7 | Glisser-déposer de fichiers / d'images dans le chat | les deux | 🟢 |
| 8 | Coller une image (capture d'écran) depuis le presse-papier | les deux | 🟢 (UI) / 🔴 (vision LLM) |
| 9 | Historique des prompts : flèche ↑ pour rappeler les précédents | les deux | 🟢 |
| 10 | Prompts de démarrage / suggestions quand le chat est vide | Copilot | 🟢 |
| 11 | Textarea auto-grandissante (min/max lignes), `Enter` envoie, `Shift+Enter` saut de ligne, `Esc` annule | les deux | 🟢 |
| 12 | Sélecteur de modèle inline (dans le composer) | les deux | 🟡 |
| 13 | Sélecteur de mode : Ask / Edit / Agent | Copilot | 🟡 |
| 14 | Complétion floue des chemins après `@`/`#` (fuzzy find, comme le file picker) | Claude Code | 🟢 |
| 15 | Modes de chat custom / instructions custom mentionnables | Copilot | 🟢/🟡 |
| 16 | Indication « contexte trop gros » / troncature avant l'envoi | les deux | 🟢 |
| 17 | Entrée vocale | Copilot Voice | 🔴 |
| 18 | Placeholder contextuel (« Modifier X », « Poser une question sur Y ») | Copilot | 🟢 |
| 19 | Bouton d'envoi qui devient **Stop** pendant la génération | les deux | 🟢 |

### 2.2 Rendu de la réponse

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 20 | Streaming token par token avec rendu markdown **incrémental** (pas de flash à la fin) | les deux | 🟢 (UI) / 🟡 (deltas) |
| 21 | Markdown complet : titres, listes, tableaux, citations, liens, `code inline`, cases à cocher | les deux | 🟢 |
| 22 | Blocs de code **colorés** avec détection de langage | les deux | 🟢 |
| 23 | Barre d'outils par bloc de code : Copier, Insérer au curseur, Insérer dans le terminal, Nouveau fichier, **Appliquer au fichier** | les deux | 🟢/🟡 |
| 24 | Feedback « Copié ! » sur le bouton Copier | les deux | 🟢 |
| 25 | Diagrammes Mermaid rendus | Copilot | 🟢 |
| 26 | Maths (KaTeX) | Copilot | 🟢 |
| 27 | Liens `fichier:ligne` cliquables → ouvrent l'éditeur à la bonne ligne | les deux | 🟢 |
| 28 | Bloc de commande terminal avec bouton **Exécuter** (et édition avant exécution) | les deux | 🟢/🟡 |
| 29 | Troncature des très longs blocs avec « Afficher plus » | Copilot | 🟢 |
| 30 | Section « références utilisées (N) » repliable, listant fichier + plage de lignes | Copilot | 🟡 |
| 31 | Questions de suivi suggérées après la réponse (cliquables) | Copilot | 🟡/🔴 |
| 32 | Bloc de raisonnement / « thinking » repliable, avec « Réfléchi pendant Xs » | les deux | 🟢/🔴 |
| 33 | Horodatage discret par message (au survol) | Claude Code | 🟢 |
| 34 | Pouces haut / bas + commentaire par message | Copilot | 🟢 |
| 35 | Rendu spécial des `<pre>` d'outil : au lieu du JSON brut, vue conviviale par outil (voir 2.3) | les deux | 🟢 |

### 2.3 Affichage des appels d'outils (mode agent)

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 36 | Rendu **par type d'outil**, pas du JSON générique : `Read` → « Lu `path` (L10-40) », `Edit` → mini-diff, `Bash` → commande + sortie, `Grep` → motif + nb de hits | Claude Code | 🟢 |
| 37 | Lignes d'outil repliées par défaut, dépliables ; sortie longue scrollable dans son cadre | les deux | 🟢 |
| 38 | Libellé de progression en direct : « Lecture de X… », « Édition de Y… », « Exécution de Z… » | les deux | 🟡 |
| 39 | État par étape : en cours (spinner) / réussi (✓) / échoué (✗) / ignoré | les deux | 🟢 |
| 40 | Regroupement : « A cherché dans la base de code », « A utilisé 3 outils » avec compteur | Copilot | 🟢 |
| 41 | Diffs de fichiers **inline** dans le fil, coloration +/−, repliables par hunk | les deux | 🟡 |
| 42 | Sortie terminal capturée et streamée sous le bloc de commande | les deux | 🟡 |
| 43 | Survol d'une ligne d'outil → tooltip avec les args complets | Claude Code | 🟢 |
| 44 | Liens cliquables dans les résultats d'outil (chemins → éditeur) | les deux | 🟢 |
| 45 | Bouton « Voir tout » quand la sortie est tronquée | les deux | 🟢 |

### 2.4 Application des éditions (Edit / Agent mode)

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 46 | « Working set » / panneau des fichiers modifiés, avec compteur « N fichiers modifiés » | Copilot | 🟡 |
| 47 | Édition **streamée dans le fichier** avec overlay de diff live | Copilot | 🟡/🔴 |
| 48 | Accepter / Rejeter **par hunk** et **par fichier** | Copilot | 🟡 |
| 49 | « Tout garder » / « Tout annuler » global | Copilot | 🟡 |
| 50 | Navigation entre les modifications (flèches haut/bas dans le diff) | Copilot | 🟢 |
| 51 | Diff « avant/après agent » réel (snapshot sandbox), pas juste contre HEAD git | — | 🔴 |
| 52 | Barre de progression multi-fichiers pendant que l'agent édite | Copilot | 🟡 |
| 53 | Ouvrir le fichier édité automatiquement (ou pas — réglage) | les deux | 🟢 |

### 2.5 Boucle agent & exécution

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 54 | Liste de tâches / plan (todo) affichée, cases cochées **en direct** au fil de l'exécution | Claude Code | 🟡/🔴 |
| 55 | Mode Plan : lecture seule tant que le plan n'est pas approuvé (`ExitPlanMode`) | Claude Code | 🔴 |
| 56 | Auto-correction : l'agent lit lint/typecheck/tests échoués et recommence | les deux | 🔴 |
| 57 | Approbation de commande : commande **exacte** montrée, éditable, avec « Toujours autoriser ça » | les deux | 🟡 |
| 58 | Allowlist / denylist de commandes par regex, persistée par workspace | les deux | 🟢/🟡 |
| 59 | Modes d'auto-approbation (edits seuls / tout / rien) — « YOLO mode » | les deux | 🟡 |
| 60 | Protection des fichiers sensibles (`.env`, clés) — avertissement avant lecture/écriture | Copilot | 🟢/🟡 |
| 61 | Interrompre pour ajouter une consigne en cours de route, puis reprendre | les deux | 🟡 |
| 62 | Terminaux d'arrière-plan / process longs (serveurs de dev) suivis séparément | les deux | 🔴 |
| 63 | Changer de modèle en cours de session | Claude Code | 🟡 |
| 64 | Sous-agents / délégation de tâche | Claude Code | 🔴 |
| 65 | Compaction / résumé automatique du contexte quand il se remplit ; barre « X% restant » | Claude Code | 🟡/🔴 |
| 66 | Checkpoint avant chaque édition + « Restaurer ce checkpoint » | les deux | 🟡/🔴 |
| 67 | Cap d'itérations / « l'agent continue ? » après N étapes | Copilot | 🟡 |
| 68 | Question à choix multiples structurée de l'agent (au-delà du Allow/Reject) | — | 🔴 (image custom) |

### 2.6 Contexte & indexation

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 69 | Index sémantique du workspace (embeddings) pour `@workspace` / `#codebase` | Copilot | 🔴 |
| 70 | Sélection automatique des fichiers pertinents pour la question | les deux | 🔴 |
| 71 | Fichiers récemment ouverts / édités comme contexte implicite | Copilot | 🟡 |
| 72 | Conscience de l'état git : branche courante, staged, diff, derniers commits | les deux | 🟢/🟡 |
| 73 | Diagnostics / panneau Problems comme contexte | Copilot | 🟢 |
| 74 | Dernière commande terminal + sa sortie comme contexte | Copilot | 🟢 |
| 75 | Résolution symbole / définition / références | Copilot | 🟢 |
| 76 | `CLAUDE.md` / `.github/copilot-instructions.md` chargés automatiquement | les deux | 🟡 |
| 77 | Instructions à portée de chemin (`*.instructions.md` avec globs) | Copilot | 🟡 |
| 78 | Fichiers de prompt réutilisables (`*.prompt.md` → `/`-commande) | Copilot | 🟢/🟡 |
| 79 | `.copilotignore` / respect de `.gitignore` / exclusions d'org | Copilot | 🟢 |
| 80 | Budget de fenêtre de contexte : trim des vieux tours, indicateur d'usage | les deux | 🟡 |
| 81 | `#` d'un symbole → embarque sa définition, pas tout le fichier | Copilot | 🟢 |

### 2.7 Gestion des conversations

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 82 | Plusieurs chats / onglets / sessions en parallèle | les deux | 🔴 (bridge mono-session) |
| 83 | Persistance de session au rechargement + reprise (`--resume` / `--continue`) | les deux | 🟡 |
| 84 | Titre de session auto-généré | les deux | 🟡/🔴 |
| 85 | Navigateur d'historique / recherche dans les sessions passées | les deux | 🟡 |
| 86 | Export de la conversation (markdown / json) | Copilot | 🟢 |
| 87 | « Nouveau chat » efface le contexte (déjà là via New Session) | les deux | ✅ |
| 88 | Ouvrir le chat dans un onglet éditeur / sidebar / quick chat flottant | Copilot | 🟢 |
| 89 | Chat inline dans l'éditeur (Ctrl+I) — widget flottant sur la sélection | Copilot | 🟢/🟡 |
| 90 | Éditer un message user précédent et relancer (branche la conversation) | Copilot | 🟡 |
| 91 | Supprimer un message / tronquer la conversation à partir d'un point | Copilot | 🟡 |
| 92 | Régénérer la dernière réponse | Copilot | 🟡 |
| 93 | Déplacer le chat entre panel / sidebar / éditeur en gardant l'état | Copilot | 🟢 |

### 2.8 Intégration éditeur & VS Code

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 94 | « Fix with Copilot » sur les squiggles d'erreur (quick fix / menu sparkle) | Copilot | 🟢/🟡 |
| 95 | CodeLens « Explain / Fix » sur les erreurs | Copilot | 🟢 |
| 96 | Génération du message de commit depuis le staged (bouton dans Source Control) | Copilot | 🟡 |
| 97 | Génération de description de PR | Copilot | 🟡 |
| 98 | Génération de tests dans le bon fichier de test | Copilot | 🔴 |
| 99 | Chat inline terminal (Ctrl+I dans le terminal) — génère/explique une commande | Copilot | 🟢/🟡 |
| 100 | Suggestions de renommage de symbole | Copilot | 🔴 |
| 101 | Next Edit Suggestions (prédit le prochain endroit à éditer) | Copilot | 🔴 |
| 102 | Décorations dans la gouttière pour les lignes touchées par l'agent | Copilot | 🟢 |
| 103 | Annoncer la progression aux lecteurs d'écran (ARIA live) | les deux | 🟢 |
| 104 | Raccourcis clavier partout (focus composer, nouveau chat, accepter diff…) | les deux | 🟢 |
| 105 | Badge sur l'icône activity bar (agent en attente / terminé) | Copilot | 🟢 |
| 106 | Notification VS Code quand l'agent finit alors que le panneau est caché | Claude Code | 🟢 |

### 2.9 Confiance, quotas, robustesse

| # | Subtilité | Qui | Faisab. |
|---|---|---|---|
| 107 | Workspace Trust : pas d'exécution d'outil dans un dossier non fiable | les deux | 🟢 |
| 108 | Compteur de requêtes premium / quota restant | Copilot | 🟡 |
| 109 | Messages d'erreur actionnables (bouton Réessayer, lien vers le réglage) | les deux | 🟢 |
| 110 | Reprise après perte de connexion sans perdre le fil (déjà : backoff ; manque : rejouer l'état) | les deux | 🟡 |
| 111 | Exclusion de contenu par politique d'organisation | Copilot | 🔴 |
| 112 | UI optimiste / masquage de latence (« Working… » tout de suite) | les deux | 🟢 |
| 113 | Layout responsive quand la sidebar est étroite | les deux | 🟢 |
| 114 | Avertissement avant une action destructrice (rm, reset --hard, push --force) | Claude Code | 🟡 |
| 115 | Indicateur de coût / tokens en continu (pas seulement après `usage`) | Claude Code | 🟡 |

### 2.10 Spécifique Claude Code (terminal) — idées transposables

| # | Subtilité | Faisab. |
|---|---|---|
| 116 | Niveaux de réflexion (« think » / « ultrathink ») pilotant le budget de raisonnement | 🔴 |
| 117 | Mémoire projet : `#` pour ajouter une consigne persistante à `CLAUDE.md` | 🟢/🟡 |
| 118 | Hooks pre/post tool-use (lint après édition, etc.) | 🟡/🔴 |
| 119 | `/`-commandes custom définies par le repo | 🟢/🟡 |
| 120 | Statusline configurable (branche, modèle, contexte restant, coût) | 🟢 |
| 121 | Ressources / prompts MCP exposés comme `/`-commandes | 🟡 |
| 122 | Rendu de diff en couleur dans le fil, style unified | 🟢 |
| 123 | Mode « plan » approuvé explicitement avant toute écriture | 🔴 |
| 124 | Todo tool avec cases à cocher qui se mettent à jour | 🟡 |

---

## 3. Pistes de priorisation (à discuter)

**Quick wins 🟢 haut impact, webview seul :**
- Rendu markdown + blocs de code colorés (#21, #22) — c'est le plus gros écart visuel.
- Barre d'outils des blocs de code : Copier / Insérer / Nouveau fichier (#23, #24).
- Bouton Stop pendant la génération (#19).
- Rendu par type d'outil au lieu du JSON brut (#36).
- Liens `fichier:ligne` cliquables (#27, #44).
- Chips de contexte + « Ajouter du contexte » (#4, #5, #6).
- Historique des prompts (flèche ↑) (#9).
- Persistance via `getState`/`setState` (limite actuelle).
- Diff de fil unified pour les éditions (#122) même sans accept/reject par hunk.

**Nécessite le bridge 🟡 :**
- Suivi de tour fiable (remplacer l'heuristique `running`) — `turn_started` / `turn_finished`.
- Deltas de streaming pour le rendu incrémental (#20).
- Todo/plan (#54), approbation de commande détaillée (#57), working set (#46).
- Chargement de `CLAUDE.md` (#76), état git en contexte (#72).

**Nécessite agent-server custom 🔴 :**
- Questions à choix multiples (#68), mode plan (#55), sous-agents (#64),
  compaction de contexte (#65), index sémantique (#69).
