# C00 — Fondations : arborescence, store, thème, harnais de test

> **Contexte** : l'extension marche mais tient en 6 fichiers, dont `components.tsx`
> (480 lignes, styles inline, 8 composants) et `App.tsx` (295 lignes, 12 `useState`).
> Il n'y a aucun test. Ajouter les 14 WP suivants sur cette base produirait un
> fichier de 4000 lignes et des régressions invisibles.
>
> **Ce WP ne livre aucune fonctionnalité utilisateur.** C'est un refactor à
> comportement constant, plus le harnais qui rend les suivants tenables. Il est le
> seul WP dont la réussite se mesure à ce qui **n'a pas changé**.

**Fichiers à lire** : ce fichier · [00-PRIMER.md](../00-PRIMER.md) ·
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md) · [02-REPOSITORY-TREE.md](../02-REPOSITORY-TREE.md) ·
[04-CONVENTIONS.md](../04-CONVENTIONS.md) · [05-TESTING.md](../05-TESTING.md)

**Dépend de** : rien. **Bloque** : tous les autres WP.

**Items du catalogue** : aucun directement. *Enabler.*

---

## 1. Livrables

| # | Livrable |
|---|---|
| L1 | Découpage `src/webview/{store,theme,render,views}` conforme à 02-REPOSITORY-TREE §3 ; `components.tsx` supprimé. |
| L2 | Réducteur unique + machine à états `SessionPhase` (01-ARCHITECTURE §3), **sans** encore brancher les nouveaux messages de tour (c'est C01). |
| L3 | `theme/tokens.css` + `theme/base.css` ; zéro hex ailleurs. |
| L4 | Persistance `getState`/`setState` avec `PersistedState.version`. |
| L5 | `src/paths.ts` — traducteur sandbox↔hôte unique. |
| L6 | `src/logging.ts` — `OutputChannel`, niveaux, masquage de secrets. |
| L7 | `src/messages.ts` — contrat hôte↔webview séparé de `protocol.ts`, routeurs exhaustifs. |
| L8 | Harnais de test : vitest, jsdom, Testing Library, faux bridge, fixtures capturées. |
| L9 | Tests de discipline de 05-TESTING §5. |
| L10 | CI GitHub Actions (05-TESTING §8). |
| L11 | `extension.ts` réduit à `activate`/`deactivate` ; `chatViewProvider.ts` extrait. |

## 2. Découpage de `components.tsx`

| Bloc actuel | Destination |
|---|---|
| `styles`, `dotStyle`, `fileBadgeStyle`, `gaugeFillStyle` | `theme/tokens.css` + classes dans `theme/base.css` |
| `ConnectionBanner` | `views/ConnectionBanner.tsx` |
| `McpPicker` | `views/panels/McpPicker.tsx` |
| `ChatBubble` | `views/items/MessageItem.tsx` |
| `ToolRow` | `views/items/ToolItem.tsx` (refondu en C05) |
| `ConfirmCard` | `views/ConfirmCard.tsx` (enrichi en C07) |
| `FileChanges` | `views/panels/WorkingSet.tsx` (enrichi en C06) |
| `ContextGauge` | `views/ContextGauge.tsx` (enrichi en C13) |
| `HealthPanel` + `healthStyles` + `worst()` | `views/panels/Health.tsx` |

> Le panneau Components est la partie la plus aboutie de l'existant et n'a pas
> d'équivalent chez Copilot. **Le déplacer sans en changer le comportement.**

## 3. Le store

```ts
// store/types.ts
interface AppState {
  connection: { state: "connecting" | "open" | "closed"; protocol: number | null; detail?: string };
  phase: SessionPhase;
  items: ChatItem[];
  itemIndex: Record<string, number>;   // id → position, pour patchItem en O(1)
  workspace: { folder: string | null; path: string | null };
  mcp: { servers: McpServer[]; selected: string[] };
  health: ComponentHealth[];
  usage: Usage | null;
  workingSet: WorkingSetFile[];
  notices: Notice[];
  composer: { draft: string; attachments: ContextRef[] };
  panels: Record<PanelId, boolean>;
}

// store/reducer.ts
export function reduce(state: AppState, msg: HostToWebview): AppState;
```

Contraintes :

| Règle |
|---|
| `reduce` est **pure** et ne connaît ni React ni `postMessage`. Elle se teste en Node pur. |
| Les intentions sortantes passent par `store/dispatch.ts`, seul module qui appelle `post()`. |
| `itemIndex` évite un `findIndex` linéaire par delta — indispensable pour C01. |
| Les `notices` sont une **liste** avec `id` et `dismissible`, pas la chaîne unique actuelle qui écrase la précédente. |

## 4. Migration de l'état `running` — comportement constant

C00 **conserve** l'heuristique actuelle, mais l'isole dans une seule fonction
documentée et marquée :

```ts
/** @deprecated Heuristique v1 : remplacée par turn_started/turn_finished en C01.
 *  Viole P3 du primer. Ne pas étendre. */
function legacyInferTurnEnd(msg: Outbound): boolean;
```

Ainsi C01 supprime **une** fonction au lieu de démêler trois `useState`.

## 5. `paths.ts`

```ts
export interface PathMapping { sandboxRoot: string; hostRoot: vscode.Uri | null; }
export function setMapping(m: PathMapping): void;      // appelé au start_session
export function toHostUri(sandboxPath: string): vscode.Uri | null;
export function toSandboxPath(uri: vscode.Uri): string | null;
export function displayPath(sandboxPath: string): string;
```

Cas à couvrir (tests) : chemin sous le montage · chemin hors montage
(`/workspace/conversations/...`) · chemin absolu étranger (`/etc/passwd`) ·
traversée `..` · aucun dossier ouvert (`hostRoot === null`) · lien symbolique
sortant du montage · casse différente sur système insensible.

## 6. Thème

`theme/tokens.css` définit **toutes** les couleurs, chacune adossée à une variable
VS Code avec un fallback :

```css
:root {
  --agx-fg:          var(--vscode-foreground, #ccc);
  --agx-fg-muted:    var(--vscode-descriptionForeground, #9d9d9d);
  --agx-ok:          var(--vscode-charts-green, #89d185);
  --agx-warn:        var(--vscode-charts-yellow, #d7ba7d);
  --agx-error:       var(--vscode-charts-red, #f14c4c);
  --agx-added:       var(--vscode-gitDecoration-addedResourceForeground, #587c0c);
  --agx-deleted:     var(--vscode-gitDecoration-deletedResourceForeground, #8b2c2c);
  /* … */
}
```

Remplace `CONN_COLOR`, `HEALTH_COLOR`, `CHANGE_BADGE` et les hex disséminés.
Remplace aussi les `opacity: 0.6`/`0.7` par `--agx-fg-muted` (05-TESTING §7).

## 7. Tests

| Test | Attendu |
|---|---|
| `reducer.test.ts` | invariants I1–I8 de 05-TESTING §6 (I2/I3/I6 en `todo` jusqu'à C01) |
| `paths.test.ts` | les 7 cas du §5, dont les rejets |
| `persist.test.ts` | round-trip ; version inconnue ⇒ état vierge + notice |
| `routers.test.ts` | tout `type` de `messages.ts` est traité ; ajout d'un `type` ⇒ échec de compilation |
| `logging.test.ts` | `sk-...`, `ghp_...`, `Bearer ...` masqués |
| Discipline | les 10 tests de 05-TESTING §5 |
| Rendu | `Health.tsx`, `MessageItem.tsx` sur fixtures, en thème clair et sombre |
| Non-régression visuelle | capture des 5 écrans clés avant/après refactor, comparées à l'œil |

## 8. Pièges

| Piège | Conduite à tenir |
|---|---|
| `resolveWebviewView` peut être rappelée (déplacement du panneau). Le code actuel gère déjà en coupant le bridge précédent. | Ne pas casser en refactorant : ajouter un test qui appelle la méthode deux fois. |
| `retainContextWhenHidden` masque les bugs de persistance en développement. | Tester la persistance par **reload de fenêtre**, pas en cachant le panneau. |
| Le debounce de 2,5 s sur `closed` et le re-`list_mcp_servers` à la reconnexion corrigent un bug réel (AgenticEnv WP08c §3). | Les préserver explicitement, avec un test du faux bridge. |
| Un refactor « à comportement constant » dérive vite. | Faire le refactor **avant** toute nouveauté, et le livrer seul. |

## 9. Critères d'acceptation

- [x] `components.tsx` n'existe plus ; le dossier vide `webview/components/` est supprimé.
- [x] Aucun **module** `.ts`/`.tsx` de `src/webview/` ne dépasse 200 lignes. *(Exception assumée : `theme/base.css`, ~440 lignes — feuille de style, pas de logique ; l'arborescence cible ne prévoit qu'un seul `base.css`. À scinder si un reviewer l'exige.)*
- [x] `reduce` est testée sans DOM ni React (`test/unit/reducer.test.ts`, `eventItems`, `persist`, `paths`, `logging`).
- [x] Aucun hex hors `theme/tokens.css` (test de discipline `no-hardcoded-colors` vert).
- [x] L'état survit à un reload de la webview : `getState`/`setState` + `PersistedState.version` (I7 testé). *(Reload **complet de fenêtre** à confirmer en F5, cf. ci-dessous.)*
- [x] Tests de discipline verts : `no-vscode-in-webview`, `no-jsx-in-host`, `single-path-translator`, `no-hardcoded-colors`, `no-empty-catch`, `exhaustive-routers` (×2), `no-default-export`, `settings-declared`, `render-purity`, `bundle-budget`.
- [x] `.vsix` produit (`vsce package --no-dependencies` — 3 fichiers `dist/` seulement) ; workflow CI `.github/workflows/ci.yml`.
- [x] `npm run typecheck`, `npm run lint`, `npm test` verts (13 fichiers, 59 tests + 4 `todo` C01).
- [ ] **F5 dans un vrai VS Code** — non effectué dans cet environnement (pas de VS Code GUI). À faire avant merge : les 5 écrans (picking, chat, outil déplié, confirmation, panneau santé) identiques à l'avant-refactor, en thème clair **et** sombre, sidebar 250 px, et un reload complet de fenêtre en milieu de session.
- [ ] **Fixtures capturées du vrai bridge** (`test/fixtures/events/`) — non fournies (pas de bridge accessible pendant le refactor). Procédure dans `test/fixtures/events/README.md` ; C01/C02 en dépendent. Les tests C00 utilisent des événements synthétiques explicitement étiquetés.
