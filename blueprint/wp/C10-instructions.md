# C10 — Instructions, prompts réutilisables, mémoire

> **Contexte** : à chaque nouvelle session, l'agent redécouvre le projet. Il ne
> sait pas qu'on compile avec `cmake --preset dev`, que les tests sont dans
> `tests/`, que les conventions de nommage sont celles de `09-CONVENTIONS.md` du
> dépôt cible. L'utilisateur le réexplique à chaque fois.
>
> Copilot lit `.github/copilot-instructions.md`, Claude Code lit `CLAUDE.md`. Les
> deux acceptent des instructions à portée de chemin et des prompts réutilisables.
> C'est ce qui transforme un agent générique en agent qui connaît *ce* projet.

**Fichiers à lire** : ce fichier · [C03-composer.md](C03-composer.md) §4 ·
[C04-context-providers.md](C04-context-providers.md) · [C07-permissions.md](C07-permissions.md) §7

**Dépend de** : C03, C04. **Bloque** : rien. **Parallélisable avec** : C08.

**Items du catalogue** : 15 (modes/instructions custom mentionnables), 76 (chargement
automatique de `CLAUDE.md` / `copilot-instructions.md`), 77 (instructions à portée
de chemin), 78 (fichiers de prompt réutilisables), 117 (mémoire projet par `#`),
118 (hooks pre/post tool-use), 119 (`/`-commandes définies par le dépôt).

---

## 1. Fichiers reconnus

| Fichier | Portée | Chargement |
|---|---|---|
| `AGENTS.md` (racine) | tout le dépôt | automatique |
| `CLAUDE.md` (racine) | tout le dépôt | automatique |
| `.github/copilot-instructions.md` | tout le dépôt | automatique |
| `.agenticenv/instructions/*.instructions.md` | globs déclarés en frontmatter | conditionnel |
| `.agenticenv/prompts/*.prompt.md` | invocation explicite | `/`-commande |
| `.agenticenv/modes/*.mode.md` | session | sélecteur de mode |

| Règle |
|---|
| Si plusieurs fichiers racine existent, **tous** sont chargés, dans l'ordre du tableau, concaténés avec un entête nommant la source. On ne choisit pas à la place de l'utilisateur. |
| Un fichier absent n'est pas une erreur et n'est pas signalé. |
| Total plafonné à **16 Kio** ; au-delà, troncature signalée par un `notice` nommant le fichier fautif. Un `CLAUDE.md` de 200 Kio mangerait la fenêtre de contexte. |
| **Rechargement à chaud** : un `FileSystemWatcher` détecte les modifications ; l'effet s'applique au tour suivant, et un `notice` discret le confirme. Éditer ses instructions et devoir redémarrer la session est une friction inutile. |
| Dossier non fiable (Workspace Trust, C07 §7) ⇒ **aucun chargement**. Ce sont des instructions qui pilotent un agent qui exécute des commandes. |

## 2. Frontmatter des instructions à portée (item 77)

```markdown
---
applyTo: ["src/pricing/**/*.cpp", "include/pricing/**/*.hpp"]
description: Conventions de pricing
---
Toute nouvelle classe de payoff hérite de `Payoff` et implémente `clone()`.
```

| Règle |
|---|
| Un fichier ne s'applique que si **au moins un** fichier attaché au message correspond à un glob. |
| Sans `applyTo`, le fichier est ignoré avec un `notice` (une instruction conditionnelle sans condition est un bug de configuration, pas un fichier global implicite). |
| Les globs sont évalués sur des chemins **relatifs au dépôt**. |
| L'utilisateur voit quelles instructions se sont appliquées : chip « 2 instruction files » dans le composer, dépliable. **Une instruction invisible est une source de comportement inexplicable.** |

## 3. Prompts réutilisables (items 78, 119)

```markdown
---
name: review-pricing
description: Revue d'un fichier de pricing
argsHint: "<fichier>"
mode: plan
context: ["#file:${arg}", "#problems"]
---
Relis ${arg} en vérifiant : conventions de temps, gestion des devises,
absence d'allocation dans les boucles chaudes, couverture de tests.
```

| Règle |
|---|
| Chaque `.prompt.md` devient une `/`-commande (`/review-pricing`), listée dans le menu de C03 §4. |
| `${arg}` et `${selection}`, `${file}`, `${workspaceFolder}` sont substitués **côté hôte**. |
| `context:` pré-attache des chips. |
| `mode:` peut forcer le mode plan (C09). |
| Un prompt qui référence un fichier inexistant produit un message clair au moment de l'invocation, pas un `${arg}` littéral envoyé au modèle. |
| Le résultat est **prérempli dans le composer**, pas envoyé directement : l'utilisateur peut ajuster. |

## 4. Modes custom (item 15)

Un `.mode.md` définit un préréglage de session : instructions, mode de permission,
serveurs MCP, modèle préféré.

