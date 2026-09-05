# C09 — Plan, todo, pilotage de la boucle agent

> **Contexte** : sur un tour long, on ne voit défiler que des appels d'outils. On
> ne sait pas où en est l'agent, combien d'étapes restent, ni s'il tourne en rond.
> Sur un modèle local lent — un tour peut dépasser 600 s (primer §5) — c'est la
> différence entre attendre en confiance et tuer la session par doute.
>
> **Ce WP est celui qui dépend le plus d'AgenticEnv.** Un todo ou un mode plan ne
> se simulent pas côté client : ce sont des comportements d'agent. Le client
> affiche et pilote ; le harness produit. Toute tentative de deviner un plan à
> partir des appels d'outils viole P1 et P3.

**Fichiers à lire** : ce fichier · [00-PRIMER.md](../00-PRIMER.md) §2 ·
[03-PROTOCOL.md](../03-PROTOCOL.md) §2 · [C05-tool-rendering.md](C05-tool-rendering.md) ·
[C07-permissions.md](C07-permissions.md)

**Dépend de** : C01, C05, C07. **Bloque** : C14. **Parallélisable avec** : C08.

**Items du catalogue** : 31 (questions de suivi), 54 (liste de tâches live),
55 (mode plan), 56 (auto-correction), 61 (interruption pour ajouter une consigne),
62 (terminaux d'arrière-plan), 63 (changement de modèle en cours de session),
67 (cap d'itérations), 123 (plan approuvé avant écriture), 124 (todo à cases).

---

## 1. Répartition des responsabilités

| Item | Client | AgenticEnv |
|---|---|---|
| 54, 124 — todo | affichage, repli, clic ⇒ scroll vers l'étape | l'agent doit **produire** un todo (outil ou microagent) et le bridge le relayer en `todo {items}` |
| 55, 123 — mode plan | bascule, écran d'approbation, envoi de l'approbation | l'agent doit avoir un mode lecture seule réel côté sandbox |
| 56 — auto-correction | rien à faire, c'est un comportement | microagents / prompt système (AgenticEnv WP08) |
| 61 — interruption | UI et `interrupt {turn_id, text}` | injection dans le tour en cours |
| 62 — terminaux longs | affichage d'un process suivi | suivi côté agent-server |
| 63 — changement de modèle | sélecteur | `set_model` + rechargement côté llama-server |
| 67 — cap d'itérations | affichage et relance | compteur et arrêt côté harness |
| 31 — suivi | affichage de puces cliquables | génération |

**Règle** : chaque ligne dont la colonne AgenticEnv est non vide **ne démarre pas
côté client** avant que le message existe dans le bridge. Sinon on écrit une UI
qui affiche du vide.

## 2. Panneau Todo (items 54, 124)

```
▾ Plan · 2/5
   ✓ Read the failing test
   ✓ Locate the discount factor computation
   ⟳ Fix the day-count convention          ← étape active
   ○ Rebuild and run ctest
   ○ Update the changelog
```

| Règle |
|---|
| `todo {items}` pousse un **état complet** (03-PROTOCOL §3.3), jamais un patch. Le client ne fabrique ni n'infère d'étape. |
| L'étape active est mise en évidence ; un clic scrolle vers le premier item du fil produit après son passage à `active`. |
| Le panneau s'ouvre automatiquement au premier `todo` reçu, puis suit le choix de l'utilisateur. |
| Sans `todo` (agent qui n'en produit pas), le panneau **n'apparaît pas du tout**. Pas de panneau vide. |
| Une étape `skipped` reste visible, barrée. On ne masque pas ce que l'agent a décidé de sauter. |
| Le todo est archivé avec la conversation (C08) : à la relecture, on voit le plan suivi. |

## 3. Mode plan (items 55, 123)

Un sélecteur dans le composer : **Plan** / **Agent**.

| Mode | Contrat |
|---|---|
| Plan | l'agent explore et propose, **sans écrire ni exécuter**. Le tour se termine par un plan. |
| Agent | comportement actuel |

Écran d'approbation en fin de tour Plan :

```
The agent proposes 5 steps.        [ Approve & run ]  [ Edit plan ]  [ Discard ]
```

| Règle |
|---|
| Le mode plan est **appliqué côté sandbox**, pas par un préfixe de prompt. Un « fais un plan sans écrire » dans le prompt n'est pas une garantie : c'est une suggestion qu'un modèle local ignorera. En attendant un vrai mode côté agent-server, la bascule force `permissions.mode = readOnly` (C07) — protection réelle, et le dire dans l'UI. |
| « Edit plan » ouvre le plan en texte éditable, renvoyé comme message d'approbation. |
| Un plan approuvé devient le `todo` du tour suivant s'il en produit un. |

## 4. Interruption (item 61)

Pendant `running`, le composer reste actif (C03 §6). Envoyer alors :

| Cas | Comportement |
|---|---|
| Bridge avec `interrupt` | `interrupt {turn_id, text}` — le message apparaît dans le fil comme « note added mid-turn », l'agent le prend en compte sans repartir |
| Bridge sans `interrupt` | le message est **mis en file** et envoyé au `turn_finished`. L'UI le montre en attente, grisé, avec « will be sent when the turn ends ». Jamais silencieusement retardé. |

## 5. Cap d'itérations (item 67)

`turn_finished {reason: "max_iterations"}` ⇒ le fil affiche :

```
The agent stopped after 50 steps without finishing.
[ Continue ]  [ Continue with guidance… ]  [ Stop here ]
```

| Règle |
|---|
| « Continue » renvoie une continuation, sans reformuler la demande initiale. |
| Le compteur d'étapes est affiché en continu dans l'entête quand il dépasse la moitié du cap. |
| Le cap lui-même est un réglage **côté AgenticEnv**, pas côté client. Le client l'affiche, il ne le fixe pas. |

## 6. Terminaux d'arrière-plan (item 62)

Pour un serveur de dev ou une compilation longue lancée par l'agent :

| Règle |
|---|
| Un process marqué `background` par le bridge apparaît dans un panneau « Background tasks » : nom, durée, dernières lignes, bouton Stop. |
| Il ne pollue pas le fil : une seule ligne « Started `cmake --build` in background », le suivi est dans le panneau. |
| Un process encore vivant à la fin de la session déclenche un avertissement avant fermeture. |
| Sans support bridge, ce panneau n'existe pas — pas d'émulation par polling. |

## 7. Changement de modèle en cours (item 63)

Voir C12 pour le sélecteur. Spécifique ici :

| Règle |
|---|
| Changer de modèle pendant `running` est refusé, avec proposition de Stop. |
| Un changement de modèle est marqué **dans le fil** (« switched to qwen2.5-coder-32b »), car il change l'interprétation de tout ce qui suit. |
| Le rechargement d'un modèle sur `llama-server` peut prendre des minutes et échouer en VRAM (primer §5) : l'UI montre l'état via le panneau Components existant plutôt que d'afficher un spinner opaque. |

## 8. Questions de suivi (item 31)

Puces cliquables sous la réponse, **uniquement si le bridge en fournit**.

| Règle |
|---|
| Pas de génération côté client. Pas d'appel LLM supplémentaire depuis l'extension (P1). |
| Si l'agent n'en produit pas, il n'y a pas de section. Pas de suggestions génériques. |
| Un clic préremplit le composer, il n'envoie pas directement : l'utilisateur garde la main. |

## 9. Tests

| Test | Attendu |
|---|---|
| `todo` complet | remplacement d'état, jamais de fusion |
| Absence de `todo` | aucun panneau |
| Étape `skipped` | visible, barrée |
| Mode plan | force `readOnly` ; une tentative d'écriture est refusée par la politique |
| Interruption avec support | message marqué « mid-turn », tour non interrompu |
| Interruption sans support | message en attente visible, envoyé au `turn_finished` |
| `max_iterations` | les 3 boutons, « Continue » n'altère pas la demande initiale |
| Changement de modèle pendant `running` | refusé avec proposition de Stop |
| Archivage | le todo final est relu correctement depuis l'historique |

## 10. Critères d'acceptation

- [ ] Un plan produit par l'agent s'affiche et se met à jour en direct.
- [ ] Aucun élément de plan n'est inféré côté client.
- [ ] Le mode plan empêche réellement l'écriture (vérifié par une tentative).
- [ ] Une consigne tapée pendant un tour n'est jamais perdue ni envoyée silencieusement plus tard sans le dire.
- [ ] Un arrêt sur cap d'itérations propose une continuation claire.
- [ ] Aucune fonctionnalité de ce WP n'affiche un panneau vide faute de support bridge.
- [ ] Les besoins bridge de §1 sont ouverts comme issues côté AgenticEnv, référencées ici.
