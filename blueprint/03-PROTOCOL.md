# 03 — Protocole

Deux contrats distincts, à ne pas confondre :

1. **Fil bridge** (`snake_case`, JSON sur WebSocket) — partagé avec AgenticEnv.
   Toute évolution demande un changement dans `packages/openhands-bridge`.
2. **Contrat hôte↔webview** (`camelCase`, `postMessage`) — interne à ce repo,
   libre d'évoluer.

---

## 1. Fil bridge — v1 (existant, en production)

Source de vérité : `openhands_bridge/protocol.py`. Miroir : `src/protocol.ts`.

**client → bridge** : `start_session {mcp_servers, project_path?}` ·
`user_message {text}` · `confirm_action {accept}` · `list_mcp_servers {}`

**bridge → client** : `session_started {conversation_id, llm_source}` ·
`event {event}` (un `Event.model_dump(mode="json")` du SDK) ·
`files_changed {changes:[{status, path}]}` ·
`usage {accumulated_cost, prompt_tokens, completion_tokens, context_window}` ·
`awaiting_confirmation {conversation_id}` ·
`mcp_servers {servers:[{name, transport, tools_allowlist}]}` ·
`error {code, message, details}`

### Ce que v1 ne permet pas

| Manque | Symptôme actuel |
|---|---|
| Pas de frontière de tour | le client devine la fin d'un tour sur `files_changed` **ou** `usage` — faux dans les deux sens (viole P3) |
| Pas de deltas | la réponse apparaît d'un bloc, pas de rendu incrémental |
| Pas d'annulation | aucun bouton Stop possible |
| `awaiting_confirmation` sans charge utile | on demande d'autoriser une action **sans dire laquelle** |
| Pas de diff | `openDiff` compare à HEAD git, pas à l'état d'avant le tour |
| Pas de resynchronisation | après une reconnexion, le client ne sait pas ce qu'il a raté |

---

## 2. Fil bridge — v2 (cible)

### 2.1 Négociation de version

Premier message du client à l'ouverture :

```jsonc
{ "type": "hello", "protocol": 2, "client": "agenticenv-chat/0.4.0" }
```

Réponse : `{ "type": "welcome", "protocol": 2, "capabilities": ["turns", "deltas", "cancel", "diffs", "todo", "checkpoints", "compact", "interrupt", "models"] }`

| Règle |
|---|
| Un bridge v1 ne répond pas à `hello` : le client **retombe en mode v1 dégradé** après 2 s, et l'affiche dans la bannière (« bridge v1 — Stop et diffs indisponibles »). |
| Le client n'utilise une fonctionnalité que si sa capability est annoncée. Pas de reniflage de version par essai/erreur. |
| Ajouter un champ optionnel n'incrémente pas `protocol`. En retirer un, ou changer une sémantique, oui. |

### 2.2 client → bridge (ajouts)

| Message | Charge | WP |
|---|---|---|
| `hello` | `{protocol, client}` | C01 |
| `user_message` | `{text, context: ResolvedContext[], attachments: []}` — `context` **remplace** la concaténation dans `text` | C01, C04 |
| `cancel_turn` | `{turn_id}` | C01 |
| `interrupt` | `{turn_id, text}` — consigne injectée sans arrêter le tour | C09 |
| `confirm_action` | `{accept, action_id, remember?: "session" \| "workspace"}` | C07 |
| `request_diff` | `{path}` → réponse `file_diff` | C06 |
| `restore_checkpoint` | `{checkpoint_id}` | C06 |
| `set_model` | `{model_id}` | C12 |
| `list_models` | `{}` → `models` | C12 |
| `resume` | `{conversation_id, last_seq}` — resynchronisation après coupure | C01, C08 |

### 2.3 bridge → client (ajouts)

Tout message porte désormais un `seq` monotone (entier, croissant sur la
connexion **et** sur la conversation) pour permettre `resume`.

| Message | Charge | WP |
|---|---|---|
| `turn_started` | `{turn_id, seq}` | C01 |
| `turn_finished` | `{turn_id, reason: "completed" \| "cancelled" \| "error" \| "max_iterations", seq}` | C01 |
| `event_delta` | `{turn_id, event_id, text}` — fragment à concaténer | C01 |
| `tool_status` | `{tool_call_id, state: "running" \| "ok" \| "error", label?}` | C01, C05 |
| `pending_action` | `{action_id, kind: "command" \| "edit" \| "network" \| "other", summary, command?, path?, diff?}` | C07 |
| `file_diff` | `{path, unified, truncated}` | C06 |
| `checkpoint` | `{checkpoint_id, turn_id, created_at, files: string[]}` | C06 |
| `todo` | `{items: [{id, text, state: "pending" \| "active" \| "done" \| "skipped"}]}` | C09 |
| `context_stats` | `{prompt_tokens, context_window, compacted: bool}` — poussé **pendant** le tour | C13 |
| `models` | `{models: [{id, label, context_window, current: bool}]}` | C12 |
| `progress` | `{turn_id, label}` — « Reading X… », libellé humain | C01 |

### 2.4 Règles de fil

| Règle | Raison |
|---|---|
| `turn_started` précède **tout** événement du tour. Le bridge tamponne si besoin (il le fait déjà pour `session_started`). | l'UI doit pouvoir attribuer chaque événement à un tour |
| `event_delta` ne remplace pas `event` : le `event` final arrive quand même, et **écrase** le texte accumulé. | robustesse : un delta perdu ne corrompt pas le rendu |
| `files_changed` et `usage` sont **informatifs**, jamais des marqueurs de fin. | c'est le bug de v1 |
| `error` non fatale n'implique pas `turn_finished`. Une `error` fatale est **toujours** suivie de `turn_finished{reason:"error"}`. | évite l'ambiguïté actuelle sur `PROJECT_READONLY` |
| Tout message porteur d'un chemin l'exprime en **chemin conteneur absolu**. | un seul point de traduction côté client (01-ARCHITECTURE §5) |
| Une charge utile > 256 Kio est tronquée par le bridge avec `truncated: true`. | protège la webview |

