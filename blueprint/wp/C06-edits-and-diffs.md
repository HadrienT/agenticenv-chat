# C06 — Éditions, diffs, checkpoints

> **Contexte et différence majeure avec Copilot.** Copilot *propose* des éditions
> qu'on accepte hunk par hunk. Ici l'agent **a déjà écrit** : le dossier ouvert est
> bind-monté dans le sandbox, les fichiers sur le disque sont modifiés en direct.
> Le modèle « accept/reject avant application » n'existe pas.
>
> Le bon modèle est donc celui de Claude Code : **checkpoint avant le tour,
> visibilité pendant, annulation après**. C'est le principe P4 du primer, et il
> détermine toute la conception de ce WP. Toute tentative de calquer le working
> set de Copilot à l'identique produira une UI qui ment.
>
> État actuel : une liste de fichiers modifiés qui, au clic, ouvre `git.openChange`
> — donc un diff **contre HEAD**, qui mélange ce que l'agent a fait et ce que
> l'utilisateur avait déjà modifié avant.

**Fichiers à lire** : ce fichier · [00-PRIMER.md](../00-PRIMER.md) §2 (P4) ·
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md) §5 · [03-PROTOCOL.md](../03-PROTOCOL.md) §2.3

**Dépend de** : C01, C02. **Bloque** : C14. **Parallélisable avec** : C07.

**Items du catalogue** : 41 (diffs inline dans le fil), 46 (working set),
47 (édition visible en direct), 48 (accept/reject par hunk), 49 (tout garder /
tout annuler), 50 (navigation entre modifications), 51 (diff réel avant/après),
52 (progression multi-fichiers), 53 (ouverture auto du fichier édité),
66 (checkpoints et restauration), 102 (décorations de gouttière),
122 (rendu de diff unifié).

---

## 1. Checkpoints (item 66) — la pièce maîtresse

| Décision | Un checkpoint est pris **avant chaque tour** qui peut écrire, pas avant chaque édition. Granularité = le tour, comme l'annulation naturelle (« annule ce que tu viens de faire »). |
|---|---|

Deux stratégies possibles, à trancher à l'implémentation :

| Stratégie | Avantages | Inconvénients |
|---|---|---|
| **A — côté bridge**, `git stash create` ou commit dans un ref technique (`refs/agenticenv/checkpoints/*`) dans le sandbox | robuste, gère les renommages, gratuit en espace | exige un dépôt git ; pollue le repo de l'utilisateur si mal isolé |
| **B — côté hôte**, copie des fichiers concernés dans `storageUri/checkpoints/<id>/` | marche hors git ; totalement isolé | on ne sait pas *avant* le tour quels fichiers seront touchés ⇒ copie à la volée au premier `files_changed` |

Recommandation : **A quand le dossier est un dépôt git** (cas normal du repo
`quant-modeling`), **B en repli**, avec la stratégie utilisée affichée dans l'UI.
Un `refs/agenticenv/…` n'apparaît ni dans `git log`, ni dans les branches, et se
purge (§6).

