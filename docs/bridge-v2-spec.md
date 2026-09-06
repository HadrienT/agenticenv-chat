# openhands-bridge — spécification du protocole v2

> **Pour** : la session qui développe `AgenticEnv/packages/openhands-bridge`.
> **Source de vérité** : `agenticenv-chat/src/protocol.ts` (mirroir TS du fil) et
> `agenticenv-chat/blueprint/03-PROTOCOL.md`. En cas de doute, `protocol.ts` gagne
> — c'est lui que le test de dérive vérifie.
> **Statut client** : tout le v2 est **déjà implémenté côté extension** et gaté
> derrière la négociation de capability. Le client parle v1 dégradé aujourd'hui.
> Ce document décrit ce que le bridge doit livrer pour « rattraper ».

---

## 0. Ce qui existe déjà (v1) et ce qui manque

`packages/openhands-bridge` aujourd'hui (`protocol.py` / `server.py`) :

| Sens | Messages v1 en place |
|---|---|
| client → bridge | `start_session`, `user_message {text}`, `confirm_action {accept}`, `list_mcp_servers` |
| bridge → client | `session_started`, `event`, `files_changed`, `usage`, `awaiting_confirmation`, `error`, `mcp_servers` |

Le client s'en contente en **mode dégradé** : chat streamé, liste des fichiers
modifiés, jauge de contexte + coût, sélecteur MCP, cartes accept/reject. Il perd
tout le reste (bouton Stop, frontières de tour, diffs par fichier, todo,
changement de modèle, compaction, reprise après coupure).

Le v2 ajoute : une **négociation** `hello`/`welcome`, un entier `seq` monotone,
et ~15 messages, chacun gaté par une **capability**. Le bridge annonce les
capabilities qu'il supporte ; le client n'émet un message v2 que si la capability
correspondante est annoncée. **Le bridge peut donc livrer le v2 morceau par
morceau** — chaque capability est indépendante.

### Contrat « client en avance »

`src/protocol.ts` liste dans `CLIENT_AHEAD_OF_BRIDGE` tous les discriminants v2
que le client connaît mais que le bridge n'a pas encore. Le test de dérive
(`test/discipline/protocol-drift.test.ts`, côté extension) tolère exactement ces
entrées. **À chaque capability livrée côté bridge, retirer les discriminants
correspondants de `CLIENT_AHEAD_OF_BRIDGE`** (commit croisé dans le dépôt
`agenticenv-chat`). Quand la liste est vide, les deux moitiés sont alignées.

### Découplage SDK

`openhands_bridge` **n'importe pas `openhands.*`** (contrat import-linter). Il
passe par `openhands_adapter` (`AgentSession`, `Event`,
`ConversationStateUpdateEvent`, …). Toutes les indications « côté SDK » ci-dessous
sont des pistes ; l'implémentation réelle passe par l'adaptateur, en l'étendant si
besoin.

---

## 1. Négociation — `hello` / `welcome` (prérequis de tout le reste)

### `hello` (client → bridge), **premier message de chaque connexion**

```jsonc
{ "type": "hello", "protocol": 2, "client": "agenticenv-chat/0.4.0" }
```

- Ajouter `Hello` à `InboundMessage` : `type: Literal["hello"]`, `protocol: int`,
  `client: str`.
- Le client l'envoie en **tout premier**, avant `list_mcp_servers` / `resume`.

### `welcome` (bridge → client), **réponse immédiate à `hello`**

```jsonc
{ "type": "welcome", "protocol": 2,
  "capabilities": ["turns", "deltas", "cancel", "diffs", "todo",
                   "checkpoints", "apply", "compact", "interrupt", "models"] }
```

- `protocol` : entier. Le client considère `< 2` comme dégradé.
- `capabilities` : sous-ensemble de
  `{turns, deltas, cancel, diffs, todo, checkpoints, apply, compact, interrupt, resume, models}`
  (liste `Capability` dans `protocol.ts`). N'annoncer **que** ce qui est
  réellement implémenté et testé.