```markdown
---
name: cpp-review
permissions: readOnly
mcp: ["kbase", "codeintel"]
model: qwen2.5-coder-32b
---
Tu relis du C++ sans jamais modifier de fichier. …
```

Les modes apparaissent dans le sélecteur pré-session, à côté du choix MCP actuel.
Un mode ne peut **pas** élargir les permissions au-delà de ce que le réglage
utilisateur autorise : `permissions:` peut restreindre, jamais relâcher (C07 §2).

## 5. Mémoire projet (item 117)

Commande `agenticenvChat.remember` et geste `#` en début de composer (`# toujours
utiliser cmake --preset dev`) :

| Règle |
|---|
| Ajoute une puce à `AGENTS.md` (créé s'il n'existe pas), sous une section `## Mémoire de l'agent`. |
| **Toujours une confirmation** montrant le fichier, la section et la ligne exacte. Écrire dans un fichier versionné du dépôt sans le dire est inacceptable. |
| Jamais d'écriture ailleurs que dans cette section : le reste du fichier est écrit par un humain. |
| Si `AGENTS.md` est en lecture seule ou hors du dépôt, l'écriture échoue avec un message, sans repli silencieux. |

## 6. Hooks (item 118)

Ambition volontairement limitée : des hooks **côté hôte**, sur des événements du
client, pas sur les appels d'outils de l'agent (qui vivent dans le sandbox).

```jsonc
"agenticenvChat.hooks": {
  "onTurnFinished": [{ "command": "npm run lint", "when": "filesChanged" }]
}
```

| Règle |
|---|
| Événements : `onTurnStarted`, `onTurnFinished`, `onFilesChanged`, `onSessionStarted`. |
| La commande passe par `permissions/policy.ts` (C07) comme n'importe quelle exécution — un hook n'est pas une porte dérobée. |
| Le résultat est affiché dans le fil comme un item « hook », avec sa sortie. Un hook qui échoue n'interrompt rien mais est **visible**. |
| Les hooks ne sont **pas** chargés depuis le dépôt (seulement depuis les réglages utilisateur/workspace de VS Code, soumis à Workspace Trust) : un `git clone` ne doit pas pouvoir installer une exécution automatique. |

## 7. Assemblage et ordre

À l'envoi, l'hôte compose dans cet ordre, chaque bloc étiqueté par sa source :

```
1. instructions racine (AGENTS.md, CLAUDE.md, copilot-instructions.md)
2. instructions à portée dont les globs correspondent
3. instructions du mode actif
4. contexte résolu (C04) — fichiers, diagnostics, git…
5. message de l'utilisateur
```

| Règle |
|---|
| Les instructions sont envoyées dans `context[]` avec `kind: "instructions"`, **pas** concaténées dans `text` (03-PROTOCOL §2.2). |
| En cas de dépassement de budget, on tronque le **contexte** avant les instructions : les instructions sont ce qui donne du sens au reste. |
| Le contenu du dépôt est du **contenu**, pas une consigne système : le bridge le présente comme tel. Un fichier `CLAUDE.md` d'un dépôt tiers cloné peut contenir n'importe quoi — d'où le verrou Workspace Trust. |

## 8. Tests

| Test | Attendu |
|---|---|
| Chargement | les 3 fichiers racine présents ⇒ tous chargés, étiquetés, dans l'ordre |
| Plafond | 16 Kio dépassés ⇒ troncature + notice nommant le fichier |
| Rechargement à chaud | modification détectée, appliquée au tour suivant |
| `applyTo` | s'applique seulement si un fichier attaché correspond ; sans `applyTo` ⇒ ignoré + notice |
| Prompt | substitution des variables ; fichier manquant ⇒ message clair |
| `/`-commande | un `.prompt.md` ajouté à chaud apparaît dans le menu |
| Mode | `permissions: autoAll` dans un mode ne peut pas relâcher un réglage `ask` |
| Mémoire | confirmation obligatoire ; écriture confinée à la section dédiée |
| Hooks | passent par la politique ; hook non chargé depuis le dépôt |
| Trust | dossier non fiable ⇒ rien de tout cela n'est chargé |

## 9. Critères d'acceptation

- [ ] `AGENTS.md` / `CLAUDE.md` / `copilot-instructions.md` sont chargés automatiquement et **visibles** dans le composer.
- [ ] Les instructions à portée ne s'appliquent qu'aux fichiers correspondants.
- [ ] Un `.prompt.md` devient une `/`-commande sans redémarrage.
- [ ] Un mode ne peut jamais élargir les permissions.
- [ ] `#` écrit dans `AGENTS.md` uniquement après confirmation montrant la ligne exacte.
- [ ] Un dossier non fiable ne charge aucune instruction, aucun prompt, aucun hook.
- [ ] Les instructions voyagent dans `context[]`, pas dans `text`.
- [ ] En cas de saturation, le contexte est tronqué avant les instructions.
