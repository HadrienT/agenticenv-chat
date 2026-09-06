# C14 — Robustesse, performance, packaging, publication

> **Contexte** : les WP précédents ajoutent quinze surfaces nouvelles. Ce WP est
> celui où l'on cesse d'ajouter et où l'on rend l'ensemble tenable : un fil de
> 2000 items qui ne rame pas, des erreurs qui disent quoi faire, une extension
> installable par quelqu'un d'autre que son auteur.
>
> Il est le dernier par dépendance, **pas** par importance : plusieurs de ses
> exigences (budget de bundle, discipline, accessibilité) sont vérifiées en continu
> depuis C00. Ce WP les clôture et ajoute ce qui ne peut se faire qu'à la fin.

**Fichiers à lire** : ce fichier · [04-CONVENTIONS.md](../04-CONVENTIONS.md) §6 ·
[05-TESTING.md](../05-TESTING.md) · tous les WP (revue de clôture)

**Dépend de** : tous. **Bloque** : rien.

**Items du catalogue** : 109 (erreurs actionnables), 113 (layout responsive).
Plus la clôture des exigences transverses.

---

## 1. Performance du fil

Une session longue produit des milliers d'items. Le fil actuel rend tout, à chaque
changement d'état.

| Mesure | Cible |
|---|---|
| Virtualisation de la liste au-delà de 200 items | rendu constant quel que soit le total |
| Mémorisation par `(item.id, revision)` | un item figé n'est jamais reparsé |
| Coalescence des deltas sur `requestAnimationFrame` | ≤ 1 rendu par frame (déjà posé en C01) |
| Fil de 2000 items | scroll fluide, mémoire < 200 Mo |
| Ouverture du panneau | premier rendu < 300 ms |

