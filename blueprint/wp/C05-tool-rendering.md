# C05 — Rendu des appels d'outils

> **Contexte** : un appel d'outil s'affiche aujourd'hui comme `▸ tool_name`, la
> pensée en italique, et un bouton qui déplie du JSON brut. C'est illisible :
> lire `{"command":"str_replace","path":"/workspace/project/src/black.cpp",
> "old_str":"…400 caractères…"}` ne dit pas ce qui s'est passé.
>
> Claude Code affiche « Edited `black.cpp` · +12 −3 ». C'est la même information,
> pré-digérée. Ce WP construit le registre qui permet ça, outil par outil, avec un
> repli générique qui reste correct pour les outils inconnus (les MCP en ajoutent).

**Fichiers à lire** : ce fichier · [C02-thread-rendering.md](C02-thread-rendering.md) ·
[C01-turn-protocol.md](C01-turn-protocol.md) §5 · [05-TESTING.md](../05-TESTING.md) §2

**Dépend de** : C01, C02. **Bloque** : C07, C09. **Parallélisable avec** : C03.

**Items du catalogue** : 30 (section « références utilisées »), 35 (vue conviviale
plutôt que JSON), 36 (rendu par type d'outil), 37 (repli par défaut, sortie
scrollable), 40 (regroupement et compteurs), 43 (tooltip avec les args complets),
45 (« voir tout » sur sortie tronquée).

---

## 1. Registre

```ts
// webview/tools/registry.tsx
export interface ToolRenderer {
  /** Nom(s) d'outil, ou prédicat pour les familles MCP. */
  match: string | ((toolName: string) => boolean);
  /** Ligne d'entête, toujours affichée, une seule ligne. */
  summary(call: ToolCall): React.ReactNode;
  /** Corps déplié. Optionnel : sans lui, on montre le JSON formaté. */
  body?(call: ToolCall, obs: ToolObservation | null): React.ReactNode;
  /** Icône Codicon. */
  icon: string;
}

export function rendererFor(toolName: string): ToolRenderer;  // ne renvoie jamais null
```

| Règle |
|---|
| `rendererFor` renvoie **toujours** quelque chose : le repli générique (§4) est un renderer comme les autres. Un outil MCP inconnu doit rester lisible. |
| Un renderer est **pur** (04-CONVENTIONS §2) : il vit sous `render/`-discipline même s'il est rangé dans `tools/`. |
| Le `summary` tient sur **une ligne** et ne dépasse jamais la largeur : ellipse au milieu du chemin, pas à la fin (`src/…/black.cpp` reste plus utile que `src/pricing/very/lon…`). |

## 2. Renderers à livrer

Les noms d'outils réels sont ceux du SDK OpenHands `[À CONFIRMER]` — les relever
sur des fixtures capturées (05-TESTING §2), pas les deviner.

| Famille | Résumé | Corps déplié |
|---|---|---|
| Lecture de fichier | `Read black.cpp:12-80` | extrait colorié via `CodeBlock`, plage réelle |
| Édition / remplacement | `Edit black.cpp · +12 −3` | **diff unifié** via `render/Diff.tsx` (C02 L5) |
| Création de fichier | `Create tests/test_black.cpp · 84 lines` | contenu colorié, replié |
| Commande shell | `$ ctest --output-on-failure` | sortie en `<pre>` scrollable + code de sortie |
| Recherche (grep/glob) | `Search "operator*" · 14 matches in 6 files` | liste cliquable `chemin:ligne` |
| Liste de répertoire | `List src/pricing · 23 entries` | arbre compact |
| Outil MCP | `kb.search · 5 results` | rendu générique + `label`/`citation` si présents |
| Édition Jupyter / autre | repli générique | JSON formaté |

Pour les diffs (`+12 −3`), les compteurs sont calculés à partir du diff réel quand
il est disponible (C06 `file_diff`), sinon à partir de `old_str`/`new_str`. La
source du compte est indiquée en tooltip — on ne fait pas passer une estimation
pour une mesure.

## 3. États et progression (item 39, avec C01)

| État | Rendu |
|---|---|
| `running` | icône ⟳ animée + libellé `progress` s'il y en a un |
| `ok` | icône ✓ discrète, la ligne ne bouge pas |
| `error` | icône ✗ + le corps est **déplié par défaut** (une erreur qu'on doit ouvrir est une erreur qu'on ne lit pas) |
| aucun statut reçu | ⟳ jusqu'à l'`ObservationEvent` correspondant, apparié par `tool_call_id` |

L'appariement action↔observation se fait par `tool_call_id`. Aujourd'hui les deux
sont deux items indépendants dans le fil ; C05 les **fusionne en un seul item**
`ToolItem { call, observation | null, status }`. C'est ce qui permet
« Edit black.cpp · +12 −3 » sur une seule ligne au lieu de deux lignes muettes.

> Conséquence sur le store : `eventToItems` ne peut plus être une fonction pure
> événement→items. Elle devient une réduction avec accès à `itemIndex` (C00 §3)
> pour retrouver l'action à compléter. Une observation orpheline (pas d'action
> connue) est rendue seule, jamais perdue.

