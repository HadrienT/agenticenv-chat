# C15 — Copie de travail sandbox (WP08d) + `apply_changes`

> **Handoff.** Le bridge AgenticEnv a livré WP08d + le protocole v2 (P0→P3). Ce
> WP décrit ce qui est **déjà fait côté client** (miroir `protocol.ts`) et ce qui
> **reste à câbler**. Référence AgenticEnv :
> `blueprint/wp/WP08d-sandbox-working-copy.md` dans le dépôt `AgenticEnv`
> (commit `09692e7`).

**Fichiers à lire** : ce fichier · [C06-edits-and-diffs.md](C06-edits-and-diffs.md)
(tout — C15 le remplace en partie) · [03-PROTOCOL.md](../03-PROTOCOL.md) §2 ·
[C01-turn-protocol.md](C01-turn-protocol.md) · [C12-mcp-and-models.md](C12-mcp-and-models.md) §3 (modes)

**Dépend de** : C01, C06, C07. **Bloque** : rien. **Parallélisable avec** : C12.

**Branche de départ** : `feat/protocol-v2-wp08d` (commit `2823d0d`, non mergée).

---

## 1. Ce que WP08d change conceptuellement

Avant : le dossier ouvert était bind-monté **en écriture** dans le sandbox ;
l'agent modifiait les fichiers de l'utilisateur en direct ; le client prenait des
checkpoints git **côté hôte** (`CheckpointStore`) et calculait ses propres diffs.

Après (WP08d) :

| | Avant | Après |
|---|---|---|
| Montage du projet | `rw` sur `/workspace` | **`ro` sur `/workspace/source`** |
| Où l'agent travaille | directement sur les fichiers de l'utilisateur | sur une **copie jetable** `cp -a` dans `/workspace/project` (uid 10001, jetée avec le conteneur) |
| Checkpoints / diffs | côté hôte (`CheckpointStore`, git sur le vrai dépôt) | **côté bridge**, sur la copie, refs techniques `refs/agenticenv/{baseline,checkpoints/*}` |
| Retour vers le vrai dépôt | implicite (déjà écrit) | **explicite** : `apply_changes`, exécuté par le bridge (uid 1000 → bonne propriété des fichiers), avec détection de conflit |

Conséquence directe : **`CheckpointStore` côté hôte ne voit plus rien** — les
éditions de l'agent sont dans la copie sandbox, le vrai dépôt est intact jusqu'à
`apply_changes`. Le client doit basculer sur les diffs/checkpoints **du bridge**.
C'est la stratégie A anticipée dans [C06](C06-edits-and-diffs.md) §1.

Raison technique du modèle « copie » plutôt qu'un montage `rw` : faire tourner le
conteneur avec `--user $(id -u)` (pour que les fichiers écrits appartiennent à
l'utilisateur) **fige le agent-server** (son serveur VSCode embarqué exige
uid 10001). Le bridge, lui, tourne en uid 1000 et fait le `write-back`.

---

## 2. État côté bridge — **livré**

`welcome` annonce : `["turns", "cancel", "diffs", "checkpoints", "apply"]`.
(`deltas`, `todo`, `compact`, `interrupt`, `models`, `resume` : **pas** annoncés,
le client dégrade déjà proprement dessus.)

### client → bridge (nouveaux)

| message | charge utile | capability | réponse |
|---|---|---|---|
| `start_session` | `{mcp_servers, project_path?, mode?}` — `mode: "agent"` (défaut) \| `"read_only"` | — | `session_started` |
| `request_diff` | `{path}` | `diffs` | `file_diff` (baseline session → maintenant, **pas** checkpoint → maintenant) |
| `request_bundle_diff` | `{}` | `apply` | `bundle_diff` — diff unifié de **toute** la copie |
| `restore_checkpoint` | `{checkpoint_id}` | `checkpoints` | `checkpoint_restored` puis `files_changed` |
| `apply_changes` | `{paths?, force?}` — `paths` absent = tout ; `force` outrepasse le conflit | `apply` | `changes_applied` puis `files_changed` |
| `discard_changes` | `{paths?}` | `apply` | `files_changed` |

### bridge → client (nouveaux)

