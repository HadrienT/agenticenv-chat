# 00 — PRIMER (à lire par tout agent, sans exception)

> Contexte minimal complet. Durée de lecture : ~4 minutes. Vous n'avez pas besoin
> de lire le blueprint d'AgenticEnv pour travailler ici.

---

## 1. Ce qu'on construit

Une **extension VS Code** : un panneau de chat agentique, au niveau de finition de
GitHub Copilot Chat et de Claude Code, mais branché sur un agent **local**.

```
Vous ──► panneau de chat (ce repo) ──WS──► openhands-bridge ──► agent-server (Docker) ──► llama-server (GPU local)
```

Trois choses distinctes, à ne jamais confondre :

| | Quoi | Où |
|---|---|---|
| **Le client** | `agenticenv-chat` — l'extension VS Code | **ce repo** |
| **L'atelier** | `AgenticEnv` — bridge, sandbox, MCP, modèles | https://github.com/HadrienT/AgenticEnv |
| **Le produit** | `quant-modeling` — la bibliothèque C++ que l'agent aide à écrire | https://github.com/HadrienT/quant-modeling |

Ce repo est un **client**. Il affiche, il collecte du contexte, il envoie. Il ne
raisonne pas.

## 2. Les 4 principes non négociables

**(P1) Le client n'est pas l'agent.**
Aucune boucle d'agent, aucun exécuteur d'outil, aucun appel LLM depuis
l'extension. Si une fonctionnalité demande que l'agent se comporte autrement,
elle se règle dans le bridge ou l'`agent-server`, **jamais** en la simulant côté
client.

**(P2) La webview est un bac à sable.**
La webview ne touche ni au disque, ni au réseau, ni à Docker, ni à `systemd`. Elle
n'a que `postMessage`. Toute capacité passe par l'hôte d'extension, qui la valide.

**(P3) L'état affiché est l'état rapporté.**
On n'invente pas d'état par heuristique. Si le bridge ne dit pas qu'un tour est
fini, l'UI ne prétend pas qu'il est fini. Un manque d'information se règle en
ajoutant un message au protocole, pas en devinant.

**(P4) L'agent a déjà écrit.**
Contrairement à Copilot, l'agent édite les fichiers **directement** (le dossier
hôte est bind-monté dans le sandbox). Le modèle mental « propose puis j'accepte »
ne s'applique pas : ici c'est « a fait, je peux annuler ». Cela oriente toute la
conception de C06 vers les **checkpoints et l'annulation**, pas vers un
accept/reject préalable.

## 3. Ce qu'on ne construit PAS

- Pas de réimplémentation d'ACP : le protocole du bridge est plus riche.
- Pas de deuxième client (web, terminal) : VS Code uniquement.
- Pas d'indexation sémantique du code côté extension : c'est `kbase` dans AgenticEnv.
- Pas de télémétrie, pas d'appel réseau sortant hors `127.0.0.1`.
- Pas de complétion inline (ghost text) : `llama-server` sert un modèle de chat,
  pas un modèle de complétion basse latence.

## 4. Décisions verrouillées (ne pas rediscuter)

