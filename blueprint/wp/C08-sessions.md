# C08 — Sessions, historique, édition de la conversation

> **Contexte** : une session vit tant que la webview vit. Un reload de fenêtre
> efface tout ; il n'y a pas d'historique, pas de reprise, pas de moyen de
> retrouver ce que l'agent avait dit hier, ni de corriger une question mal posée
> sans repartir de zéro.
>
> Contrainte structurante : **le bridge est mono-session** (D7 du primer). On peut
> donc archiver et relire plusieurs conversations, mais une seule est *active*. Ne
> pas prétendre le contraire dans l'UI.

**Fichiers à lire** : ce fichier · [03-PROTOCOL.md](../03-PROTOCOL.md) §4 ·
[C01-turn-protocol.md](C01-turn-protocol.md) §6 (resume) · [00-PRIMER.md](../00-PRIMER.md) §4 (D7, D8)

**Dépend de** : C00, C01. **Bloque** : C13. **Parallélisable avec** : C10.

**Items du catalogue** : 82 (sessions multiples — *portée réduite, voir §1*),
83 (persistance et reprise), 84 (titre auto), 85 (navigateur d'historique),
86 (export), 87 (nouveau chat — déjà là), 88 (chat en onglet éditeur),
90 (éditer un message et relancer), 91 (tronquer), 92 (régénérer),
93 (déplacement panel/sidebar), 105 (badge d'activité), 106 (notification de fin).

---

## 1. Modèle de session (item 82, honnêtement)

| Concept | Définition |
|---|---|
| **Conversation** | un fil archivé : messages, outils, métadonnées, working set final. Il peut y en avoir des centaines. |
| **Session active** | la conversation actuellement rattachée à une sandbox vivante. **Une seule**, imposée par le bridge. |

L'UI expose donc « History » (relecture, export, reprise) et non des onglets
parallèles. Ouvrir une conversation archivée la met en **lecture seule**, avec un
bouton « Resume » qui devient actif si le bridge peut la reprendre, et sinon
« Continue in a new session » qui rejoue le contexte comme premier message.

> Le multi-session réel est un besoin **bridge** (multiplexage de sandbox). Le
> jour où il existe, seul le §1 change ; le reste de ce WP est déjà compatible.

## 2. Stockage

| Cible | Contenu |
|---|---|
| `webview.setState` | `PersistedState` : conversation courante tronquée aux 200 derniers items, brouillon, chips, panneaux ouverts |
| `workspaceState` | id de la conversation active, allowlist (C07), historique des prompts |
| `storageUri/conversations/<id>.json` | conversation complète |
| `storageUri/conversations/index.json` | index : id, titre, date, nb de tours, coût, modèle, chemin du dossier |

```ts
interface StoredConversation {
  version: number;
  id: string;
  title: string | null;
  createdAt: number; updatedAt: number;
  workspacePath: string | null;
  model: string | null;
  items: ChatItem[];
  usage: { cost: number; promptTokens: number; completionTokens: number };
  mcpServers: string[];
}
```

| Règle |
|---|
| Écriture **atomique** : fichier temporaire puis `rename`. Un crash en plein tour ne doit pas corrompre l'index. |
| L'index est reconstructible depuis les fichiers : s'il est corrompu, on le régénère au lieu d'échouer. |
| `version` inconnue ⇒ conversation listée mais non ouvrable, avec un message. Jamais de migration devinée (03-PROTOCOL §4). |
| Rétention : 100 conversations ou 90 jours par défaut, réglable ; purge annoncée, jamais silencieuse. |
| Les conversations sont **par dossier** : l'historique d'un autre projet n'apparaît pas. |

## 3. Titre automatique (item 84)

| Règle |
|---|
| Titre = les 6–8 premiers mots du premier message utilisateur, nettoyés. **Pas d'appel LLM** : c'est un tour de génération payé sur un modèle local lent, pour un gain cosmétique. |
| Renommage manuel possible ; un titre manuel n'est jamais écrasé. |
| Dédoublonnage par suffixe si deux conversations portent le même titre. |

## 4. Édition de la conversation (items 90, 91, 92)

Ce sont des opérations **destructives sur le fil**, à traiter comme telles.

| Action | Comportement |
|---|---|
| **Edit & resend** | l'item utilisateur redevient éditable ; à la validation, tous les items **suivants** sont retirés du fil, et le message est renvoyé. |
| **Truncate from here** | retire cet item et tous les suivants. |
| **Regenerate** | équivaut à « edit & resend » sans changer le texte. |

| Règle |
|---|
| Les items retirés ne sont **pas** perdus : ils partent dans une branche `StoredConversation.branches[]`, accessible par « show previous version ». Perdre une réponse en cliquant à côté est une mauvaise surprise gratuite. |
| Une troncature n'annule **pas** les fichiers écrits par les tours retirés. C'est une opération sur le dialogue, pas sur le disque — la distinction est affichée : « the files changed by those turns are unchanged; use Undo turn (C06) to revert them ». |
| Impossible pendant `running` : proposer Stop d'abord. |
| Ces actions demandent une confirmation si elles retirent plus de 3 items. |

> **Contrainte bridge** : le contexte côté agent contient encore les tours retirés.
> Tant que le bridge n'expose pas de troncature d'historique, l'UI doit dire que
> l'agent « se souvient » de ce qu'on a effacé de l'écran. Ne pas laisser croire à
> une réécriture du passé.

## 5. Navigateur d'historique (item 85)

Un quick-pick natif (`agenticenvChat.history`) : titre, date relative, nb de tours,
coût. Recherche plein texte sur les messages, pas seulement sur les titres.

Un bouton « History » dans l'entête du panneau ouvre le même quick-pick.

## 6. Export (item 86)

| Format | Contenu |
|---|---|
| Markdown | dialogue lisible, blocs de code préservés, outils en sections repliées (`<details>`), diffs en blocs ```diff |
| JSON | `StoredConversation` brut |

Chemins traduits en chemins **relatifs au dépôt** dans l'export markdown : un
export contenant `/workspace/project/...` n'est lisible par personne.

## 7. Emplacement du panneau (items 88, 93)

| Fonction | Détail |
|---|---|
| `agenticenvChat.openInEditor` | ouvre le chat dans un onglet éditeur (`WebviewPanel`), utile en plein écran |
| Déplacement sidebar ↔ panel | déjà géré par VS Code ; `resolveWebviewView` est rappelée et le code actuel coupe le bridge précédent — **conserver ce comportement**, et vérifier que l'état est réhydraté plutôt que perdu (aujourd'hui il l'est) |
| Une seule instance à la fois | ouvrir en onglet ferme la vue sidebar, avec transfert de l'état |

## 8. Notifications (items 105, 106)

| Signal | Comportement |
|---|---|
| Badge sur l'icône de l'activity bar | pendant `running` : badge d'activité ; en `awaiting` : badge d'alerte (une approbation attend) |
| Notification | à la fin d'un tour, **uniquement** si le panneau n'est pas visible et si le tour a duré > 30 s. Cliquer révèle le panneau. |
| Approbation en attente | notification immédiate si le panneau est caché — sinon l'agent attend indéfiniment sans que personne le sache |
| Réglage | `agenticenvChat.notifications`: `never` / `awaiting` / `always` (défaut `awaiting`) |

Un tour peut durer 20 min (primer §5) : ces signaux sont ce qui rend l'attente
supportable. Ne pas les traiter comme du confort.

## 9. Tests

| Test | Attendu |
|---|---|
| Round-trip | conversation ⇒ disque ⇒ relecture identique |
| Écriture atomique | interruption simulée ⇒ index intact |
| Index corrompu | reconstruit depuis les fichiers |
| Version inconnue | listée, non ouvrable, message clair |
| Edit & resend | items suivants retirés, branche conservée, récupérable |
| Troncature pendant `running` | refusée, Stop proposé |
| Titre | dérivé sans appel LLM ; titre manuel non écrasé |
| Export markdown | chemins relatifs, blocs de code intacts, réimportable en JSON |
| Rétention | purge à 100/90 j, annoncée |
| Isolation par dossier | conversations d'un autre dossier absentes |
| Notification | déclenchée seulement panneau caché et tour > 30 s |

## 10. Critères d'acceptation

- [x] `setState` léger (webview) + archive complète `storageUri/conversations/<id>.json` via `persistSnapshot` (débouncé). Reload de fenêtre → hydratation depuis `setState` (C00 §4).
- [x] `agenticenvChat.history` : recherche **plein texte** sur titres **et** messages, isolé par dossier ; entrée d'une version inconnue listée mais non ouvrable.
- [x] Conversation archivée ré-ouverte en lecture seule (reconstruction d'events) + message « Resume needs a bridge that can reattach ».
- [x] `editMessage` / `truncateFrom` / `regenerate` : items suivants → `state.branches` (récupérables « show previous version ») ; bloqué pendant `running` ; **n'annule pas** les fichiers (dit explicitement).
- [x] `toMarkdown` : chemins relatifs au dépôt, outils en `<details>`, réimportable via `toJson`.
- [x] `maybeNotify` : approbation en attente notifiée si panneau caché ; fin de tour si panneau caché **et** tour > 30 s ; `agenticenvChat.notifications`.
- [x] Écriture **atomique** (`.tmp` + `rename`) ; index **reconstructible** (`writeIndex` relit les fichiers) ; purge 100 / 90 j annoncée. 221 tests (round-trip, atomique, index corrompu, purge, isolation, titre, export, édition).
- [x] Badge `view.badge` (item 105).
- [ ] **`openInEditor` (item 88) différé** : `WebviewPanel` + transfert d'état (le `setState` est par-webview) demande une conception dédiée.
- [ ] **F5** : reload complet de fenêtre en plein tour, quick-pick history sur un vrai historique, notification panneau caché, round-trip disque réel.
- [ ] Le `persistSnapshot` archive une copie de tout le fil à chaque tour — envisager un delta si le volume devient un souci (C13).
