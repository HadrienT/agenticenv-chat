# C01 — Protocole v2 : cycle de tour, deltas, annulation

> **Contexte** : le client devine aujourd'hui la fin d'un tour en remettant
> `running = false` sur `files_changed` **ou** `usage`. C'est faux dans les deux
> sens : un tour qui ne modifie aucun fichier laisse le spinner à vie, et un
> `usage` poussé en milieu de tour le fait disparaître trop tôt. Il n'y a donc ni
> bouton Stop fiable, ni rendu incrémental, ni progression.
>
> C'est le WP qui fait respecter **P3 du primer** (« l'état affiché est l'état
> rapporté »). Tout ce qui suit en dépend.

**Fichiers à lire** : ce fichier · [00-PRIMER.md](../00-PRIMER.md) §2 ·
[03-PROTOCOL.md](../03-PROTOCOL.md) · [01-ARCHITECTURE.md](../01-ARCHITECTURE.md) §3–4 ·
[05-TESTING.md](../05-TESTING.md) §3, §6

**Dépend de** : C00. **Bloque** : C05, C06, C07, C08, C09, C12, C13.
**Parallélisable avec** : C02, C04.

**Items du catalogue** : 19 (bouton Stop), 20 (streaming incrémental),
38 (libellés de progression), 39 (état par étape), 110 (reprise après coupure),
112 (UI optimiste).

> ⚠️ **Ce WP a une moitié côté AgenticEnv.** Les messages de 03-PROTOCOL §2 doivent
> exister dans `packages/openhands-bridge`. Le client se code contre le faux bridge
> et se branche ensuite. **Ne pas simuler ces messages côté client** (P1).

---

## 1. Livrables

| # | Livrable | Côté |
|---|---|---|
| L1 | `hello`/`welcome` + négociation de capabilities, avec repli v1 annoncé | les deux |
| L2 | `turn_started` / `turn_finished` / `progress` | les deux |
| L3 | `event_delta` et rendu incrémental coalescé | les deux |
| L4 | `cancel_turn` + bouton Stop | les deux |
| L5 | `tool_status` (running / ok / error) | les deux |
| L6 | `seq` sur tout message + `resume {conversation_id, last_seq}` | les deux |
| L7 | Suppression de `legacyInferTurnEnd` et des états `running`/`starting` séparés | client |
| L8 | File d'envoi : un message émis socket fermé est mis en attente, pas perdu | client |

## 2. Machine à états définitive

Voir 01-ARCHITECTURE §3. Transitions autorisées, **et aucune autre** :

```
disconnected → picking            (connection open)
picking      → starting           (startSession)
starting     → idle               (session_started)
starting     → picking            (error fatale)
idle         → running            (turn_started)
running      → awaiting           (pending_action)
awaiting     → running            (confirm)
running      → cancelling         (cancelTurn)
cancelling   → idle               (turn_finished{cancelled})
running      → idle               (turn_finished{*})
*            → disconnected       (connection closed)   — items conservés
disconnected → <phase précédente> (connection open + resume réussi)
```

`usage`, `files_changed`, `event`, `event_delta`, `context_stats` ne figurent dans
**aucune** transition. C'est l'invariant I1.

## 3. Bouton Stop (item 19)

| Règle |
|---|
| Le bouton Send devient Stop dès `running`, pas avant. |
| Un clic passe en `cancelling` et envoie `cancel_turn {turn_id}`. L'UI affiche « stopping… », le bouton reste cliquable. |
| Un **second** clic en `cancelling` propose « Force new session » (relance la sandbox) — filet quand le bridge ne rend pas la main. |
| Si `turn_finished` n'arrive jamais, l'utilisateur n'est **jamais** piégé : le bouton reste actif indéfiniment. Aucun timeout automatique (primer §5 : un tour peut durer 20 min). |
| Un tour annulé reste dans le fil, marqué « cancelled », avec ce qui avait déjà été produit. |

## 4. Rendu incrémental (item 20)

```ts
// store : un item assistant en cours porte une révision
interface AssistantItem { kind: "assistant"; id: string; text: string; streaming: boolean; revision: number; }
```

| Règle | Raison |
|---|---|
| `event_delta` concatène et incrémente `revision`. | permet de mémoriser le rendu markdown par `(id, revision)` |
| Les deltas sont coalescés sur un `requestAnimationFrame`, pas appliqués un par un. | 04-CONVENTIONS §6 |
| L'`event` final **écrase** le texte accumulé et met `streaming: false`. | un delta perdu ne corrompt pas le résultat |
| Le rendu markdown pendant le streaming doit tolérer un document **incomplet** (bloc de code non fermé, tableau à moitié écrit). | sinon la réponse clignote ; voir C02 §5 |
| L'auto-scroll suit le bas **sauf** si l'utilisateur a scrollé vers le haut ; un bouton « ↓ nouveau contenu » apparaît alors. | le code actuel scrolle toujours, ce qui empêche de lire pendant que l'agent écrit |

## 5. Progression et état par étape (items 38, 39)

- `progress {turn_id, label}` alimente une ligne discrète sous le dernier item :
  « Reading black.cpp… », « Running ctest… ». Elle **remplace** le
  « agent is working… » générique.
- `tool_status` pilote l'icône d'un `ToolItem` : ⟳ en cours, ✓ ok, ✗ erreur.
  Un outil sans `tool_status` reste sur ⟳ jusqu'à son `ObservationEvent`.
