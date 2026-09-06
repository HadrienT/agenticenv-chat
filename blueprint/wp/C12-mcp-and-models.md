# C12 — MCP opérationnel & sélection de modèle/mode

> **Contexte** : le sélecteur MCP affiche la liste des serveurs, l'utilisateur en
> coche, puis **rien ne se passe** — l'accès MCP depuis le sandbox n'est pas câblé
> (Phase 2 d'AgenticEnv WP08c, WP08b §7). C'est le pire état possible d'une UI :
> elle promet une capacité qu'elle n'a pas. Aujourd'hui c'est écrit dans le texte
> du picker ; ce WP le résout pour de bon.
>
> Côté modèles, il n'y a aucun sélecteur : le modèle est celui que
> `llama-server` a chargé. Sur une machine où l'on jongle entre un 30B lent et un
> plus petit rapide, c'est une limite quotidienne.

**Fichiers à lire** : ce fichier · [C01-turn-protocol.md](C01-turn-protocol.md) ·
[00-PRIMER.md](../00-PRIMER.md) §5 (GPU) · AgenticEnv `blueprint/wp/WP08b-openhands-sandbox.md` §7

**Dépend de** : C01. **Bloque** : rien. **Parallélisable avec** : C09.

**Items du catalogue** : 12 (sélecteur de modèle inline), 13 (sélecteur de mode
Ask/Edit/Agent), 121 (prompts MCP exposés en `/`-commandes).

> ⚠️ **Ce WP est majoritairement côté AgenticEnv.** La part client est faible :
> des sélecteurs et un affichage d'outils. Ne pas le démarrer avant que le bridge
> expose `models`/`set_model` et que le wiring MCP existe — sinon on livre encore
> une promesse vide.

---

## 1. MCP réellement branché

Répartition :

| Côté | Travail |
|---|---|
| AgenticEnv (WP08b §7) | rendre les serveurs MCP joignables depuis le conteneur (`streamable-http` sur l'hôte, ou réseau Docker dédié) ; passer la sélection à la création de la conversation |
| Client (ici) | montrer l'état **réel** de chaque serveur, les outils effectivement disponibles, et les appels MCP dans le fil |

### Ce que l'UI doit montrer

```
▾ MCP servers
   ● kbase        streamable-http   5 tools   [reachable]
   ● codeintel    streamable-http   8 tools   [reachable]
   ○ agentmem     stdio             —         [not reachable from sandbox]
```

| Règle |
|---|
| L'état affiché vient d'une **vérification réelle** côté bridge (le serveur répond depuis le conteneur), pas de la présence d'un fichier de config. C'est exactement le bug d'aujourd'hui, à l'échelle du serveur. |
| Un serveur injoignable ne peut pas être coché. Le motif est affiché. |
| La liste des outils vient du serveur (`tools/list`), pas de l'allowlist statique du YAML. L'allowlist filtre l'affichage, elle ne le remplace pas. |
| Les appels MCP apparaissent dans le fil avec le renderer générique de C05 §4, préfixés par le nom du serveur. |
| Le sélecteur reste **pré-session** tant que le bridge ne sait pas changer la liste à chaud ; le dire, plutôt que griser sans explication. |

### Sécurité — contenu MCP

Le contenu renvoyé par `kbase` provient de PDF externes. AgenticEnv WP06 §3 impose
qu'il soit présenté comme **citation, jamais comme instruction**. Corollaire côté
client :

| Règle |
|---|
| Un résultat MCP est rendu dans un cadre visuellement distinct, étiqueté par sa source. |
| Le markdown d'un résultat MCP est assaini avec la **même** allowlist que le reste (C02 §4), et ses liens ne sont jamais des `command:`. |
| Une citation (`document`, `page`, `section`) est affichée quand elle est présente — c'est la garantie de traçabilité de WP06. |

## 2. Sélecteur de modèle (item 12)

```
list_models → models {models: [{id, label, context_window, current}]}
set_model {model_id}
```

| Règle |
|---|
| Sélecteur discret dans le composer, affichant le modèle **courant** — information aujourd'hui absente de l'UI alors qu'elle change tout. |
| Changer de modèle pendant `running` est refusé (C09 §7). |
| Un changement est inscrit dans le fil. |
| **Le rechargement peut prendre des minutes et échouer en VRAM** (primer §5). Pendant l'opération : état « loading », panneau Components mis en avant, pas de spinner opaque. En cas d'échec, le message de `llama-server` est affiché tel quel — c'est lui qui dit ce qui manque. |
| La `context_window` du modèle courant alimente la jauge de C13. Aujourd'hui elle n'arrive qu'avec le premier `usage`. |
| Si le bridge n'expose pas `models`, le sélecteur **n'apparaît pas**. Pas de liste en dur. |

## 3. Sélecteur de mode (item 13)

Copilot propose Ask / Edit / Agent. Ici, deux modes seulement ont une réalité :

| Mode | Réalité technique |
|---|---|
| **Ask** | `permissions.mode = readOnly` (C07) : l'agent lit et répond, n'écrit pas, n'exécute pas |
| **Agent** | comportement complet |
| **Plan** | C09 §3 |

On **n'ajoute pas** un mode « Edit » intermédiaire : il n'aurait pas de contrepartie
côté sandbox et serait un habillage. Trois modes réels valent mieux que quatre
dont un ment.

Le mode est visible dans le composer, mémorisé par dossier, et affiché dans le fil
quand il change.

## 4. Prompts MCP en `/`-commandes (item 121)

MCP définit des *prompts* en plus des *tools*. Un serveur qui en expose les rend
disponibles comme `/kbase.summarize` dans le menu de C03 §4.

| Règle |
|---|
| Les prompts MCP sont fusionnés avec les `.prompt.md` de C10 dans un menu unique, mais préfixés par leur serveur pour lever l'ambiguïté. |
| Leurs arguments sont demandés via un quick-pick natif avant l'insertion. |
| Le résultat est **prérempli dans le composer** (même règle que C10 §3). |
| Le texte d'un prompt MCP est du contenu externe : il n'est jamais exécuté comme une commande, et n'accorde aucune permission. |

## 5. Tests

| Test | Attendu |
|---|---|
| Serveur injoignable | non cochable, motif affiché |
| Liste d'outils | vient de `tools/list`, filtrée par l'allowlist, pas remplacée par elle |
| Résultat MCP | cadre distinct, citation affichée, markdown assaini, aucun `command:` |
| `models` absent | aucun sélecteur affiché |
| `set_model` pendant `running` | refusé |
| Échec VRAM | message de `llama-server` affiché intégralement |
| `context_window` | alimente la jauge avant le premier `usage` |
| Mode Ask | une tentative d'écriture est refusée par la politique |
| Prompt MCP | arguments demandés, résultat prérempli, jamais envoyé seul |

## 6. Critères d'acceptation

- [ ] Cocher un serveur MCP a un **effet réel**. — **non démarré** : le wiring MCP
  (joignabilité conteneur, passage de la sélection à la création de conversation) est
  côté AgenticEnv (WP08b §7). Rien codé côté client qui simulerait cet effet.
- [ ] Un serveur injoignable est signalé et non sélectionnable. — **non démarré** :
  demande une **vérification réelle** côté bridge, pas encore exposée.
- [ ] L'UI ne promet plus une capacité MCP inexistante. — le texte d'avertissement du
  picker **reste** tant que la capacité n'est pas réelle (le retirer maintenant serait
  le vrai mensonge).
- [x] Le modèle courant est visible en permanence. — `ModelPicker` affiche `current`,
  rendu dès que `state.models !== null`.
- [x] Un changement de modèle qui échoue affiche la raison réelle. — `models[].error`
  (message brut `llama-server`) rendu tel quel ; `loading` renvoie au panneau Components.
- [x] Le mode Ask empêche réellement l'écriture. — `setSessionMode("ask")` →
  `permissions.setModeOverride("readOnly")` (RANK strict) ; toute écriture passe par
  `evaluate()` en `readOnly` → refusée (matrice C07). *(F5 : bout en bout.)*
- [ ] Les résultats MCP sont présentés comme des citations. — **non démarré** : dépend
  d'appels MCP réels dans le fil ; le renderer générique de C05 §4 les couvre en
  attendant, l'encadré « citation » dédié est à ajouter avec le wiring.
- [x] Aucun sélecteur n'apparaît si le bridge n'expose pas la capacité. — `ModelPicker`
  rend `null` si `state.models === null` ; le sélecteur Ask/Agent/Plan est purement
  client (protection `readOnly` réelle), donc toujours pertinent.

### Fait (client)

- `list_models` / `set_model` / `models` dans `protocol.ts` (+ `CLIENT_AHEAD_OF_BRIDGE`) ;
  `list_models` enqueué à la négociation.
- `views/ModelPicker.tsx` : modèle courant, `context_window` → jauge C13
  (`reduceHostAux.applyModels`), changement refusé pendant `running`, `model-switch`
  inscrit dans le fil.
- Sélecteur **Ask / Agent / Plan** (pas de « Edit ») dans `ComposerFoot` ;
  `applyPermissionOverride()` = le plus strict de (`.mode.md`, mode de session) ;
  bannière d'explication ; `PERSIST_VERSION` 9→10 (`planMode` bool → `sessionMode`).

### Reste (moitié AgenticEnv)

`models` / `set_model` dans `packages/openhands-bridge` + rechargement `llama-server` ;
joignabilité MCP depuis le conteneur + `tools/list` réel + vérification par serveur ;
prompts MCP dans `McpServerEntry` ; encadré citation MCP.
