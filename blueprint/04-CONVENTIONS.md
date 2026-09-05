# 04 — Conventions

**À lire avant de coder.** Ces règles sont vérifiées, pour la plupart, par des
tests de discipline (05-TESTING §5).

---

## 1. TypeScript

| Règle |
|---|
| `strict: true`. Aucun `any` implicite ni explicite (`@typescript-eslint/no-explicit-any` en `error`). |
| Aucun `!` d'assertion non nulle. Si la valeur peut manquer, le type le dit et le code le gère. |
| Les unions discriminées se traitent par `switch` exhaustif + `assertNever(x)`. Pas de `default: break` silencieux. |
| Aucun `as` sur un objet venant du fil. Une donnée externe passe par un garde (`isXxx(v): v is Xxx`) ou un parseur. |
| Les types partagés hôte↔webview vivent dans `src/messages.ts` et `src/protocol.ts` — jamais dupliqués. |
| Pas d'export par défaut. |

## 2. React

| Règle |
|---|
| Composants fonctionnels, pas de classes. |
| `render/` est **pur** : mêmes props ⇒ même sortie. Pas de `useEffect`, pas de `postMessage`, pas d'horloge. |
| L'état vit dans le store. Un `useState` local est acceptable pour de l'éphémère non observable (un `open`/`closed` de repli), pas pour de la donnée métier. |
| Les listes portent une `key` **stable** issue de la donnée (`item.id`), jamais l'index. |
| Pas de `dangerouslySetInnerHTML` en dehors de `render/Markdown.tsx`, et uniquement sur une sortie assainie (C02 §4). |
| `useMemo` avec une liste de dépendances longue est un signal de mauvaise découpe — extraire un composant plutôt qu'allonger la liste. |

## 3. Style et thème

| Règle | Pourquoi |
|---|---|
| Le style vit dans des **fichiers CSS** avec classes, plus dans des objets `CSSProperties` inline. | lisibilité, pseudo-classes, media queries, coût de rendu |
| Toute couleur passe par une variable de `theme/tokens.css`, elle-même adossée à une variable VS Code. | l'extension doit suivre le thème de l'utilisateur, y compris les thèmes clairs et à fort contraste |
| **Aucun hex hors de `theme/tokens.css`**, fallbacks compris. | aujourd'hui `CONN_COLOR`, `HEALTH_COLOR`, `CHANGE_BADGE` codent des couleurs en dur : illisibles en thème clair |
| Statuts : utiliser `--vscode-charts-{green,yellow,red,blue}` et `--vscode-gitDecoration-*`, pas des hex choisis à la main. | ces tokens existent précisément pour ça |
| Tester en **Dark+, Light+ et Dark High Contrast** avant de clore une UI. | un contraste correct en sombre peut être illisible en clair |
| Densité : la sidebar peut faire 250 px. Aucun élément ne doit provoquer de scroll horizontal du corps. | 05-TESTING §5 |

## 4. Sécurité

| Règle |
|---|
| CSP inchangée : `default-src 'none'`, `script-src 'nonce-…'`. Toute demande de l'assouplir est refusée par défaut et doit être argumentée dans le WP. |
| Le markdown du modèle est assaini par une allowlist de balises et d'attributs. Les schémas d'URL autorisés sont `http`, `https`, `command:` (uniquement pour nos propres commandes) et `file:` traduit. |
| Une commande shell affichée est **échappée à l'affichage** et n'est jamais exécutée sans passer par `permissions/policy.ts`. |
| Aucun secret dans les logs. `logging.ts` masque ce qui ressemble à un token (`sk-…`, `ghp_…`, `Bearer …`). |
| Aucune requête réseau hors `127.0.0.1`. Aucune télémétrie. |
| Les fichiers listés par `context/ignore.ts` (`.env`, `*.pem`, `id_rsa`, …) ne sont jamais attachés automatiquement — seulement sur geste explicite, avec avertissement. |

## 5. Erreurs et journalisation

| Règle |
|---|
| Un `catch` vide est interdit. Au minimum `log.debug(...)` avec la raison. Le code actuel en contient plusieurs (`bridgeClient` frames malformées, `extension.pollHealth`) : les instrumenter. |
| Une erreur visible par l'utilisateur dit **quoi faire**, pas seulement ce qui a échoué. Un `notice` porte des `actions`. |
| Les codes d'erreur viennent de la table de [03-PROTOCOL.md](03-PROTOCOL.md) §5. Pas de chaîne libre comme identifiant. |
| L'`OutputChannel` « AgenticEnv Chat » reçoit tout le trafic bridge en niveau `trace`. C'est le premier outil de diagnostic. |

## 6. Performance

| Budget | Valeur |
|---|---|
| `dist/webview.js` minifié | ≤ **1,5 Mo** (vérifié en CI) |
| `dist/extension.js` minifié | ≤ 400 Ko |
| Temps entre `postMessage` et peinture d'un delta | ≤ 50 ms (fil de 500 items) |
| Fil sans virtualisation | jusqu'à 200 items ; au-delà, virtualiser (C14) |
| Sondage santé | 8 s, **uniquement** quand la vue est visible (déjà le cas — ne pas régresser) |

Règles : coalescer les `event_delta` sur un `requestAnimationFrame` plutôt que
re-rendre par fragment ; ne jamais reformater du markdown déjà rendu pour un item
figé (mémoriser par `item.id` + `revision`).

## 7. Git et commits

| Règle |
|---|
| Une branche par WP : `wp/C0X-slug`. |
| Un commit décrit un **comportement**, pas un fichier. Le corps dit *pourquoi*. |
| Un changement de `src/protocol.ts` cite le commit correspondant côté AgenticEnv, et inversement. Les deux ne partent jamais séparément. |
| Le blueprint est mis à jour **dans le même commit** que le code qui le contredit. |

## 8. Definition of Done (contribution unitaire)

- [ ] `npm run typecheck` passe.
- [ ] `npm run lint` passe (0 warning).
- [ ] `npm test` passe, y compris les tests de discipline.
- [ ] Nouveau comportement couvert par au moins un test unitaire ou de rendu.
- [ ] **Vu fonctionner dans un vrai VS Code (F5)** — pas seulement compilé.
- [ ] Vérifié en thème clair **et** sombre, et en sidebar étroite (250 px).
- [ ] Aucune valeur de configuration en dur ; tout réglage déclaré dans `package.json`.
- [ ] Aucun hex hors `theme/tokens.css`.
- [ ] Les messages ajoutés au protocole figurent dans [03-PROTOCOL.md](03-PROTOCOL.md).
- [ ] Le WP concerné a ses cases d'acceptation cochées, ou dit explicitement ce qui reste.
- [ ] `docs/parity-copilot-claude-code.md` : les items couverts sont marqués faits.
