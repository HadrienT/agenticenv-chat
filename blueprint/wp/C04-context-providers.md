# C04 — Fournisseurs de contexte côté hôte

> **Contexte** : l'extension n'envoie aujourd'hui que le texte tapé. VS Code sait
> pourtant quel fichier est ouvert, ce qui est sélectionné, quelles erreurs le
> compilateur remonte, ce que le terminal vient d'afficher, quelle branche est
> active. Tout cela doit devenir attachable.
>
> Ce WP est la **moitié hôte** de C03 : il ne produit aucune UI, il produit des
> résolveurs. Les deux se développent en parallèle contre l'interface `ContextRef`.

**Fichiers à lire** : ce fichier · [01-ARCHITECTURE.md](../01-ARCHITECTURE.md) §5–6 ·
[04-CONVENTIONS.md](../04-CONVENTIONS.md) §4 · [C03-composer.md](C03-composer.md)

**Dépend de** : C00. **Bloque** : C03, C10, C11. **Parallélisable avec** : C01, C02.

**Items du catalogue** : 2 (participants `@workspace`/`@terminal`), 71 (fichiers
récents), 72 (état git), 73 (diagnostics), 74 (terminal), 75 (symboles),
79 (ignore/exclusions), 81 (symbole ⇒ définition, pas tout le fichier).

---

## 1. Interface commune

```ts
// src/context/index.ts
export interface Provider<K extends ContextRef["kind"]> {
  kind: K;
  /** Libellé et taille estimée, sans lire tout le contenu si évitable. */
  describe(ref: Extract<ContextRef, { kind: K }>): Promise<ContextChip>;
  /** Contenu réel, budgété. Appelé uniquement à l'envoi. */
  resolve(ref: Extract<ContextRef, { kind: K }>, budget: Budget): Promise<ResolvedContext>;
}

export interface ResolvedContext {
  kind: string;
  label: string;      // « src/pricing/black.cpp:12-40 »
  body: string;       // contenu, déjà tronqué
  truncated: boolean;
  bytes: number;
}
```

| Règle | Raison |
|---|---|
| `describe` est appelé au moment de créer la chip ; `resolve` seulement à l'envoi. | une chip posée dix minutes plus tôt doit envoyer l'**état actuel** du fichier, pas celui d'il y a dix minutes |
| Aucun provider ne renvoie un chemin hôte absolu : les chemins sortent traduits par `paths.ts`. | l'agent raisonne en chemins conteneur |
| Chaque provider respecte un budget en octets, imposé par l'appelant, et signale la troncature. | un fichier de 2 Mo ne doit pas manger la fenêtre de contexte |
| Un provider qui échoue ne fait pas échouer l'envoi : il renvoie un `ResolvedContext` d'erreur explicite (« terminal output unavailable »). | mieux vaut un contexte partiel qu'un message perdu |

## 2. Providers

### `files` (items 6, 71)

| Fonction | Détail |
|---|---|
| Fichier actif | `window.activeTextEditor.document` ; ignore les éditeurs non-fichiers (output, diff, webview) |
| Sélection | plage exacte, avec **N lignes de marge** de part et d'autre (réglable, défaut 5) pour donner le contexte syntaxique |
| Fichiers récents | les 10 derniers documents visités, filtrés par `ignore.ts`, proposés dans le quick-pick — **jamais attachés automatiquement** |
| Recherche floue | `workspace.findFiles` + score de correspondance ; exclut `node_modules`, `build`, `dist`, `.git` |

Un fichier trop gros est envoyé **par plage** : début, plus les zones autour des
symboles nommés dans le message si détectables, plus la fin. Le fait qu'il soit
tronqué apparaît dans le `label`.

### `symbols` (items 75, 81)

`executeWorkspaceSymbolProvider` puis `executeDefinitionProvider`. La subtilité
qui compte : **attacher la définition du symbole, pas le fichier entier**. Pour du
C++, avec `codeintel`/clangd côté AgenticEnv, c'est la différence entre 300 tokens
et 30 000.

Le corps est délimité par le `range` du `DocumentSymbol`, plus les `#include` du
fichier et la déclaration de classe englobante s'il y en a une.

### `diagnostics` (item 73)

`languages.getDiagnostics()`. Condensation obligatoire :

