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
| C01 | Protocole v2 : tours, deltas, annulation | `wp/C01-turn-protocol` | 🚧 en cours | moitié AgenticEnv non faisable ici |
| C02 | Rendu du fil (markdown, code, liens) | — | ⏳ à faire | |
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

## C01 — Protocole v2 🚧

En cours.