- Le libellé de progression n'est **jamais** inventé côté client à partir du nom
  d'outil : s'il n'y a pas de `progress`, on affiche « working… ». (P3.)

## 6. Reprise après coupure (item 110)

L'hôte d'extension VS Code coupe et rouvre le socket à chaque reload. Aujourd'hui
le fil survit dans la webview mais le client ne sait pas ce qu'il a raté.

```
connexion ouverte → hello → welcome
  si une conversation était en cours (workspaceState) :
      resume {conversation_id, last_seq}
      ← le bridge rejoue les messages de seq > last_seq, puis "resumed {seq}"
  sinon : list_mcp_servers, list_models
```

| Règle |
|---|
| `resume` qui échoue (`UNKNOWN_CONVERSATION`) ⇒ notice « la session précédente n'est plus disponible », fil conservé en lecture seule, bouton « New session ». |
| Le rejeu passe par le **même** réducteur que le direct. Aucun chemin de code parallèle. |
| Le debounce de 2,5 s sur `closed` (introduit pour le flapping) est conservé. |
| Pendant `disconnected`, le composer est désactivé mais **le brouillon est conservé**. |

## 7. File d'envoi (L8)

`BridgeClient.send()` retourne `false` aujourd'hui si le socket est fermé, et
l'appelant affiche une erreur. Pour `list_mcp_servers`/`list_models`, mettre en
file et vider à l'ouverture est meilleur. Pour `user_message`, non : l'utilisateur
doit savoir que son message n'est pas parti.

| Message | Comportement socket fermé |
|---|---|
| `list_mcp_servers`, `list_models`, `hello`, `resume` | mis en file, rejoués à l'ouverture |
| `user_message`, `start_session`, `confirm_action`, `cancel_turn` | refusés + notice actionnable (« Retry ») |

## 8. Tests

| Test | Attendu |
|---|---|
| `reducer.test.ts` | I1–I8 tous actifs (plus de `todo`) |
| Faux bridge : tour nominal | `idle → running → idle`, un seul item assistant, `revision` croissante |
| Faux bridge : `usage` en milieu de tour | phase inchangée (**c'est le bug corrigé**) |
| Faux bridge : tour sans `files_changed` ni `usage` | se termine correctement sur `turn_finished` |
| Faux bridge : tour de 20 min | aucun timeout, Stop réactif du début à la fin |
| Faux bridge : `turn_finished` jamais envoyé | Stop reste actif, « Force new session » proposé |
| Faux bridge : coupure + `resume` | fil identique à un tour non coupé (comparaison d'état) |
| Faux bridge : deltas après l'`event` final | le final gagne |
| Faux bridge : bridge v1 | bannière « protocole v1 — Stop et diffs indisponibles », chat fonctionnel |
| Perf | 2000 deltas en 10 s : ≤ 1 rendu par frame, pas de saccade |

## 9. Critères d'acceptation

- [x] `legacyInferTurnEnd` **renommée** `v1FallbackTurnEnd` et gardée **derrière `state.protocol.degraded`** : sur un bridge v2, la fin de tour vient exclusivement de `turn_finished` (I1). Sur un bridge v1 elle reste le seul signal disponible, d'où la bannière « degraded ». *(Écart assumé vs. « supprimée » : sinon l'extension serait inutilisable contre le bridge v1 actuel — cf. §note ci-dessous.)*
- [x] Aucun passage en `running` ailleurs que sur `turn_started` (I2, testé). L'optimisme se limite à `pendingSend`.
- [x] Un tour sans `files_changed` ni `usage` se termine sur `turn_finished` (testé `reducer.test.ts`).
- [x] Un `usage` reçu en milieu de tour ne change pas la phase (I1, testé unitaire **et** contre le faux bridge).
- [x] Stop : `running → cancelling → idle{cancelled}` ; le tour annulé reste dans le fil ; second clic → « Force new session » ; aucun timeout (testé). **Arrêt réel contre un vrai bridge : à vérifier une fois `cancel_turn` implémenté côté AgenticEnv.**
- [x] Rendu incrémental : `event_delta` concaténés + coalescés sur `requestAnimationFrame` ; l'`event` final écrase ; un delta en retard est ignoré (testé).
- [x] Reprise : `resume {conversation_id, last_seq}` émis à la reconnexion, `seq` persisté en `workspaceState`, rejeu par le **même** réducteur. **Round-trip complet à vérifier contre un bridge qui répond `resumed` + rejoue.**
- [x] Bridge v1 : négociation `hello` sans réponse en 2 s → `protocol {version:1, degraded:true}`, bannière « protocol v1 (degraded) », chat fonctionnel, Stop masqué.
- [ ] **Moitié AgenticEnv non faisable dans cet environnement** : `hello`/`welcome`, `turn_started`/`turn_finished`, `event_delta`, `cancel_turn`, `tool_status`, `progress`, `seq`, `resume` doivent être ajoutés à `packages/openhands-bridge` (le bridge local est encore v1, cf. `test/discipline/protocol-drift.test.ts` + `CLIENT_AHEAD_OF_BRIDGE` dans `src/protocol.ts`). Commits croisés à faire à ce moment-là.
- [ ] **F5** : streaming sans clignotement, reload de fenêtre en plein tour, Stop réactif — à vérifier dans un vrai VS Code + bridge v2.