| Règle |
|---|
| Groupés par fichier, triés par sévérité puis par ligne. |
| Seules les sévérités `Error` et `Warning` par défaut (`Information`/`Hint` sur demande). |
| Chaque entrée : `chemin:ligne:col [sévérité] message (source)` + la **ligne de code** concernée. |
| Plafond de 50 diagnostics ; au-delà, on garde les 50 premiers et on indique le total. |
| Les diagnostics d'erreurs C++ en cascade (une erreur en entraîne 40) sont dédupliqués par message identique. |

### `terminal` (item 74)

`[À CONFIRMER]` : l'accès à la sortie du terminal dépend de l'API *shell
integration* de VS Code (`window.onDidEndTerminalShellExecution`, disponible à
partir d'une version récente). Vérifier la version minimale et **dégrader
proprement** : si l'intégration shell n'est pas active, proposer uniquement
« terminal selection » (via `Terminal.selection`) et le dire dans le quick-pick.

| Cas | Contenu |
|---|---|
| `lastCommand` | commande + code de sortie + sortie tronquée aux 100 dernières lignes |
| `selection` | texte sélectionné dans le terminal |

Le terminal « AgenticEnv » (créé par le panneau Components) est **exclu** : il ne
contient que nos propres commandes de service.

### `git` (item 72)

Via l'API de l'extension `vscode.git` (`[À CONFIRMER]` : forme exacte de
`GitExtension.getAPI(1)`).

| `what` | Contenu |
|---|---|
| `status` | branche, ahead/behind, fichiers modifiés/stagés (noms seuls) |
| `diff` | `git diff` du non-stagé, tronqué, **fichiers binaires exclus** |
| `log` | 10 derniers commits : hash court, sujet, auteur, date relative |

Si le dossier n'est pas un dépôt git, le provider le dit ; il n'échoue pas.

### `ignore` (item 79)

| Règle |
|---|
| `.gitignore` respecté pour les propositions **et** les résolutions. |
| Un fichier `.agenticenvignore` (même syntaxe) permet d'exclure en plus. |
| Liste de motifs sensibles **toujours** exclue de l'automatique : `.env*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, `credentials*`, `*.p12`. |
| Attacher explicitement un fichier sensible reste possible, mais déclenche une confirmation modale nommant le fichier. Voir C07. |
| Le test « secret » couvre un `.env` : il ne doit apparaître ni dans la recherche floue, ni dans les fichiers récents, ni dans l'auto-attache. |

## 3. Participants (item 2)

Copilot route le prompt vers un `@participant`. Ici il n'y a qu'un agent, donc
`@` sert à **grouper des références**, pas à changer de destinataire :

| Participant | Équivaut à |
|---|---|
| `@workspace` | structure du dépôt (arbre tronqué) + `#git status` |
| `@terminal` | `#terminal` |
| `@problems` | `#problems` étendu au workspace |

C'est un raccourci de saisie, documenté comme tel. On n'introduit pas de notion de
routage qui n'existe pas côté bridge (P1).

## 4. Budget

```ts
export interface Budget { totalBytes: number; perContextBytes: number; }
```

L'appelant (`context/index.ts`) répartit : budget global tiré de
`context_window` (C13) moins une marge pour la réponse, divisé entre les chips
avec une part minimale garantie. Les chips explicites de l'utilisateur sont
servies **avant** les chips automatiques.

## 5. Tests

| Test | Attendu |
|---|---|
| `files.test.ts` | fichier actif ignore les éditeurs virtuels ; marge de sélection appliquée ; troncature par plages |
| `symbols.test.ts` | attache la définition, pas le fichier (mesuré en octets) |
| `diagnostics.test.ts` | condensation, déduplication de cascade C++, plafond de 50 |
| `git.test.ts` | dépôt absent ⇒ message clair, pas d'exception ; binaires exclus du diff |
| `ignore.test.ts` | `.env` invisible partout où c'est automatique |
| `budget.test.ts` | priorité aux chips explicites ; troncature signalée |
| `paths` | tout chemin sortant est un chemin conteneur |
| Dégradation | shell integration absente ⇒ option retirée + explication, pas d'erreur |

## 6. Critères d'acceptation

- [ ] Les 7 types de `ContextRef` ont un provider avec `describe` et `resolve`.
- [ ] Aucun contenu de fichier ne transite par la webview.
- [ ] `#sym:` attache la définition, pas le fichier entier — écart mesuré dans un test.
- [ ] Un `.env` n'est jamais attaché automatiquement.
- [ ] Un provider en échec dégrade le message sans le bloquer.
- [ ] Les chemins envoyés au bridge sont des chemins conteneur.
- [ ] Les points `[À CONFIRMER]` (shell integration, API git) sont tranchés et documentés dans ce fichier.
