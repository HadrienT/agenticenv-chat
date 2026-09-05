# `test/fixtures/events/`

De **vrais** `Event.model_dump(mode="json")` capturés depuis le bridge (05-TESTING
§2). Le rendu ne se teste pas sur des événements inventés à la main — une fixture
fabriquée est refusée en revue, elle ne prouve rien sur le format réel.

## Procédure de capture

1. Lancer le bridge avec le trace log activé (`agenticenvChat.logLevel = "trace"`
   côté extension, ou le logging du bridge côté AgenticEnv).
2. Faire **un tour réel** dans un vrai VS Code (F5).
3. Copier les frames `{"type":"event", "event": {...}}` depuis l'`OutputChannel`
   « AgenticEnv Chat » vers les fichiers ci-dessous.

## Fichiers attendus

| Fixture | Contenu |
|---|---|
| `message-simple.json` | réponse assistant courte |
| `message-markdown.json` | titres, listes, tableau, 3 blocs de code de langages différents |
| `action-bash.json` / `observation-bash.json` | commande + sortie longue |
| `action-edit.json` / `observation-edit.json` | édition de fichier avec diff |
| `action-read.json` | lecture avec plage de lignes |
| `agent-error.json` | erreur d'agent |
| `turn-full.jsonl` | **un tour complet**, dans l'ordre du fil, rejouable |

## État en C00

C00 installe le harnais mais **ne fabrique pas** ces fixtures (pas d'accès à un
bridge réel au moment du refactor). Les tests de réducteur et de `eventToItems`
de C00 utilisent des événements synthétiques **explicitement étiquetés** dans le
code. Le rendu markdown/code/diff (C02) et le cycle de tour (C01) exigeront ces
captures.
