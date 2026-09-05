# Suivi d'implémentation — branches `wp/C0X`

Journal de bord de l'implémentation autonome du blueprint. Mis à jour au fil de
l'eau. Chaque WP est développé sur sa branche `wp/C0X-slug`, mergée dans `main`
quand ses critères d'acceptation **automatisables** sont verts.

> **Limites de l'environnement d'implémentation** : pas de VS Code GUI (donc pas
> de vérification F5 ni de captures d'écran avant/après), pas d'accès à un bridge
> AgenticEnv réel (donc pas de fixtures capturées ni de commits croisés
> AgenticEnv ; les messages du protocole v2 sont codés côté client et testés
> contre le faux bridge). Ces points sont listés « à finir » par WP.

| WP | Titre | Branche | État | Notes |
|---|---|---|---|---|
| C00 | Fondations | `wp/C00-foundations` | ✅ **fait** (commit `5353b2c`) | F5 + fixtures réelles à finir |
| C01 | Protocole v2 : tours, deltas, annulation | `wp/C01-turn-protocol` | ✅ **client fait** | moitié AgenticEnv (bridge v2) + F5 à finir |
| C02 | Rendu du fil (markdown, code, liens) | `wp/C02-thread-rendering` | 🚧 en cours | |
| C03 | Composer (chips, /-commandes, #-refs) | — | ⏳ à faire | |
| C04 | Fournisseurs de contexte (hôte) | — | ⏳ à faire | |
| C05 | Rendu des appels d'outils | — | ⏳ à faire | |
| C06 | Éditions, diffs, checkpoints | — | ⏳ à faire | |
| C07 | Permissions, approbations | — | ⏳ à faire | |
| C08 | Sessions, historique | — | ⏳ à faire | |
| C09 | Plan, todo, pilotage boucle agent | — | ⏳ à faire | |
| C10 | Instructions, prompts, mémoire | — | ⏳ à faire | |
| C11 | Intégration éditeur & commandes | — | ⏳ à faire | |
| C12 | MCP opérationnel & sélection modèle | — | ⏳ à faire | |
| C13 | Budget de contexte, compaction | — | ⏳ à faire | |
| C14 | Robustesse, a11y, packaging | — | ⏳ à faire | |

Ordre d'exécution suivi : C00 → C01 → C02 → C05 → C04 → C03 → C06 → C07 → C08 →
C10 → C13 → C09 → C12 → C11 → C14 (chemin critique d'abord, cf. `blueprint/README.md`).

---

## C00 — Fondations ✅

Commit `5353b2c` sur `wp/C00-foundations`. Voir le détail dans le message de
commit et `blueprint/wp/C00-foundations.md` §9.

- Store pur + machine à états, `theme/tokens.css`, `paths.ts`, `logging.ts`,
  `messages.ts`, persistance versionnée, `chatViewProvider.ts` extrait.
- 59 tests (unit / render / discipline ×11 / intégration faux bridge), CI.
- **À finir avant merge dans main** : F5 (5 écrans, thèmes, reload fenêtre) ;
  fixtures `test/fixtures/events/` capturées d'un vrai bridge.

## C01 — Protocole v2 ✅ (client)

Branche `wp/C01-turn-protocol`. Items catalogue 19, 20, 38, 39, 110, 112.

**Fait (client, testé contre le faux bridge)** :
- `protocol.ts` v2 : `hello`/`welcome`, `turn_started`/`turn_finished`,
  `event_delta`, `cancel_turn`, `tool_status`, `progress`, `seq`, `resume`/`resumed`.
- Négociation `hello` avec repli v1 dégradé après 2 s (bannière).
- Machine à états définitive : `idle ↔ running` **uniquement** sur `turn_*`
  (invariants I1–I6 tous actifs). `pendingSend` pour l'optimisme (item 112).
- Deltas concaténés + coalescés sur `requestAnimationFrame` ; `event` final
  écrase ; delta en retard ignoré.
- Bouton Stop (`cancel_turn` avec `turn_id` tenu par l'hôte) ; `cancelling` sans
  timeout ; second clic → « Force new session ».
- `tool_status` → ⟳/✓/✗ sur l'item outil ; `progress` → ligne d'état (jamais
  inventée, P3).
- File d'envoi `BridgeClient.enqueue()` : `hello`/`resume`/`list_mcp_servers`
  bufferisés et rejoués à l'ouverture ; `user_message`/`start_session`/`confirm`/
  `cancel_turn` restent stricts + notice.
- `resume {conversation_id, last_seq}` à la reconnexion ; `seq` + `conversationId`
  persistés en `workspaceState` (survivent au reload de fenêtre).
- `PERSIST_VERSION` 1 → 2 (forme `ChatItem`/`AppState` changée).

**Reste (hors de portée ici)** :
- Moitié AgenticEnv : implémenter les messages v2 dans
  `packages/openhands-bridge` puis vider `CLIENT_AHEAD_OF_BRIDGE` dans
  `src/protocol.ts` (commits croisés). Le bridge local est encore v1 — le test de
  dérive le confirme et tolère l'écart.
- F5 : streaming sans flash, reload en plein tour, Stop réel contre un bridge v2.

## C02 — Rendu du fil 🚧

En cours.