| message | charge utile | quand |
|---|---|---|
| `session_started` | `+ mode: "agent" \| "read_only"` | (champ ajouté) |
| `checkpoint` | `{checkpoint_id, turn_id, created_at, files}` | **avant** chaque `turn_started` si la copie est un dépôt git |
| `file_diff` | `{path, unified, truncated}` | réponse à `request_diff` |
| `bundle_diff` | `{unified, truncated}` | réponse à `request_bundle_diff` |
| `checkpoint_restored` | `{checkpoint_id}` | réponse à `restore_checkpoint` |
| `changes_applied` | `{applied:[{path,status}], skipped:[{path,reason}]}` | réponse à `apply_changes` |

`reason` dans `skipped` (texte à afficher tel quel) : `"host file changed since
session start"`, `"no longer present in the sandbox"`, `"path escapes the
workspace"`.

Détails à connaître :

- **`files_changed` est cumulatif de session**, pas par tour (c'est
  `git status` de la copie vs son HEAD). Le libellé actuel « changed by this
  turn » dans `WorkingSet.tsx` devient faux — soit le corriger, soit filtrer par
  `checkpoint.files` du dernier tour.
- `checkpoint`/`file_diff`/`bundle_diff` exigent que la copie soit un **dépôt
  git** (le cas normal : le vrai dépôt est copié avec son `.git`). Sinon
  `checkpoint` n'est jamais émis et `request_diff` renvoie une `error`
  `NO_WORKING_COPY` — dégrader sans planter.
- `apply_changes` en `mode: "read_only"` → `error` `READ_ONLY_SESSION`.
- `cancel_turn` passe par `conversation.pause()` → `turn_finished{reason:"cancelled"}`.
- Pas de `project_path` → pas de copie, pas de `apply`/`diffs`/`checkpoints`
  utiles (chat pur).

---

## 3. État côté client — **déjà fait** (commit `2823d0d`)

- `src/protocol.ts` : miroir exact du nouveau `protocol.py`.
  - inbound : `RequestBundleDiff`, `ApplyChanges`, `DiscardChanges`
  - outbound : `BundleDiffMessage`, `ChangesApplied`, `CheckpointRestored`,
    `AppliedEntry`, `SkippedEntry`
  - `StartSession.mode`, `SessionStarted.mode`
  - `Capability` gagne `"apply"`
  - `CLIENT_AHEAD_OF_BRIDGE` réduit à ce que le bridge n'annonce **toujours** pas