## 4. Repli générique (item 37)

Pour tout outil sans renderer dédié :

```
▸ some_mcp.tool_name                                    ⟳
  { … JSON formaté, replié, scrollable, tronqué à 200 lignes … }
```

| Règle |
|---|
| Le JSON est **formaté** (2 espaces) et colorié comme du `json`. |
| Les valeurs de type chaîne longue (> 500 caractères) sont repliées individuellement. |
| Les clés qui ressemblent à un chemin sont rendues en `FileLink`. |
| Le survol de l'entête montre les args complets en tooltip (item 43) — utile quand tout est replié. |

## 5. Regroupement (item 40)

Une série d'outils consécutifs du **même type** sans texte assistant entre eux est
regroupée :

```
▾ Searched the codebase · 6 tools
    Search "operator*" · 14 matches
    Read black.cpp:1-40
    …
```

| Règle |
|---|
| Regroupement à partir de 3 outils consécutifs. |
| Un groupe est replié par défaut **sauf** s'il contient une erreur. |
| Le résumé du groupe est dérivé des outils (« Searched the codebase », « Edited 4 files »), jamais d'un texte inventé sur ce que l'agent « pensait ». |
| Le dernier outil d'un groupe en cours reste visible et déplié : on doit voir ce qui tourne. |

## 6. Références utilisées (item 30)

En fin de tour, une section repliée « Used N references » liste les fichiers **lus**
pendant le tour, dédupliqués, avec les plages fusionnées :

```
▸ Used 5 references
    src/pricing/black.cpp:1-40, 112-140
    include/pricing/black.hpp:1-60
```

Chaque entrée est cliquable. C'est reconstruit côté client à partir des outils de
lecture du tour — pas un nouveau message de protocole.

## 7. Sortie longue (item 45)

Reprend la politique de C02 §8 (200 lignes / 20 Kio, début+fin, « Show all »,
« Open in editor » au-delà de 2000 lignes). Une sortie de commande garde en plus
un **filtre rapide** : champ de saisie qui masque les lignes non correspondantes,
sans re-rendre l'item. Utile sur une sortie de `ctest` de 3000 lignes.

## 8. Tests

| Test | Attendu |
|---|---|
| `registry.test.ts` | `rendererFor` ne renvoie jamais `null` ; un nom inconnu ⇒ repli |
| Un test de rendu **par famille** sur fixture réelle | le résumé tient sur une ligne, l'information clé y est |
| Appariement | action + observation ⇒ un seul item ; observation orpheline ⇒ item seul |
| Erreur | corps déplié par défaut |
| Regroupement | 3+ outils consécutifs groupés ; groupe avec erreur non replié |
| Chemins | tous les chemins passent par `paths.ts`, aucun lien mort |
| Références | plages fusionnées, doublons supprimés |
| Sortie de 5000 lignes | rendu < 50 ms, filtre fonctionnel |

## 9. Critères d'acceptation

- [x] Familles `file_editor` / `terminal` / `grep` / `glob` : résumé pré-digéré, plus de JSON brut. Repli générique (JSON colorié, chaînes > 500 car. abrégées) pour le reste.
- [x] `str_replace` → `render/Diff.tsx` (LCS pur) ; compteurs `+A −B` avec source signalée (`(est.)` si dérivés de `old_str`/`new_str`, sinon `old_content`/`new_content`).
- [x] Outil MCP inconnu → repli générique, entête = nom nu, args en tooltip.
- [x] Action + observation appariées par `tool_call_id` → **un seul** `ToolItem` ; observation orpheline rendue seule, jamais perdue (`reduceTurn.applyEvent`).
- [x] Erreur d'outil : `status: "error"` (dérivé de `exit_code`/`error`) + corps **déplié par défaut**.
- [x] Regroupement : 3+ outils consécutifs de la même famille → groupe replié ; libellé dérivé (`Searched the codebase`, `Edited files`…), jamais inventé ; groupe avec erreur déplié ; dernier outil d'un groupe en cours visible.
- [x] « Used N references » (item 30) reconstruit côté client depuis les `view`, plages fusionnées.
- [x] 115 tests (registry jamais `null`, résumés une-ligne, fusion, regroupement, diff).
- [x] **Noms d'outils réels relevés dans `~/AgenticEnv/.venv/.../openhands/tools/`** : `file_editor`, `terminal`, `grep`, `glob`, `apply_patch`, `task_tracker`, `browser`, `finish` (dérivés du nom de classe via `_camel_to_snake`). `[À CONFIRMER]` levé pour les principaux.
- [ ] **Différé** : filtre rapide sur sortie de commande longue (C05 §7), renderers `apply_patch` / `task_tracker` (ce dernier relève de C09) / `browser` — repli générique en attendant.
- [ ] **Icônes** : glyphes texte (`✎ $ ⌕ ▸`) au lieu de codicons — la webview n'embarque pas la police codicon (asset + font-src). À reconsidérer en C14.
- [ ] **F5** : tour de 40 outils, diff lisible, thèmes.
