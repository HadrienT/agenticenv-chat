# C16 — Travail client lié aux WP10 à WP17 d'AgenticEnv

> **Contexte** : l'audit du 2026-10-30 a produit une feuille de route côté bridge
> (`AgenticEnv/blueprint/wp/WP10` à `WP17`). Ce WP regroupe ce qui revient au client.
> Le détail de conception reste dans les WP d'AgenticEnv.

**Fichiers à lire** : ce fichier · [C15](C15-sandbox-working-copy.md) ·
[03-PROTOCOL.md](../03-PROTOCOL.md) · `docs/bridge-v2-spec.md`

---

## 1. Auto-apply (WP08g) — #12

Code fait sur `feat/auto-apply`. Reste la vérif manuelle : tour avec édition, ajout et
renommage ; Undo turn ; conflit puis **Overwrite** ; mode Ask sans écriture.

## 2. Jeton du bridge (WP10 §1) — #13

| Livrable |
|---|
| Lecture du jeton dans `$XDG_RUNTIME_DIR/agenticenv/bridge.token`, envoi à la connexion. |
| Erreur claire si le jeton est absent ou refusé, jamais de boucle de reconnexion. |

## 3. Annulation et erreurs (WP11) — #14

| Livrable |
|---|
| Bouton Stop vérifié de bout en bout une fois WP11 livré. |
| Gestion de `TURN_IN_PROGRESS` et `APPLY_FAILED`. |
| Avertissement de copie partielle. |
| #6 (`awaiting_confirmation` sans payload) : à fermer ou à reprendre selon le modèle final. |

## 4. Profils et MCP (WP12) — #15

| Livrable |
|---|
| Sélecteur de profil, envoyé dans `start_session.profile`. |
| Le picker MCP dit la vérité : état réel de chaque serveur, tools disponibles. |
| Affichage des fichiers refusés par la liste de chemins protégés. |

## 5. Capabilities de parité (WP17) — #16

Le client gère déjà `deltas`, `todo`, `compact`, `interrupt`, `models` derrière leur
capability, mais rien n'a tourné contre un vrai bridge.

| Livrable |
|---|
| Vérification de chaque capability dès qu'elle est annoncée, retrait de `CLIENT_AHEAD_OF_BRIDGE`. |
| Performance du rendu en streaming sur des réponses longues. |