- `src/webview/store/reduceBridge.ts` : `bundle_diff` / `checkpoint_restored` /
  `changes_applied` routés en **no-op** (interceptés par l'hôte) — juste de quoi
  garder `assertNever` et le test `routers.test.ts` verts.
- `docs/bridge-v2-spec.md` : note sur la capability `apply` + requalification
  diffs/checkpoints.
- `test/discipline/protocol-drift.test.ts` : **vert** contre le `protocol.py`
  d'AgenticEnv (le miroir est exact).
- `npm run typecheck` / `lint` / `test` (275) : verts.

**Rien de comportemental n'a été branché.** Les nouveaux messages arrivent
jusqu'au réducteur webview et n'y font rien.

---

## 4. Reste à faire — côté client — **fait** (commit sur `feat/protocol-v2-wp08d`)

> Câblé le 2026-09-06 : `mode`, diffs/checkpoints via bridge, `apply`/`discard`/
> `bundle_diff`, gating `resume`. 280 tests, `tsc`/`lint`/`build` verts.
> Reste F5 (pas de GUI) et l'intégration faux-bridge de bout en bout.

### 4.1 `mode` (petit, faire en premier) — ✅

- `chatViewProvider.ts` ~ligne 977 (`case "startSession"`) : ajouter
  `mode: this.sessionMode === "ask" || this.sessionMode === "plan" ? "read_only" : "agent"`
  au message `start_session`.
- `onBridgeMessage` `case "session_started"` : lire `message.mode`, le refléter
  dans le statut / `pushStatus`. Si `mode === "read_only"`, griser les actions
  d'`apply` (§4.3) et le dire dans l'UI.
- `applyPermissionOverride()` (~ligne 591) : le commentaire « en attendant un
  vrai mode sandbox » peut être mis à jour — le mode sandbox existe maintenant,
  mais l'override `readOnly` côté permissions reste utile en défense en
  profondeur.

### 4.2 Diffs & checkpoints : passer du `CheckpointStore` hôte au bridge

C'est le gros morceau. Décision à prendre : **le bridge devient la source de
vérité** pour `checkpoint` / `file_diff` / `restore` quand la capability
`checkpoints`/`diffs` est annoncée ; `CheckpointStore` reste un **repli** quand
elle ne l'est pas (bridge v1, ou pas de `project_path`).

- `chatViewProvider.ts` :
  - `case "turn_started"` : **ne plus** appeler `this.checkpoints.beginTurn(...)`
    si `capabilities.includes("checkpoints")` — le bridge émet déjà un
    `checkpoint` avant. Mémoriser le `checkpoint_id` du dernier tour.
  - `case "checkpoint"` (nouveau) : stocker `{checkpoint_id, turn_id, files}`,
    pousser vers la webview (nouveau message hôte→webview) pour l'ancrage du
    « Undo turn ».
  - `case "checkpoint_restored"` : marquer le fil « restored to checkpoint before
    this turn » (déjà la sémantique C06 §1), rafraîchir le working set.
  - `sendFileDiff(relPath)` (~1533) : si `diffs` annoncée →
    `this.bridge.enqueue({type:"request_diff", path})` et attendre `file_diff`
    (au lieu de `this.checkpoints.diffFile`).
  - `case "file_diff"` (nouveau, hôte) : traduire vers le message
    `fileDiff` hôte→webview existant.
  - `restoreTurn` / `undoTurn` : `restore_checkpoint {checkpoint_id}` au bridge.
- `src/edits/checkpoints.ts` : garder tel quel comme repli ; ne rien supprimer.
- `WorkingSet.tsx` : le libellé « changed by this turn » — cf. §2, `files_changed`
  est cumulatif. Filtrer via `checkpoint.files` du dernier tour, ou changer le
  libellé.

### 4.3 `apply_changes` / `discard_changes` — UI sur le panneau des fichiers

Nouveau vocabulaire sur `WorkingSet.tsx` (l'écriture a eu lieu **dans la copie**,
pas dans le vrai dépôt — donc ici on a un vrai « accept ») :

- bouton **« Apply to repo »** (tout) + par-fichier ; **« Discard »** (remet à la
  baseline dans la copie).
- `messages.ts` : ajouter `WEBVIEW_TO_HOST_TYPES` `applyChanges`,
  `discardChanges`, `requestBundleDiff` ; `HOST_TO_WEBVIEW_TYPES` `changesApplied`.
  Mettre à jour `routers.test.ts` suit automatiquement (il lit ces constantes).
- `chatViewProvider.ts` `onWebviewMessage` : nouveaux `case` →
  `bridge.enqueue({type:"apply_changes", paths?})` etc. `assertNever` à garder.
- `case "changes_applied"` (hôte) : afficher `applied` (succès) et surtout
  `skipped` avec sa `reason` telle quelle ; pour un conflit, proposer une action
  **« Apply anyway »** → renvoyer `apply_changes {paths:[...], force:true}` après
  confirmation explicite (C07 : action destructive, jamais auto).
- `apply_changes` écrit dans le vrai dépôt de l'utilisateur : **toujours** passer
  par une carte de confirmation si > N fichiers ou si `skipped` non vide.

### 4.4 `bundle_diff`

Bouton « View all changes » sur le panneau → `request_bundle_diff` → afficher le
`unified` dans un onglet diff read-only (réutiliser le `diffProvider` existant).

### 4.5 Tests

- `protocol-drift.test.ts` : déjà vert, le rester.
- `routers.test.ts` : suit `messages.ts` / `protocol.ts`.
- Ajouter : un test de réducteur pour `changes_applied` (rendu `applied`/`skipped`),
  un test que `start_session.mode` part bien en `read_only` sous Ask/Plan,
  un test que `turn_started` ne double plus le checkpoint quand `checkpoints`
  est annoncée.
- `test/fake-bridge/server.ts` : ajouter les réponses `file_diff` / `bundle_diff`
  / `changes_applied` / `checkpoint` pour l'intégration.

---

### 4.6 Ce qui a été fait (récap)

| Zone | Fichier | Fait |
|---|---|---|
| `start_session.mode` | `chatViewProvider.ts` `case "startSession"` | `mode: this.sessionMode === "agent" ? "agent" : "read_only"` |
| `session_started.mode` | `case "session_started"` | stocké dans `this.sandboxMode` ; pilote `canApply` / le libellé du panneau |
| double checkpoint | `case "turn_started"` / `"turn_finished"` | `beginTurn`/`finishTurn` **seulement si** `!bridgeOwnsEdits()` |
| `checkpoint` (in) | `case "checkpoint"` | stocke `lastCheckpoint {checkpointId, turnId, files}` |
| working set | `sendWorkingSet(bridgeChanges?)` | quand `bridgeOwnsEdits()` : `files_changed` du bridge → `workingSet {viaBridge, canApply, strategy}` |
| `file_diff` (in) | `case "file_diff"` | → message hôte `fileDiff` ; décorations gouttière |
| `sendFileDiff` / `openTurnFileDiff` | idem | `request_diff` au lieu du `CheckpointStore` |
| `bundle_diff` (in) | `case "bundle_diff"` → `showBundleDiff` | doc `diff` read-only |
| `restore_checkpoint` | `undoTurn()` | modale + `restore_checkpoint {checkpoint_id}` |
| `checkpoint_restored` (in) | `case "checkpoint_restored"` | message info ; `files_changed` rafraîchit ensuite |
| `apply_changes` | `onWebviewMessage` `applyChanges` → `applyChanges()` | **modale** avant d'écrire dans le vrai dépôt |
| `discard_changes` | `case "discardChanges"` + `revertFile` (bridge) | `discard_changes {paths}` |
| `changes_applied` (in) | `onChangesApplied` → message `changesApplied` | notice `applied`/`skipped` ; conflit → modale « Apply anyway (overwrite) » `force:true` |
| `request_bundle_diff` | `case "requestBundleDiff"` | bouton « View all changes » |
| `revertHunk` (bridge) | — | refusé avec message (« use Discard on the whole file ») |
| `resume` gating | `beginNegotiation` / `case "welcome"` | `resume` **uniquement** si capability `resume` ; sinon conversation périmée effacée + retour au picker |
| `WorkingSet.tsx` | libellé + boutons | « N files in the sandbox working copy » ; `Apply`/`discard`/`View all changes` en mode bridge, `revert` sinon |

Tests : `test/unit/wp08d.test.ts` (5), `editsState.test.ts` mis à jour.

## 5. Points de vigilance

| Piège | Détail |
|---|---|
| Double checkpoint | Si on garde `CheckpointStore.beginTurn` **et** qu'on consomme `checkpoint` du bridge, on prend deux baselines. Gater sur la capability. |
| `files_changed` cumulatif | ≠ « ce tour ». Cf. §2 / §4.2. |
| Conflit à l'`apply` | Le fichier hôte a bougé depuis le début de session → `skipped` avec `"host file changed since session start"`. Ne jamais `force` sans confirmation. |
| Copie non-git | `checkpoint` jamais émis, `request_diff` → `error NO_WORKING_COPY`. Le panneau doit juste montrer `files_changed` sans diff, sans planter. |
| `read_only` | `apply_changes` refusé par le bridge (`READ_ONLY_SESSION`). Griser l'UI en amont. |
| Irréversibilité relative | `apply_changes` puis conteneur jeté = la copie disparaît. Ce qui n'a pas été `apply` est perdu à la fin de session. À dire clairement dans l'UI. |

---

## 6. Fichiers clés (dépôt chat)

- `src/protocol.ts` — miroir (fait)
- `src/messages.ts` — contrat hôte↔webview (à étendre : §4.3)
- `src/chatViewProvider.ts` — `onBridgeMessage` (~345), `onWebviewMessage`,
  `sendFileDiff` (~1533), `restoreTurn` (~1615), `case "startSession"` (~960)
- `src/edits/checkpoints.ts` — `CheckpointStore` (repli, ne pas supprimer)
- `src/webview/store/reduceBridge.ts` — no-ops en place (fait)
- `src/webview/views/panels/WorkingSet.tsx` — UI apply/discard/bundle
- `test/discipline/{protocol-drift,routers}.test.ts` — garde-fous
- `test/fake-bridge/server.ts` — faux bridge pour l'intégration
