# C11 — Intégration éditeur & commandes VS Code

> **Contexte** : l'extension est un panneau, et rien d'autre. Tout passe par le
> chat : pour corriger une erreur, il faut ouvrir le panneau, décrire le fichier,
> décrire l'erreur. Ce qui fait que Copilot est utilisé, c'est qu'il est là où on
> travaille déjà — sur la squiggle rouge, dans le champ de message de commit, sous
> le curseur.
>
> Ce WP ne crée aucune capacité nouvelle : il **rebranche** ce que C02, C03 et C04
> savent déjà faire sur les points d'accroche natifs de VS Code.

**Fichiers à lire** : ce fichier · [C02-thread-rendering.md](C02-thread-rendering.md) ·
[C03-composer.md](C03-composer.md) · [C04-context-providers.md](C04-context-providers.md) ·
[C07-permissions.md](C07-permissions.md)

**Dépend de** : C02, C03, C04. **Bloque** : C14. **Parallélisable avec** : C08, C09.

**Items du catalogue** : 89 (chat inline Ctrl+I), 94 (« Fix » sur les diagnostics),
95 (CodeLens Explain/Fix), 96 (message de commit), 97 (description de PR),
99 (chat inline terminal), 103 (accessibilité / lecteurs d'écran),
104 (raccourcis clavier).

---

## 1. Chat inline dans l'éditeur (item 89)

`Ctrl+I` sur une sélection ouvre un widget flottant : une ligne de saisie, la
sélection en contexte implicite.

| Règle |
|---|
| Implémenté comme un `WebviewViewProvider` distinct **ou** via l'API d'inline chat si elle est stable et publique `[À CONFIRMER]` — vérifier avant de coder un widget maison, qui est coûteux et vieillira mal. |
| Le résultat s'affiche **dans le widget**, avec les mêmes actions de bloc de code que le panneau (C02 §3) plus « Replace selection ». |
| « Replace selection » passe par `WorkspaceEdit` : annulable par `Ctrl+Z`. |
| Le widget partage la session du panneau. Il ne démarre pas une deuxième sandbox (D7). |
| Le tour lancé depuis le widget apparaît **aussi** dans le panneau : un seul historique, pas deux fils divergents. |
| `Esc` ferme sans annuler le tour en cours ; le tour continue et son résultat atterrit dans le panneau. |

> **Attention à la latence.** L'inline chat suppose une réponse en quelques
> secondes. Ici un tour peut prendre plusieurs minutes (primer §5). Le widget doit
> donc afficher très tôt « this may take a while — follow in the panel » et
> proposer de basculer, plutôt que de bloquer l'utilisateur sur un spinner.

## 2. Diagnostics (items 94, 95)

| Point d'accroche | Comportement |
|---|---|
| `CodeActionProvider` sur les diagnostics `Error`/`Warning` | actions « Fix with agent » et « Explain this error » |
| `CodeLens` en tête de fonction contenant une erreur | « Explain · Fix » (réglable, désactivé par défaut — le CodeLens est intrusif) |

Le message construit joint automatiquement : le diagnostic condensé (C04), le
fichier, et la fonction englobante (via `DocumentSymbol`), pas le fichier entier.

| Règle |
|---|
| L'action **ouvre le panneau avec le message prérempli** ; elle ne lance pas le tour toute seule. Un `Ctrl+.` malencontreux ne doit pas déclencher un tour de 10 minutes. |
| Réglage `agenticenvChat.editor.autoSendCodeActions` pour ceux qui préfèrent l'envoi direct. |

## 3. Source Control (items 96, 97)

| Fonction | Détail |
|---|---|
| Message de commit | bouton ✨ dans la boîte de message SCM ; contexte = `git diff --staged` (ou non stagé si rien n'est stagé, en le disant) |
| Description de PR | commande `agenticenvChat.generatePrDescription` ; contexte = commits de la branche + diff contre la base |

| Règle |
|---|
| Le message généré est **écrit dans la boîte de saisie**, jamais commité. |
| Un message existant n'est pas écrasé sans confirmation. |
| Le diff est tronqué et les fichiers binaires exclus (C04 §2 `git`). |
| Style de message configurable (`agenticenvChat.scm.commitStyle`: `conventional` / `plain`), passé comme instruction. |
| Ces deux fonctions consomment un tour d'agent complet sur un modèle local lent : afficher la progression et permettre l'annulation, comme n'importe quel tour. |

## 4. Terminal (item 99)

`Ctrl+I` dans un terminal : génère ou explique une commande.

| Règle |
|---|
| Génération ⇒ la commande est **insérée dans le terminal sans être exécutée** (`Terminal.sendText(cmd, false)`). L'utilisateur appuie sur Entrée. |
| Explication ⇒ contexte = dernière commande + sortie (C04 `terminal`), résultat dans le panneau. |
| Le terminal de service « AgenticEnv » est exclu (C04 §2). |
| Rappel affiché : ces commandes tournent **sur l'hôte**, pas dans le sandbox (cf. C07 §6). |

## 5. Raccourcis (item 104)

| Raccourci | Commande | `when` |
|---|---|---|
| `Ctrl+Alt+I` | ouvrir/focus le panneau | — |
| `Ctrl+I` | chat inline | `editorTextFocus` / `terminalFocus` |
| `Ctrl+Alt+N` | nouvelle session | panneau visible |
| `Esc` | stop du tour | `agenticenvChat.turnRunning` |
| `Ctrl+Alt+Backspace` | annuler le dernier tour (C06) | `agenticenvChat.hasCheckpoint` |
| `Alt+↑/↓` | modification précédente/suivante | vue de diff |

| Règle |
|---|
| Les clés de contexte (`agenticenvChat.turnRunning`, `hasCheckpoint`, `awaitingConfirmation`) sont posées par l'hôte via `setContext`, à partir de la machine à états de C01 — pas dupliquées. |
| Aucun raccourci ne surcharge un raccourci VS Code courant sans `when` restrictif. |
| Tous sont redéfinissables (déclarés dans `contributes.keybindings`). |

## 6. Accessibilité (item 103)

Traité ici et non repoussé en C14, parce que c'est structurel :

| Exigence |
|---|
| Le fil est une région `aria-live="polite"` ; l'arrivée d'une réponse est annoncée, pas chaque delta (sinon le lecteur d'écran devient inutilisable). |
| Annonce du changement de phase : « agent working », « waiting for your approval », « turn finished ». L'approbation en attente est `aria-live="assertive"`. |
| Chaque bouton icône a un `aria-label` explicite. Les icônes Codicon seules ne suffisent pas. |
| Ordre de tabulation logique : fil → composer → actions. Les items du fil sont atteignables et leurs actions accessibles au clavier. |
| Les états ne sont **jamais** signalés par la couleur seule : ✓/✗/⟳ portent aussi une forme et un texte alternatif. |
| Respect de `prefers-reduced-motion` : le spinner devient statique. |

## 7. `package.json` — contributions ajoutées

```
commands:        openInEditor, newSession, stop, undoTurn, restoreCheckpoint,
                 history, generateCommitMessage, generatePrDescription,
                 remember, inlineChat, terminalChat, clearDecorations
keybindings:     table §5
menus:           scm/inputBox (✨), editor/context, terminal/context,
                 view/title (existant), editor/title
codeActions:     quickfix sur diagnostics
capabilities:    untrustedWorkspaces: limited (C07 §7)
```

| Règle |
|---|
| `activationEvents` reste minimal. Aujourd'hui il est vide (activation par la vue) ; ne pas ajouter `onStartupFinished` — l'extension ne doit pas démarrer une sandbox ni sonder le système tant que l'utilisateur n'a rien ouvert. |
| Toute commande apparaissant dans la palette doit être **exécutable** dans l'état courant, ou masquée par un `when`. Une commande qui échoue avec « no session » est un défaut d'UX. |

## 8. Tests

| Test | Attendu |
|---|---|
| Code action | message prérempli, panneau ouvert, tour **non** envoyé par défaut |
| Contexte de diagnostic | fonction englobante attachée, pas le fichier entier |
| Message de commit | écrit dans la boîte SCM, pas de commit ; message existant préservé sans confirmation |
| Terminal | commande insérée non exécutée |
| Inline chat | partage la session ; le tour apparaît dans le panneau ; `Esc` n'annule pas le tour |
| Clés de contexte | `turnRunning` suit exactement la machine à états de C01 |
| Raccourcis | aucun conflit avec les défauts VS Code (vérifié dans une fenêtre vierge) |
| Accessibilité | parcours complet au clavier ; annonces `aria-live` déclenchées une fois par réponse, pas par delta |
| Activation | ouvrir VS Code sans toucher au panneau ⇒ extension non activée |

## 9. Critères d'acceptation

- [x] `Ctrl+.` sur une erreur propose « Fix with agent » avec un contexte ciblé. —
  `CodeActionProvider` quickfix ; message = diagnostic condensé + fenêtre ±8 lignes
  (`fixMessage`), **pas** le fichier entier. *(F5 : le menu en situation.)*
- [x] Le bouton ✨ du SCM produit un message de commit dans la boîte, sans commiter. —
  `generateCommitMessage` écrit `repositories[0].inputBox.value` ; confirmation modale si
  la boîte n'est pas vide ; jamais de `git commit`.
- [~] `Ctrl+I` fonctionne dans l'éditeur et dans le terminal. — **terminal** fait
  (`terminalChat`, commande insérée non exécutée) ; **éditeur inline** différé (API
  `[À CONFIRMER]`, cf. §1) — `Ctrl+Alt+I` ouvre le panneau en attendant.
- [~] Le chat inline et le panneau partagent une seule session. — s.o. tant que l'inline
  chat n'est pas fait ; `runCapturedTurn` (SCM/PR/terminal) passe par **la** session du
  panneau et le tour y est visible (pas de 2ᵉ sandbox, D7).
- [x] Toutes les fonctions sont utilisables au clavier seul. — commandes + `keybindings`
  redéfinissables ; menus SCM/terminal/palette. *(F5 : parcours complet.)*
- [x] Un lecteur d'écran annonce l'arrivée d'une réponse et une demande d'approbation. —
  `PhaseAnnouncer` (`polite` / `assertive`) ; fil `aria-live="polite"` (C02) — un
  évènement par phase, pas par delta.
- [x] L'extension ne s'active pas si l'utilisateur n'ouvre pas le panneau. —
  `activationEvents` reste vide ; `registerEditorIntegration` n'enregistre que des
  providers/commandes (pas de sandbox, pas de sonde) ; aucun `onStartupFinished`.
- [x] Aucune commande visible dans la palette n'échoue faute d'état valide. — `stop` /
  `undoTurn` / `restoreCheckpoint` / `openTurnDiff` masquées par `commandPalette` `when`
  sur `agenticenvChat.turnRunning` / `hasCheckpoint`.

### Différé

- **Chat inline `Ctrl+I` éditeur** (item 89) : décision d'archi dédiée (widget vs
  `ChatParticipant`) — non démarré.
- **CodeLens** (item 95) : désactivé par défaut dans le WP même ; reporté.
- F5 : tout le parcours clavier + lecteur d'écran, conflits de raccourcis dans une
  fenêtre vierge.