- **État bridge AgenticEnv (WP08d livré)** : annonce
  `["turns", "cancel", "diffs", "checkpoints", "apply"]`. La capability `apply`
  (ajoutée par WP08d, hors liste d'origine) déclenche `apply_changes` /
  `discard_changes` / `request_bundle_diff` et la réponse `changes_applied` /
  `bundle_diff` / `checkpoint_restored`. Sous WP08d l'agent travaille sur une
  **copie jetable** du projet côté sandbox : `diffs` et `checkpoints` ne sont
  plus « l'hôte s'en passe » mais le **seul** moyen de voir/annuler le travail
  avant `apply_changes` (voir AgenticEnv `blueprint/wp/WP08d-sandbox-working-copy.md`).

### Comportement client actuel (à connaître)

- Si `welcome` arrive → v2, capabilities appliquées.
- Si le bridge **rejette** `hello` (erreur `VALIDATION_ERROR` — c'est ce que fait
  la v1 aujourd'hui) **ou** ne répond rien sous 2 s → le client bascule en v1
  dégradé, **silencieusement**, et n'émet plus aucun message v2.
- Donc : tant que `hello` n'est pas dans `InboundMessage`, la v1 rejette et le
  client dégrade proprement. **Première chose à livrer** : accepter `hello` et
  répondre `welcome` (même avec `capabilities: []` au début — ça suffit à sortir
  du mode « rejet »).

---

## 2. `seq` monotone + `resume`

### `seq`

> Requis dès que la capability `turns` (ou toute autre) est annoncée.

Chaque message **bridge → client** porte un champ optionnel `seq: int`,
stritement croissant **sur la connexion ET sur la conversation** (un seul
compteur, incrémenté à chaque `_send`). Sert à `resume`.

- `welcome`, `mcp_servers`, etc. — tout est numéroté.
- Ajouter `seq` à un modèle de base partagé (l'équivalent de `class Seq` côté
  client).

### `resume` (client → bridge) — capability `resume`

```jsonc
{ "type": "resume", "conversation_id": "…", "last_seq": 42 }
```

> **Gaté sur une capability `resume`.** Le client n'émet `resume` que si `welcome`
> l'annonce. Un bridge qui ne l'annonce pas (l'état AgenticEnv actuel) fait que le
> client **efface** la conversation persistée et retourne à l'écran de sélection —
> plutôt que d'afficher un composer sur une session que le bridge ne connaît plus.
> Donc : soit livrer `resume` **complet** (buffer + `resumed`), soit ne rien
> annoncer ; pas de demi-mesure.

Envoyé par le client **après `hello`** quand il a une conversation persistée
(reload de l'extension, coupure réseau). Le bridge doit :

1. Vérifier que `conversation_id` correspond à la session vivante.
   - Si non → `error {code: "UNKNOWN_CONVERSATION"}`. Le client efface sa session
     et repart de l'écran de sélection.
2. Si oui → **rejouer** tous les messages de `seq > last_seq` (buffer circulaire
   des N derniers outbound, N ≈ 500), puis envoyer `resumed`.

### `resumed` (bridge → client)

```jsonc
{ "type": "resumed", "seq": 128 }
```

Marque la fin du rejeu. Le client réarme sa machine à états.

> **Effort** : moyen. Buffer d'outbound + numérotation. Peut être livré en même
> temps que `turns` ou juste après.

---

## 3. Règles de fil (invariants que le client suppose)

Tirées de `blueprint/03-PROTOCOL.md §2.4`. Le client s'appuie dessus — les violer
casse le rendu.

| Règle | Détail |
|---|---|
| `turn_started` précède **tout** événement du tour | bufferiser si besoin (comme `_EventRelay` le fait déjà pour `session_started`). |
| `event_delta` ne remplace pas `event` | l'`event` final arrive **quand même** et **écrase** le texte accumulé. Un delta perdu ne corrompt pas le rendu. |
| `files_changed` et `usage` sont **informatifs**, jamais des marqueurs de fin de tour | en v1 le client s'en sert faute de mieux ; en v2 (`turns` annoncé) **seul `turn_finished` termine un tour**. |
| une `error` non fatale n'implique pas `turn_finished` | une `error` **fatale** est **toujours** suivie de `turn_finished {reason: "error"}`. |
| tout chemin est un **chemin conteneur absolu** | un seul point de traduction côté client (`src/paths.ts`). |
| charge utile > 256 Kio → tronquée par le bridge avec `truncated: true` | protège la webview. |
| un message pousse un **état complet** de son domaine (`todo`, `files_changed`) OU un append/patch explicite (`event`) | jamais de patch implicite. |

---

## 4. Messages bridge → client, par capability

Pour chaque bloc : forme du fil (snake_case), quand l'émettre, correspondance SDK.

### 4.1 capability `turns` — frontières de tour  *(le socle — commencer ici)*

```jsonc
{ "type": "turn_started",  "turn_id": "t-uuid", "seq": 10 }
{ "type": "turn_finished", "turn_id": "t-uuid",
  "reason": "completed" | "cancelled" | "error" | "max_iterations", "seq": 25 }
```

- **`turn_id`** : UUID généré par le bridge à chaque `conversation.run()`.
- **`turn_started`** : juste avant de déclencher le run, après avoir bufferisé.
- **`turn_finished`** : quand le run se termine. `reason` :
  - `completed` — `execution_status == "finished"`.
  - `error` — `AppError` / `ConversationRunError` levée (et envoyer l'`error`
    fatale **avant**).
  - `cancelled` — le run a été interrompu par un `cancel_turn` (voir `cancel`).
  - `max_iterations` — `execution_status` non terminal + compteur d'itérations
    atteint (`max_iteration_per_run` dans la config adaptateur). Le SDK expose
    l'info via l'état de la conversation ; sinon comparer le nombre d'`ActionEvent`
    au cap.
- Correspondance SDK : les transitions de `ConversationStateUpdateEvent(key="execution_status")`
  donnent les bornes (`running` → started, `finished`/`error`/… → finished).
  Le bridge tient déjà ce callback (`_EventRelay._dispatch`).

Le client, dès `turns` annoncé, pilote `idle ↔ running` **uniquement** sur ces
deux messages, et affiche le bouton **Stop**.

> **Effort** : faible. Deux `_send` autour du run + génération d'UUID.

---

### 4.2 capability `cancel` — `cancel_turn`

Client → bridge :

```jsonc
{ "type": "cancel_turn", "turn_id": "t-uuid" }
```

- Le bridge interrompt le run en cours (`conversation.pause()` /
  l'équivalent `RemoteConversation`).
- Émettre `turn_finished {reason: "cancelled"}` une fois l'arrêt effectif.
- Le tour reste dans le fil, marqué « cancelled », avec ce qui avait déjà été
  produit — donc **ne pas** effacer les `event` déjà envoyés.
- Si l'arrêt échoue/traîne : le client passe en `cancelling` sans timeout, un 2ᵉ
  clic propose « Force new session » (côté client, rien à faire).

> **Effort** : faible-moyen, selon ce que `RemoteConversation` expose pour
> interrompre un run en vol.

---

### 4.3 capability `deltas` — streaming incrémental

```jsonc
{ "type": "event_delta", "turn_id": "t-uuid",
  "event_id": "<SdkEvent.id de l'événement final>", "text": "fragment", "seq": 14 }
```

- `event_id` **doit** être l'`id` du `MessageEvent` qui arrivera ensuite en
  `event` (le client relie les deltas à l'événement final par cet id).
- Le client concatène les `text`, coalescés sur un `requestAnimationFrame`. Quand
  l'`event` final arrive, il **écrase** le texte accumulé.
- Correspondance SDK : nécessite un streaming token-par-token du LLM à travers le
  SDK OpenHands. **À vérifier** : si `openhands.sdk` expose des callbacks de
  streaming LLM (partial `MessageEvent`, `LLMStreamChunk`, …). Si **non** → ne pas
  annoncer `deltas` ; le client affiche les messages complets (déjà le cas, ça
  marche).

> **Effort** : moyen-élevé si le SDK le permet, **infaisable proprement** sinon —
> et c'est OK, la capability est optionnelle.

---

### 4.4 `tool_status` et `progress`  *(gratuits avec `turns`, pas de capability dédiée)*

```jsonc
{ "type": "tool_status", "tool_call_id": "call_abc",
  "state": "running" | "ok" | "error", "label": "npm test", "seq": 16 }
{ "type": "progress", "turn_id": "t-uuid", "label": "Reading black.cpp…", "seq": 17 }
```

- `tool_status` : pilote l'icône ⟳/✓/✗ de la ligne d'outil `tool_call_id`.
  Dérivable des `ActionEvent` / `ObservationEvent` (début → running, observation
  sans erreur → ok, avec erreur → error).
- `progress` : libellé **humain** de progression. **Jamais inventé** — seulement
  si le SDK/agent en fournit un. Sans, ne rien envoyer (le client affiche un
  libellé générique).
- Le client les accepte dès qu'ils arrivent (pas de gate). Optionnels.

> **Effort** : faible. Bonus de confort.

---

### 4.5 `pending_action` — carte d'approbation informative *(remplace `awaiting_confirmation` nu)*

```jsonc
{ "type": "pending_action", "action_id": "pa-1",
  "kind": "command" | "edit" | "network" | "other",
  "summary": "Run tests",
  "command": "pytest -q",          // si kind == command
  "path": "/workspace/project/x.py", // si kind == edit
  "diff": "--- a/x.py\n+++ b/x.py\n@@ …",  // si kind == edit, unifié
  "seq": 20 }
```

- Émis **à la place de** `awaiting_confirmation` quand l'agent se met en pause
  (`execution_status == "waiting_for_confirmation"`).
- La réponse revient en `confirm_action {accept, action_id}` (voir §5.2).
- Correspondance SDK : les actions en attente sont dans l'état de la conversation
  au moment de la pause (`ActionEvent` non encore observés / `pending_actions`).
  Extraire commande / chemin / diff de la première.
- **Compat** : si le bridge annonce `turns` mais ne peut pas construire le détail,
  il peut continuer à envoyer `awaiting_confirmation` — le client synthétise alors
  une carte « best effort » depuis le dernier `ActionEvent` (`blind: true`).
- `confirm_action` peut porter `edited_command` (l'utilisateur a modifié la
  commande avant d'approuver) — best effort : l'appliquer si possible, sinon
  ignorer et exécuter l'originale.

> **Effort** : moyen. Le gros est l'extraction du diff/commande depuis l'état SDK.

---

### 4.6 capability `diffs` — `file_diff` / `request_diff`

Client → bridge : `{ "type": "request_diff", "path": "/workspace/project/x.py" }`

Bridge → client :

```jsonc
{ "type": "file_diff", "path": "/workspace/project/x.py",
  "unified": "--- a/x.py\n+++ b/x.py\n@@ …", "truncated": false, "seq": 30 }
```

- Diff **checkpoint (début du tour) → maintenant** d'un fichier, calculé côté
  sandbox (`workspace.git_diff(path)` ou équivalent SDK — WP08c cite déjà
  `RemoteWorkspace.git_diff()`).
- `truncated: true` si > 256 Kio.
- **Contexte** : le client fait déjà des checkpoints git **côté hôte** et calcule
  ses propres diffs pour la plupart des cas. `file_diff` sert quand l'hôte n'a pas
  le fichier (chemin sandbox-only). **Priorité basse.**

Voir aussi `checkpoint` (§4.9) et `restore_checkpoint` (§5.4).

> **Effort** : moyen. Priorité basse (l'hôte se débrouille).

---

### 4.7 capability `models` — `models` / `list_models` / `set_model`

Client → bridge : `{ "type": "list_models" }`  puis  `{ "type": "set_model", "model_id": "…" }`

Bridge → client :

```jsonc
{ "type": "models", "seq": 40, "models": [
  { "id": "qwen3-coder-30b", "label": "Qwen3-Coder-30B-A3B",
    "context_window": 32768, "current": true },
  { "id": "qwen2.5-coder-7b", "label": "Qwen2.5-Coder-7B",
    "context_window": 32768, "current": false,
    "state": "loading" }  // "ready" | "loading" | "error"; error?: "<message llama-server brut>"
] }
```

- `list_models` → lit `configs/models.yaml` (le catalogue existe déjà).
- `set_model` → recharge `llama-server` sur le modèle demandé. C'est
  **potentiellement long (minutes) et peut échouer en VRAM** (2×V100). Émettre
  `models` avec `state: "loading"` sur le nouveau, puis `state: "ready"` quand
  `/v1/models` répond, ou `state: "error"` + `error` = message brut de
  `llama-server`.
- Correspondance SDK : le chemin `switch_llm` existe déjà dans `openhands_adapter`
  (`_ensure_llm`). Le **rechargement `llama-server`** lui-même est de l'infra
  (systemd / l'API d'admin de `llama-bridge` ?), à câbler.
- Le `context_window` du modèle courant alimente la jauge C13 **avant** le
  premier `usage` — le client le consomme dans `models`.
- Client : refuse de changer de modèle pendant `running`, inscrit le changement
  dans le fil. Rien à faire côté bridge.

> **Effort** : moyen. `list_models` est trivial ; `set_model` + rechargement
> llama-server est le vrai travail.

---

### 4.8 capability `todo` — plan produit par l'agent

```jsonc
{ "type": "todo", "seq": 22, "items": [
  { "id": "s1", "text": "Read the failing test", "state": "done" },
  { "id": "s2", "text": "Fix the day-count convention", "state": "active" },
  { "id": "s3", "text": "Rebuild and run ctest", "state": "pending" }
] }
```

- **État complet à chaque fois**, jamais un patch. `state` ∈
  `{pending, active, done, skipped}`.
- Le client n'infère **aucune** étape : sans message `todo`, aucun panneau.
- Correspondance SDK : **l'agent doit produire un todo** — via un outil
  (`task_tracker` existe dans le venv OpenHands) ou un microagent. Le bridge
  traduit l'état de cet outil en message `todo`. **C'est du travail
  comportement-agent**, pas juste du plumbing.

> **Effort** : élevé (dépend de faire produire un todo à l'agent).

---

### 4.9 capability `checkpoints` — `checkpoint` / `restore_checkpoint`

```jsonc
{ "type": "checkpoint", "seq": 9, "checkpoint_id": "cp-1", "turn_id": "t-uuid",
  "created_at": "2026-09-06T12:00:00Z", "files": ["x.py", "y.cpp"] }
```

- Émis **avant** un tour (snapshot de l'état des fichiers dans le sandbox).
- `restore_checkpoint {checkpoint_id}` (client → bridge) restaure tout le tour.
- **Contexte** : le client fait déjà des checkpoints git **côté hôte** (refs
  dangling invisibles) et gère `Undo turn` sans le bridge. Cette capability sert
  au cas hors-git ou sandbox-only. **Priorité basse.**

> **Effort** : moyen. Priorité basse.

---

### 4.10 capability `compact` — `history_compacted` / `compact`

Client → bridge : `{ "type": "compact" }` (l'utilisateur a tapé `/compact`)

Bridge → client :

```jsonc
{ "type": "history_compacted", "seq": 50, "turns_summarized": 7,
  "summary": "L'utilisateur a demandé … ; l'agent a corrigé …" }
{ "type": "context_stats", "seq": 51, "prompt_tokens": 8000,
  "context_window": 32768, "compacted": true }
```

- `compact` : demande explicite. Le **client ne résume jamais lui-même**.
- `history_compacted` : émis quand le bridge compacte (sur demande **ou**
  automatiquement quand le contexte se remplit). `summary` est **consultable** par
  l'utilisateur — le mettre lisible.
- Correspondance SDK : OpenHands a un mécanisme de condensation de contexte
  (`Condenser` / `condensation`). Le brancher et remonter le résumé.

> **Effort** : moyen.

---

### 4.11 capability `interrupt` — consigne en cours de tour

Client → bridge : `{ "type": "interrupt", "turn_id": "t-uuid", "text": "concentre-toi sur les tests" }`

- Injecte la consigne dans le tour en cours **sans l'arrêter**.
- Apparaît dans le fil comme « note added mid-turn ».
- Si le bridge **n'annonce pas** `interrupt`, le client met la consigne en file et
  l'envoie comme `user_message` normal au `turn_finished` — **rien à faire côté
  bridge dans ce cas.**
- Correspondance SDK : dépend de la capacité du SDK à accepter un message pendant
  un run. À investiguer ; sinon ne pas annoncer la capability.

> **Effort** : moyen-élevé, optionnel.

---

### 4.12 `context_stats` — usage **pendant** le tour  *(gate : `turns`)*

```jsonc
{ "type": "context_stats", "seq": 18, "prompt_tokens": 12000,
  "context_window": 32768, "compacted": false }
```

- Comme `usage` mais **poussé pendant le tour** (après chaque appel LLM), pas
  seulement à la fin. Alimente la jauge de contexte en continu (C13).
- `conversation.conversation_stats.get_combined_metrics()` est déjà interrogé —
  l'appeler aussi en cours de tour (sur `MessageEvent`/`ActionEvent` de l'agent).
- `compacted` : `true` si l'historique a été condensé.

> **Effort** : faible. C'est `usage` émis plus souvent, avec un champ en plus.

---

### 4.13 `usage` — champ `seq` uniquement

Le v1 `usage` reste tel quel, juste ajouter `seq`. Idem `files_changed`,
`session_started`, `event`, `awaiting_confirmation`, `mcp_servers`, `error` :
**ajouter `seq` partout** dès que la numérotation est en place.

---

## 5. Messages client → bridge — récap des ajouts

| Message | Charge | Capability | Effet attendu |
|---|---|---|---|
| `hello` | `{protocol, client}` | — | répondre `welcome` |
| `user_message` | `{text, context?: ResolvedContext[]}` | — | **v2** : `context` remplace la concaténation — préfixer/injecter les blocs dans le prompt (voir §5.1) |
| `confirm_action` | `{accept, action_id?, remember?, edited_command?}` | `turns` | `action_id` cible l'action ; `remember` best-effort ; `edited_command` best-effort |
| `cancel_turn` | `{turn_id}` | `cancel` | interrompre le run → `turn_finished{cancelled}` |
| `resume` | `{conversation_id, last_seq}` | `resume` | rejouer `seq > last_seq` → `resumed` (sinon : client efface la conversation, retour au picker) |
| `interrupt` | `{turn_id, text}` | `interrupt` | injecter sans arrêter |
| `request_diff` | `{path}` | `diffs` | → `file_diff` |
| `restore_checkpoint` | `{checkpoint_id}` | `checkpoints` | restaure le tour |
| `compact` | `{}` | `compact` | → `history_compacted` |
| `list_models` | `{}` | `models` | → `models` |
| `set_model` | `{model_id}` | `models` | recharger llama-server, → `models` |

### 5.1 `user_message.context` (C04)

```jsonc
{ "type": "user_message", "text": "corrige ce bug",
  "context": [
    { "kind": "file", "label": "src/black.cpp", "body": "<contenu>", "truncated": false },
    { "kind": "instructions", "label": "instructions (AGENTS.md)", "body": "…", "truncated": false }
  ] }
```

L'hôte résout les `#`-références **à l'envoi** et les passe ici plutôt que de les
coller dans `text`. Le bridge doit les **présenter au modèle** — typiquement en
préambule balisé (`<context source="src/black.cpp">…</context>`) ou via le
mécanisme de contexte du SDK. `kind: "instructions"` arrive en premier et ne doit
pas être tronqué avant le reste.

> **Effort** : faible. Important — sans ça, le `#`-contexte v2 est inerte.

---

## 6. Erreurs (`blueprint/03-PROTOCOL.md §5`)

Codes que le client traite spécifiquement (tout autre code → notice générique
avec bouton « Retry ») :

| Code | Quand l'émettre | Client |
|---|---|---|
| `SESSION_BUSY` | 2ᵉ `start_session` concurrent | notice + « Force new session » |
| `PROJECT_READONLY` | sandbox uid ne peut pas écrire le bind-mount | notice persistante + commande `setfacl` copiable/exécutable — **déjà émis par la v1**, garder le format |
| `MODEL_UNAVAILABLE` | `set_model` échoue / llama-server KO | notice + « Open Components » ; `message` = texte brut llama-server |
| `UNKNOWN_CONVERSATION` | `resume` sur un id inconnu | le client efface la session, retourne au picker |
| `VALIDATION_ERROR` | message client non parsable | **le client l'avale** (décalage de protocole) — ne pas s'en inquiéter |
| `DOCKER_DOWN` / `IMAGE_MISSING` / `GPU_CONTENTION` | démarrage sandbox impossible | notice + « Open Components » ; `details` peut porter `image` / `processes` |

Règle : **aucune erreur ne vide le fil, aucune n'est avalée silencieusement**
(côté bridge : logguer). Une `error` fatale est suivie de
`turn_finished {reason: "error"}`.

---

## 7. Plan de livraison incrémental

Chaque phase est **indépendante et livrable seule**. Après chacune : commit
croisé qui retire les discriminants de `CLIENT_AHEAD_OF_BRIDGE` dans
`agenticenv-chat/src/protocol.ts` + met à jour `blueprint/03-PROTOCOL.md`.

| Phase | Contenu | Capabilities | Effort | Déblocage utilisateur |
|---|---|---|---|---|
| **P0** | accepter `hello`, répondre `welcome {capabilities: []}` | — | **XS** | sort du mode « rejet », plus d'erreurs de négociation |
| **P1** | `seq` partout + `turn_started`/`turn_finished` + `tool_status`/`progress` | `turns` | **S** | bouton **Stop** visible, frontières de tour nettes, UI optimiste correcte |
| **P2** | `cancel_turn` → interruption réelle | `+cancel` | **S-M** | Stop **fonctionnel** |
| **P3** | `context_stats` en cours de tour + `user_message.context` | — | **S** | jauge de contexte vivante, `#`-références v2 actives |
| **P4** | `pending_action` avec commande/diff | — (gate `turns`) | **M** | cartes d'approbation informatives (commande exacte + diff) |
| **P5** | `resume` / `resumed` + buffer d'outbound | — (dès `seq`) | **M** | reprise après reload/coupure sans perdre le fil |
| **P6** | `list_models` / `set_model` / `models` | `+models` | **M** | sélecteur de modèle |
| **P7** | `compact` / `history_compacted` | `+compact` | **M** | `/compact`, compaction annoncée |
| **P8** | `event_delta` (si le SDK stream) | `+deltas` | **M-L** | streaming token-par-token (sinon on saute) |
| **P9** | `todo` (agent produit un plan) | `+todo` | **L** | panneau todo live |
| **P10** | `file_diff`/`request_diff`, `checkpoint`/`restore_checkpoint` | `+diffs +checkpoints` | **M** | diffs sandbox-only, restore par le bridge (l'hôte s'en passe aujourd'hui) |
| **P11** | `interrupt` (si le SDK l'accepte) | `+interrupt` | **M-L** | consigne mid-turn (sinon : file côté client, déjà OK) |

**P0→P3 est le minimum qui rend l'expérience « v2 »** (Stop, tours, jauge live,
contexte). Le reste est du raffinement.

---

## 8. Vérification

### Contre le client réel (le plus important)

1. `cd ~/AgenticEnv && just run-bridge`
2. Dans VS Code, l'extension `agenticenv-chat` installée (`.vsix`), recharger.
3. La bannière doit passer de « protocol v1 (degraded) » à normale dès P0.
4. Le panneau **Output → "AgenticEnv Chat"** (régler `agenticenvChat.logLevel` à
   `trace`) montre chaque frame — vérifier l'ordre et les `seq`.

### Test de dérive (côté `agenticenv-chat`)

`test/discipline/protocol-drift.test.ts` compare `src/protocol.ts` à
`protocol.py`. Il **doit rester vert** : à chaque message ajouté au bridge,
retirer son discriminant de `CLIENT_AHEAD_OF_BRIDGE`. S'il devient rouge, les deux
fichiers ont divergé sur autre chose qu'un « client en avance ».

### Faux bridge (côté `agenticenv-chat`)

`test/fake-bridge/server.ts` + `test/integration/bridgeClient.test.ts` — utile
pour valider un scénario (séquence de frames) sans stack complète. Ajouter des cas
au fur et à mesure (P1 : « turn_started sans turn_finished », P5 : « resume rejoue
seq > last_seq », etc.).

### Tests bridge (côté `AgenticEnv`)

`packages/openhands-bridge/tests/test_protocol.py` (round-trip pydantic) et
`test_bridge_e2e.py` (`@pytest.mark.e2e`, conteneur réel). Étendre les deux.
`just lint` (ruff + mypy + import-linter) doit passer.

---

## 9. Coordination inter-dépôts

- **Source de vérité du fil** : `agenticenv-chat/src/protocol.ts`. Toute
  divergence se règle là, puis se propage à `protocol.py`.
- **Un message n'est « livré »** que quand : (a) `protocol.py` + `server.py`
  l'implémentent, (b) `protocol-drift.test.ts` est vert avec le discriminant
  retiré de `CLIENT_AHEAD_OF_BRIDGE`, (c) `blueprint/03-PROTOCOL.md` reflète
  l'état. Les trois dans le même lot de commits croisés.
- **Ne jamais** ajouter un champ **requis** à un message existant sans incrémenter
  `protocol` — le client v2 actuel casserait. Un champ **optionnel** est libre.
- Le `CHANGELOG.md` de `agenticenv-chat` a une section par phase livrée.
- Les items « moitié AgenticEnv » de chaque WP client (`blueprint/wp/C0X-*.md`
  §acceptation, cochés `[~]` ou « Reste ») listent le besoin bridge exact,
  formulé du point de vue client.

---

## 10. Annexe — forme des `SdkEvent` attendus par le client

Le client rend déjà ces événements en v1 (le forwarding `event` marche). Pour
mémoire, il lit (`src/protocol.ts` `SdkEvent`, `src/webview/store/eventItems.ts`) :

| `kind` | Champs lus |
|---|---|
| `MessageEvent` | `llm_message.role`, `llm_message.content[].text`, `activated_skills` |
| `ActionEvent` | `thought` (string ou `[{text}]`), `tool_name`, `tool_call_id`, `action` (objet) |
| `ObservationEvent` | `tool_call_id`, `observation` (objet ; `exit_code`/`error` détectés) |
| `AgentErrorEvent` | `error` (string), `tool_call_id` si apparié |

`id` sur `MessageEvent` sert de cible aux `event_delta`. Garder `id` stable entre
un delta et l'`event` final du même message.