| Piège |
|---|
| La virtualisation casse l'auto-scroll, la recherche `Ctrl+F` du navigateur et l'accessibilité si elle est faite naïvement. Préserver : ancrage bas, annonces `aria-live`, et une recherche **interne** au fil (le `Ctrl+F` natif ne voit pas les items non montés). |
| Les hauteurs sont variables (un diff de 200 lignes contre un message d'une ligne) : mesurer, ne pas supposer une hauteur fixe. |

## 2. Recherche dans le fil

Conséquence directe de la virtualisation : `Ctrl+F` doit être fourni par nous.

| Règle |
|---|
| Champ de recherche dans l'entête, `Ctrl+F` quand le panneau a le focus. |
| Correspondances comptées, navigation précédent/suivant, surlignage. |
| Cherche dans le texte des messages **et** dans les sorties d'outils, y compris tronquées et repliées (un item replié qui contient une occurrence est déplié). |

## 3. Erreurs actionnables (item 109)

Chaque erreur de la table de 03-PROTOCOL §5 obtient un traitement complet :

| Erreur | Message | Actions |
|---|---|---|
| Bridge injoignable | « The bridge isn't running. » | `Start bridge` (via Components), `Open settings`, `Retry` |
| `SESSION_BUSY` | « Another client owns the session. » | `Force new session`, `Retry` |
| `PROJECT_READONLY` | commande `setfacl` exacte | `Copy command`, `Run in terminal` |
| `MODEL_UNAVAILABLE` | message brut de `llama-server` | `Open Components`, `Retry` |
| Docker arrêté | « Docker isn't running. » | `Start Docker` |
| Image absente | nom de l'image | `Pull image` |
| Contention GPU | processus concurrents nommés | `Open Components` |

| Règle |
|---|
| Aucune erreur ne se contente de décrire. Chacune propose au moins une action ou dit explicitement qu'il n'y en a pas. |
| Le panneau Components existant est le point de résolution : y renvoyer plutôt que de dupliquer des boutons partout. |
| Les erreurs répétées sont regroupées (« ×4 ») au lieu d'empiler des notices identiques. |

## 4. Layout responsive (item 113)

| Largeur | Comportement |
|---|---|
| < 280 px | chips en une colonne, actions de bloc de code dans un menu `…`, statusline abrégée |
| 280–450 px | disposition par défaut |
| > 700 px (onglet éditeur) | fil centré avec largeur maximale de lecture ; panneaux latéraux (working set, todo) à droite |

| Règle |
|---|
| Aucun scroll horizontal du corps, à aucune largeur. Le contenu large (tables, blocs de code, diffs) scrolle **dans son propre conteneur**. |
| Testé aux trois largeurs, dans les trois thèmes. |
| Le passage sidebar ↔ onglet éditeur ne perd pas l'état (C08 §7). |

## 5. Robustesse — scénarios de clôture

Ajoutés au faux bridge (05-TESTING §3) et exécutés en CI :

| Scénario | Attendu |
|---|---|
| Bridge tué en plein tour | reconnexion, `resume`, fil intact |
| Bridge redémarré avec une autre version de protocole | renégociation, dégradation annoncée |
| 10 000 items | pas de dépassement mémoire, pas de gel |
| Observation de 50 Mo | tronquée par le bridge, client vivant |
| Frames désordonnées | `seq` détecte le trou, `resume` demandé |
| Deux fenêtres VS Code sur le même dossier | la seconde voit `SESSION_BUSY` et le dit clairement |
| Disque plein à l'écriture d'une conversation | erreur visible, conversation en mémoire non perdue |
| Horloge système modifiée | pas de durée négative affichée |

## 6. Packaging et publication

| Élément | Détail |
|---|---|
| `README.md` | captures d'écran, prérequis (bridge, Docker, GPU), procédure de démarrage, table des réglages |
| `CHANGELOG.md` | tenu à jour, une entrée par WP livré |
| `LICENSE` | MIT (déjà là) |
| Icône | `media/icon.svg` — vérifier le rendu en clair et en sombre |
| `package.json` | `categories`, `keywords`, `galleryBanner`, `repository`, `bugs` |
| `.vscodeignore` | vérifier que le `.vsix` ne contient ni `src/`, ni `node_modules/`, ni `test/` |
| Taille du `.vsix` | < 5 Mo |
| CI | build, tests, budget de bundle, `.vsix` en artefact sur chaque PR |
| Release | tag `vX.Y.Z` ⇒ `.vsix` attaché à une GitHub Release |

| Règle |
|---|
| L'extension **n'est pas publiée sur le Marketplace** tant qu'elle exige un bridge local non documenté publiquement : elle serait inutilisable et mal notée. Distribution par `.vsix` et par le dépôt, jusqu'à ce qu'AgenticEnv fournisse une installation reproductible. |
| Le `README` dit dès la première ligne que l'extension **requiert** AgenticEnv. |

## 7. Revue de clôture

Passer chaque WP en revue et cocher :

- [ ] Les critères d'acceptation de C00–C13 sont cochés, ou l'écart est écrit dans le WP.
- [ ] Tous les `[À CONFIRMER]` du blueprint sont levés ou explicitement reportés.
- [ ] `docs/parity-copilot-claude-code.md` reflète l'état réel : chaque item est fait, partiel (avec la limite) ou hors périmètre.
- [ ] Les besoins bridge listés dans le README (« Dépendances côté AgenticEnv ») sont soit livrés, soit ouverts en issue référencée.
- [ ] Aucune UI ne promet une capacité inexistante — la vérification qui a motivé C12.

## 8. Tests

| Test | Attendu |
|---|---|
| Perf | 2000 items : scroll fluide, mémoire sous seuil, premier rendu < 300 ms |
| Recherche | trouve dans un item replié et le déplie |
| Responsive | 3 largeurs × 3 thèmes, aucun scroll horizontal |
| Erreurs | chaque code de 03-PROTOCOL §5 a un test vérifiant son action |
| Scénarios §5 | tous verts en CI |
| E2E `@vscode/test-electron` | activation, ouverture du panneau, envoi d'un message contre le faux bridge, commandes principales |
| Contenu du `.vsix` | ne contient ni sources, ni tests, ni `node_modules` |

## 9. Critères d'acceptation

- [~] Un fil de 2000 items reste fluide. — **différé** : le réducteur copie
  `items` à chaque append (O(n²)) ; virtualisation à hauteur variable +
  mémoïsation `(id, revision)` non démarrées (risque a11y/scroll, non vérifiable
  sans GUI). Test de **cohérence** à 2000 items en place (`hardening.test.ts`).
- [~] `Ctrl+F` cherche dans tout le fil, items repliés compris. — **différé** avec
  la virtualisation ; tant que le fil n'est pas virtualisé, le `Ctrl+F` natif du
  webview voit tous les items.
- [x] Chaque erreur connue propose une action concrète. — `store/errorNotice.ts`
  (pur, testé) : chaque code de 03-PROTOCOL §5 a ≥ 1 action, le défaut aussi
  (`Retry`).
- [x] Aucun scroll horizontal à aucune largeur. — `overflow-x: hidden` sur le
  corps ; `pre`/`table`/diff en `overflow-x: auto` dans leur conteneur ; media
  queries 280 px / 700 px. *(F5 : 3 thèmes.)*
- [~] Tous les scénarios de robustesse du §5 passent en CI. — coupure /
  renégociation / `resume` / `seq` déjà couverts (C01/C08) ; horloge reculée
  (durées bornées à 0) et `turn_*` incohérents testés en C14 ; observation 50 Mo
  et disque plein = comportement bridge / `ConversationStore` (C08), non rejoués
  ici.
- [~] Le `.vsix` s'installe sur une machine vierge et affiche un message utile
  sans bridge. — `errorNotice("BRIDGE_UNREACHABLE")` le fait ; l'install `.vsix`
  elle-même n'a pas pu être testée dans cet environnement.
- [x] `README` et `CHANGELOG` à jour. — README réécrit (bandeau requis, réglages,
  dépendances bridge, install `.vsix`) ; `CHANGELOG.md` créé, une entrée par WP.
- [x] Revue de clôture §7 faite et écarts écrits. — voir `blueprint/PROGRESS.md`
  § « Revue de clôture ».

### Différé

Virtualisation du fil + recherche interne (§1–2), E2E `@vscode/test-electron`,
extraction de `EditsController` hors de `chatViewProvider.ts`.