---

## 3. Contrat hôte ↔ webview

### 3.1 `WebviewToHost`

```ts
type WebviewToHost =
  // cycle de vie
  | { type: "ready"; stateVersion: number }
  | { type: "startSession"; mcpServers: string[]; modelId?: string }
  | { type: "newSession" }
  // conversation
  | { type: "userMessage"; text: string; context: ContextRef[] }
  | { type: "cancelTurn" }
  | { type: "interrupt"; text: string }
  | { type: "editMessage"; itemId: string; text: string }      // C08
  | { type: "regenerate"; itemId: string }                     // C08
  | { type: "truncateFrom"; itemId: string }                   // C08
  // contexte (C03/C04)
  | { type: "pickContext"; kind: ContextRef["kind"] }
  | { type: "resolveCommand"; command: string; args: string }
  | { type: "searchFiles"; query: string; requestId: string }
  // édition (C06)
  | { type: "openFile"; path: string; line?: number }
  | { type: "openDiff"; path: string }
  | { type: "applyHunk"; path: string; hunkId: string; revert: boolean }
  | { type: "restoreCheckpoint"; checkpointId: string }
  // code (C02)
  | { type: "copy"; text: string }
  | { type: "insertAtCursor"; text: string }
  | { type: "runInTerminal"; command: string }
  | { type: "createFile"; suggestedName: string; content: string }
  // permissions (C07)
  | { type: "confirm"; accept: boolean; actionId: string; remember?: "session" | "workspace" }
  // santé (existant)
  | { type: "refreshHealth" }
  | { type: "healthAction"; component: ComponentId; action: HealthActionId };
```

### 3.2 `HostToWebview`

```ts
type HostToWebview =
  | { type: "connection"; state: "connecting" | "open" | "closed"; protocol?: number; detail?: string }
  | { type: "hydrate"; snapshot: PersistedState }             // au (re)chargement
  | { type: "turn"; event: TurnEvent }                        // started/delta/finished/progress
  | { type: "item"; item: ChatItem }                          // append
  | { type: "patchItem"; id: string; patch: Partial<ChatItem> }
  | { type: "workingSet"; files: WorkingSetFile[] }
  | { type: "todo"; items: TodoItem[] }
  | { type: "pendingAction"; action: PendingAction | null }
  | { type: "contextStats"; stats: ContextStats }
  | { type: "mcpServers"; servers: McpServer[] }
  | { type: "models"; models: ModelInfo[] }
  | { type: "commands"; commands: SlashCommand[] }            // C10
  | { type: "fileResults"; requestId: string; results: FileHit[] }
  | { type: "health"; components: ComponentHealth[] }
  | { type: "notice"; level: "info" | "warn" | "error"; text: string; actions?: NoticeAction[] }
  | { type: "workspace"; folder: string | null; path: string | null }
  | { type: "reset" };
```

### 3.3 Règles

| Règle | Raison |
|---|---|
| Exhaustivité vérifiée par `assertNever` dans les deux routeurs. | un `type` ajouté sans être traité ne compile pas |
| Un message pousse un **état complet** de son domaine (`workingSet`, `todo`, `health`) ou un **append/patch explicite** (`item`, `patchItem`). Jamais de patch implicite. | rend l'hydratation et le rejeu triviaux |
| La webview n'envoie **jamais** de chemin hôte absolu ; elle renvoie ce que l'hôte lui a donné. | la traduction reste dans `paths.ts` |
| Les messages sont validés à l'entrée du routeur webview (forme, pas identité). | une webview compromise ne doit pas faire crasher l'hôte |

---

## 4. Persistance

```ts
interface PersistedState {
  version: number;              // incrémenté à chaque changement de forme
  conversationId: string | null;
  items: ChatItem[];            // tronqué aux N derniers (voir C08)
  composerDraft: string;
  attachments: ContextRef[];
  panels: { health: boolean; workingSet: boolean; todo: boolean };
}
```

| Cible | Contenu | Pourquoi |
|---|---|---|
| `webview.setState` | `PersistedState` (léger) | survit au reload de la webview, instantané |
| `workspaceState` | id de session courante, allowlist, réglages par dossier | propre au dossier |
| `storageUri` | historique complet des conversations (JSON par session) | trop gros pour `workspaceState` |

Une `version` inconnue ⇒ l'état est **jeté**, pas migré à la devinette, et un
`notice` d'information est affiché.

---

## 5. Erreurs

| Code | Origine | Traitement client |
|---|---|---|
| `SESSION_BUSY` | bridge | notice + bouton « Forcer une nouvelle session » |
| `PROJECT_READONLY` | bridge | notice persistante avec la commande `setfacl` **copiable** |
| `MODEL_UNAVAILABLE` | bridge | notice + lien vers le panneau Components |
| `TIMEOUT` | bridge | `turn_finished{reason:"error"}` + proposition de relance |
| `PROTOCOL_MISMATCH` | client | bannière dégradée, fonctionnalités v2 désactivées |
| `PATH_OUTSIDE_WORKSPACE` | client | chemin affiché non cliquable, pas d'erreur bloquante |
| `PERMISSION_DENIED` | client | l'action refusée est affichée avec la règle qui l'a bloquée |

Aucune erreur ne vide le fil. Aucune erreur n'est avalée silencieusement : tout
passe par `logging.ts` vers l'`OutputChannel`.