| # | Sujet | Décision |
|---|---|---|
| D1 | Transport | WebSocket JSON vers `openhands-bridge` sur `127.0.0.1`. Réglage `agenticenvChat.bridgeUrl`. |
| D2 | UI | React 18 + esbuild, bundle IIFE unique dans `dist/webview.js`. Pas de framework supplémentaire. |
| D3 | Frontière | Toute capacité (fs, git, terminal, docker) vit dans l'hôte d'extension. La webview demande, l'hôte décide. |
| D4 | Protocole | `src/protocol.ts` est un miroir **manuel** de `openhands_bridge/protocol.py`. Un test de dérive est **obligatoire** (voir 05-TESTING §4). |
| D5 | Thème | Couleurs exclusivement via les variables CSS de VS Code. Aucun hex en dur en dehors de `theme.css` (fallbacks compris). |
| D6 | CSP | `default-src 'none'`, script par `nonce`, aucune ressource distante, **jamais** `unsafe-eval`. Cela **exclut** toute bibliothèque qui compile à l'exécution (voir §5). |
| D7 | Session | Une session à la fois, tant que le bridge est mono-session. Le multi-session est un besoin bridge, pas un contournement client. |
| D8 | Stockage | État de conversation dans `ExtensionContext.workspaceState` + `storageUri`. Jamais dans `globalState` (le contexte est propre au dossier). |
| D9 | Langue | UI en anglais. Blueprint, commentaires de décision et docs en français. |
| D10 | Chemins | Tout chemin venant de l'agent est **sandbox-relatif** et doit passer par le traducteur unique (voir 01-ARCHITECTURE §5). Aucun `path.join` ad hoc sur un chemin d'agent. |

## 5. Contraintes techniques à connaître avant de choisir une bibliothèque

Ces contraintes ont déjà éliminé des choix évidents. Les relire avant d'ajouter
une dépendance.

| Contrainte | Conséquence |
|---|---|
| **CSP sans `unsafe-eval`** | Exclut les moteurs de template qui `new Function(...)`. Vérifier chaque candidat dans une vraie webview, pas seulement dans un test Node. |
| **Aucune ressource distante** | Polices, thèmes de coloration, workers : tout doit être **inliné** dans le bundle. Pas de CDN, pas de `fetch`. |
| **Budget de bundle** | `dist/webview.js` ≤ **1,5 Mo** minifié. Un highlighter qui embarque 200 grammaires ne rentre pas : charger un sous-ensemble de langages (voir C02 §3). |
| **Markdown non fiable** | Le contenu vient d'un LLM. Le rendu doit **assainir** (pas de `<script>`, pas de `javascript:`, pas d'`<iframe>`). Un LLM peut produire du HTML hostile parce qu'un fichier lu en contenait. |
| **Tours très longs** | Avec `ConfirmRisky()` sur un 30B local, un tour trivial peut dépasser **600 s**. Aucun timeout client sous 1200 s. Ne jamais supposer qu'un tour dure quelques secondes. |
| **GPU partagé** | Si un autre job GPU tourne, `llama-server` peut boucler sur `cudaMalloc failed`. Le panneau Components existe pour rendre ça visible — ne pas le supprimer en refactorant. |
| **`retainContextWhenHidden`** | La webview garde son état quand elle est cachée, mais **pas** au reload de la fenêtre. `getState`/`setState` reste nécessaire. |

## 6. État de départ (commit `2de7e65`)

Ce qui existe et **fonctionne** : panneau webview, client WS avec reconnexion à
backoff, sélecteur MCP pré-session, streaming des événements SDK, bulles de chat,
lignes d'outil dépliables, liste des fichiers modifiés, jauge de contexte, carte
Allow/Reject, et un **panneau Components** (santé bridge / llama-server /
llama-bridge / Docker / image / GPU avec actions start/stop/restart/pull).

Ce qui est **dette assumée**, traité par C00 et C01 :

- `src/webview/components.tsx` — 480 lignes, styles inline, tout dans un fichier.
  `src/webview/components/` existe mais est **vide**.
- `App.tsx` — 12 `useState` indépendants, pas de réducteur, `useMemo` avec une
  liste de dépendances fragile.
- L'état `running` est une heuristique remise à `false` sur `files_changed` **ou**
  `usage` : viole P3, casse dans les deux sens.
- Aucun `getState`/`setState` : tout est perdu au reload.
- Pas de tests du tout.

## 7. Definition of Done (rappel)

Voir [04-CONVENTIONS.md](04-CONVENTIONS.md) §8 pour la liste complète. Le minimum :
`npm run typecheck`, `npm run lint`, `npm test` verts, et **la fonctionnalité a été
vue fonctionner dans un vrai VS Code (F5)** — pas seulement compilée.