| Règle |
|---|
| Restaurer un checkpoint **n'annule pas** le fil de conversation : le fil garde une marque « restored to checkpoint before this turn ». L'historique du dialogue et l'état du disque sont deux choses distinctes. |
| Un fichier modifié **par l'utilisateur** après le tour bloque la restauration silencieuse : confirmation explicite listant les conflits. |
| La restauration est elle-même un checkpoint (on peut annuler l'annulation). |
| Les checkpoints sont purgés au-delà de 20, ou 7 jours, ou 200 Mo. |

## 2. Diff réel (item 51)

`git.openChange` compare à HEAD. Ce n'est pas ce qu'on veut : on veut
**avant-le-tour → maintenant**.

```
request_diff {path} → file_diff {path, unified, truncated}
```

Le bridge calcule le diff entre le checkpoint du tour et l'état courant, côté
sandbox. Le client :

| Vue | Contenu |
|---|---|
| **Dans le fil** | diff unifié compact, replié par défaut au-delà de 40 lignes (item 41) |
| **Dans l'éditeur** | `TextDocumentContentProvider` sur un schéma `agenticenv-checkpoint:` qui sert la version d'avant, puis `vscode.diff` contre le fichier réel (item 50 : navigation native) |

Le schéma virtuel est indispensable : sans lui il faudrait écrire des fichiers
temporaires sur le disque de l'utilisateur.

## 3. Working set (items 46, 52, 53)

`views/panels/WorkingSet.tsx` remplace `FileChanges` :

```
▾ 4 files changed by this session          [Undo turn] [Open all]
   M  src/pricing/black.cpp        +12 −3   [diff] [revert]
   A  tests/test_black.cpp         +84      [diff] [revert]
   M  include/pricing/black.hpp    +2  −0   [diff] [revert]
   D  src/pricing/old_black.cpp    −140     [diff] [revert]
```

| Règle |
|---|
| Les compteurs `+/−` viennent du `file_diff`, chargés paresseusement au premier affichage, pas tous d'un coup. |
| `revert` sur une ligne restaure **ce fichier** depuis le checkpoint courant. |
| `Undo turn` restaure tout le tour. |
| Pendant le tour, la liste se remplit progressivement avec le fichier en cours d'écriture en tête, marqué ⟳ (item 52). |
| `Open all` respecte un plafond (10 fichiers) et prévient au-delà. |
| Réglage `agenticenvChat.edits.autoOpen` : `never` (défaut) / `first` / `all` (item 53). Défaut `never` : l'agent peut toucher 20 fichiers, ouvrir 20 onglets est hostile. |
| Le filtrage déjà en place côté bridge (`conversations/`, `.git/`, `.openhands/`, > 200 entrées) est conservé. |

## 4. Accept / reject par hunk (item 48) — portée réduite, assumée

Comme l'écriture a déjà eu lieu, « accepter » n'a pas de sens. Ce qui a du sens
est **rejeter un hunk** : réappliquer la version d'avant sur ces lignes seulement.

| Règle |
|---|
| Chaque hunk du diff porte un bouton `revert hunk`. |
| Un `revert hunk` produit une édition via `WorkspaceEdit` — donc annulable par le `Ctrl+Z` natif de VS Code, ce qui est le meilleur filet possible. |
| Si le fichier a changé depuis le calcul du diff, le revert est **refusé** avec un message clair et une proposition de recalculer. Jamais d'application aveugle sur des lignes décalées. |
| Pas de bouton « accept » : le vocabulaire de l'UI est `keep` (ne rien faire) / `revert`. Nommer les choses correctement évite de faire croire à une garantie qui n'existe pas. |

## 5. Décorations de gouttière (item 102)

Les lignes touchées par le tour courant portent une décoration discrète dans la
gouttière, avec un `hoverMessage` « changed by the agent in this turn ».

| Règle |
|---|
| Décorations effacées au tour suivant, ou par la commande `agenticenvChat.clearDecorations`. |
| Elles n'entrent pas en conflit avec les décorations git natives : couleur de token distincte, colonne d'overview seulement. |
| Désactivables par réglage — certains utilisateurs trouveront ça bruyant. |

## 6. Commandes VS Code livrées

| Commande | Rôle |
|---|---|
| `agenticenvChat.undoTurn` | restaure le checkpoint du dernier tour |
| `agenticenvChat.restoreCheckpoint` | quick-pick des checkpoints disponibles |
| `agenticenvChat.openTurnDiff` | diff de tout le tour, fichier par fichier |
| `agenticenvChat.purgeCheckpoints` | nettoyage manuel |

## 7. Tests

| Test | Attendu |
|---|---|
| `diff.test.ts` | parseur de diff unifié : hunks, contexte, renommage, fichier binaire, fin de ligne sans newline |
| `checkpoints.test.ts` (git) | création, restauration, restauration partielle, ref invisible dans `git branch`/`git log` |
| `checkpoints.test.ts` (fichiers) | même contrat hors dépôt git |
| Conflit | fichier modifié par l'utilisateur après le tour ⇒ confirmation, pas d'écrasement |
| `revert hunk` | passe par `WorkspaceEdit`, annulable par `Ctrl+Z` |
| Décalage | fichier modifié depuis le diff ⇒ revert refusé avec message |
| Purge | seuils 20 / 7 j / 200 Mo respectés |
| Working set | 200 fichiers ⇒ pas de blocage, chargement paresseux des compteurs |
| Diff virtuel | le schéma `agenticenv-checkpoint:` sert la bonne version, en lecture seule |

## 8. Pièges

| Piège | Conduite à tenir |
|---|---|
| Écrire des checkpoints dans le dépôt de l'utilisateur | utiliser un ref technique hors `refs/heads`, et le documenter dans le README. Ne jamais créer de commit sur une branche existante. |
| Diff contre HEAD | bug actuel. Le diff doit être **checkpoint → maintenant**, pas HEAD → maintenant. |
| Chemins conteneur | tout chemin de `file_diff`/`files_changed` passe par `paths.ts` (01-ARCHITECTURE §5). |
| Fichiers hors du dossier ouvert | l'agent peut écrire dans `/tmp` du sandbox : ces chemins ne sont **pas** dans le working set, et l'UI le dit plutôt que de les masquer. |
| Fin de ligne et encodage | un revert ne doit pas convertir CRLF↔LF ni réencoder. Test dédié. |

## 9. Critères d'acceptation

- [ ] Un tour écrit dans le dépôt, et « Undo turn » remet exactement l'état d'avant (vérifié par `git status` propre).
- [ ] Le diff affiché est **checkpoint → maintenant**, pas HEAD → maintenant.
- [ ] Un diff s'affiche dans le fil, replié au-delà de 40 lignes.
- [ ] `revert hunk` fonctionne et reste annulable par `Ctrl+Z`.
- [ ] Une modification concurrente de l'utilisateur ne peut pas être écrasée silencieusement.
- [ ] Les checkpoints n'apparaissent pas dans `git log` ni `git branch`.
- [ ] Le mode hors-git fonctionne (dossier sans dépôt).
- [ ] La stratégie de checkpoint retenue est affichée à l'utilisateur.
