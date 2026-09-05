# 05 — Stratégie de test

**À lire avant de coder.** Le repo n'a **aucun test** aujourd'hui. C00 installe le
harnais ; chaque WP suivant l'alimente.

---

## 1. Pyramide

| Niveau | Outil | Ce qu'il couvre | Coût |
|---|---|---|---|
| **Unitaire** | `vitest` (Node) | réducteur, sélecteurs, `paths.ts`, `policy.ts`, parseurs de diff, budget de contexte | ms |
| **Rendu** | `vitest` + `jsdom` + Testing Library | composants de `render/` et `views/` sur fixtures | ms |
| **Intégration webview↔hôte** | `vitest` + faux bridge | scénario complet sans VS Code (les deux routeurs, la machine à états) | s |
| **E2E** | `@vscode/test-electron` | activation, commandes, webview réellement montée | dizaines de s |
| **Manuel (F5)** | œil humain | thèmes, densité, ressenti de latence | — |

Règle : **la machine à états et la traduction de chemins sont testées
unitairement, sans exception.** Ce sont les deux endroits où un bug est
silencieux et coûteux.

## 2. Fixtures : de vrais événements

Le rendu ne se teste pas sur des événements inventés. `test/fixtures/events/`
contient des `Event.model_dump(mode="json")` **capturés depuis le bridge**.

| Fixture | Contenu |
|---|---|
| `message-simple.json` | réponse assistant courte |
| `message-markdown.json` | titres, listes, tableau, 3 blocs de code de langages différents |
| `action-bash.json` / `observation-bash.json` | commande + sortie longue |
| `action-edit.json` / `observation-edit.json` | édition de fichier avec diff |
| `action-read.json` | lecture avec plage de lignes |
| `agent-error.json` | erreur d'agent |
| `turn-full.jsonl` | **un tour complet**, dans l'ordre du fil, rejouable |

Procédure de capture : lancer le bridge avec le trace log activé, faire un tour
réel, copier les frames. Une fixture inventée à la main est refusée en revue —
elle ne prouve rien sur le format réel.

## 3. Faux bridge

`test/fake-bridge/server.ts` : un serveur WebSocket qui rejoue un `.jsonl` avec
des délais paramétrables. Il doit savoir simuler, **explicitement** :

| Scénario | Pourquoi |
|---|---|
| Tour nominal | cas passant |
| Tour de 20 min | vérifie qu'aucun timeout client ne se déclenche (primer §5) |
| Coupure en plein tour puis reconnexion | vérifie `resume` et la non-perte du fil |
| `turn_finished` jamais envoyé | le client ne doit pas rester bloqué sans issue : bouton Stop toujours actif |
| Deltas arrivant après l'`event` final | le final gagne |
| Frame malformée | ignorée + `log.debug`, pas de crash |
| Bridge v1 (ne répond pas à `hello`) | repli dégradé annoncé dans la bannière |
| Charge utile de 5 Mo | tronquée, webview vivante |
| `files_changed` de 200 entrées | pas de blocage du rendu |

## 4. Test de dérive du protocole

`src/protocol.ts` est un miroir manuel (décision D4). Sans garde-fou, il dérive.

`test/discipline/protocol-drift.test.ts` :

1. lit `openhands_bridge/protocol.py` (chemin donné par `AGENTICENV_PATH`, sinon
   le réglage `agenticenvChat.agenticEnvPath`, sinon **skip avec avertissement**) ;
2. extrait les noms de classes et les littéraux `type: Literal["…"]` ;
3. compare à l'union `Outbound`/`Inbound` de `src/protocol.ts` ;
4. échoue en listant les écarts dans les deux sens.

Le test **skippe** proprement si AgenticEnv n'est pas disponible (CI publique),
mais **doit tourner** en local avant toute release.

## 5. Tests de discipline

Ils encodent les règles d'architecture. Ils sont bon marché et rattrapent les
dérives structurelles que la revue laisse passer.

| Test | Règle vérifiée |
|---|---|
| `no-vscode-in-webview` | aucun `from "vscode"` sous `src/webview/` |
| `no-jsx-in-host` | aucun `.tsx` sous `src/` hors `src/webview/` |
| `single-path-translator` | le littéral `/workspace/project` n'apparaît que dans `src/paths.ts` |
| `no-hardcoded-colors` | aucun `#rrggbb` hors `theme/tokens.css` |
| `no-empty-catch` | tout `catch` contient au moins un appel à `log.*` |
| `exhaustive-routers` | les deux routeurs de messages compilent avec `assertNever` |
| `no-default-export` | conformité §1 de 04-CONVENTIONS |
| `bundle-budget` | tailles de `dist/*.js` sous les seuils de 04-CONVENTIONS §6 |
| `settings-declared` | tout `getConfiguration("agenticenvChat").get("x")` a un `x` déclaré dans `package.json` |
| `render-purity` | aucun `useEffect`/`useState`/`postMessage` sous `src/webview/render/` |

## 6. Invariants de la machine à états

Testés exhaustivement dans `test/unit/reducer.test.ts` :

| # | Invariant |
|---|---|
| I1 | `usage` et `files_changed` ne changent **jamais** `phase`. |
| I2 | `phase.kind === "running"` implique un `turnId` non vide issu d'un `turn_started`. |
| I3 | Un `turn_finished` avec un `turn_id` inconnu est ignoré (log), pas appliqué. |
| I4 | Une déconnexion préserve `items` et le brouillon du composer. |
| I5 | `awaiting` ne s'atteint que depuis `running` et revient en `running`. |
| I6 | Deux `turn_started` consécutifs sans `turn_finished` ⇒ le second est ignoré + notice (bug bridge, visible). |
| I7 | L'hydratation depuis un `PersistedState` de version inconnue produit un état vierge, jamais un état partiel. |
| I8 | Le fil est append-only sauf `patchItem` sur un `id` existant. |

Chaque WP qui ajoute un état ajoute ses invariants ici.

## 7. Tests d'accessibilité (C14, mais à ne pas repousser en bloc)

| Vérification |
|---|
| Tout contrôle interactif est atteignable au clavier, dans un ordre logique. |
| Le fil annonce l'arrivée d'une réponse via une région `aria-live="polite"`. |
| Les boutons icônes ont un `aria-label`. |
| Le contraste des textes secondaires (`opacity: 0.6` est utilisé partout aujourd'hui) est vérifié : **préférer une couleur de token `descriptionForeground` à une opacité**, qui casse le contraste en thème clair. |

## 8. CI

`.github/workflows/ci.yml` sur `node:20` :

```
npm ci → typecheck → lint → test → build --production → bundle-budget → vsce package --no-dependencies
```

Le `.vsix` est publié comme artefact de build sur chaque PR. Les tests E2E
`@vscode/test-electron` tournent sur `main` uniquement (lents, besoin d'un
affichage virtuel).
