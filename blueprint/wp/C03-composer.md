# C03 — Composer : chips de contexte, `/`-commandes, `#`-références, pièces jointes

> **Contexte** : la zone de saisie est un `<textarea>` et un bouton Send. Tout ce
> qui fait qu'on *pilote* un agent — dire de quel fichier on parle, joindre une
> erreur, rappeler un prompt — n'existe pas. L'utilisateur doit décrire à la main
> ce que l'éditeur sait déjà.
>
> Ce WP livre l'ergonomie d'entrée. Il consomme les fournisseurs de **C04** : sans
> eux il n'a rien à attacher.

**Fichiers à lire** : ce fichier · [C04-context-providers.md](C04-context-providers.md) ·
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md) §6 · [03-PROTOCOL.md](../03-PROTOCOL.md) §3

**Dépend de** : C00, C04. **Bloque** : C10, C11. **Parallélisable avec** : C05, C06.

**Items du catalogue** : 1 (`/`-commandes), 3 (`#`-références), 4 (bouton Ajouter
du contexte), 5 (chips retirables), 6 (auto-attache fichier/sélection), 7 (glisser-déposer),
8 (collage d'image), 9 (historique des prompts), 10 (prompts de démarrage),
11 (textarea auto-grandissante et raccourcis), 14 (complétion floue des chemins),
16 (avertissement de contexte trop gros), 18 (placeholder contextuel).

---

## 1. Anatomie

```
┌─────────────────────────────────────────┐
│ [📄 black.cpp] [✂ selection 12-40] [⚠ 3] │ ← chips retirables (item 5)
├─────────────────────────────────────────┤
│ Explain why this test fails             │ ← textarea auto-grandissante (11)
│                                         │
├─────────────────────────────────────────┤
│ [＋] [🖼]        1.2k tokens    [ Send ] │ ← ajout de contexte (4), budget (16)
└─────────────────────────────────────────┘
```

## 2. Chips de contexte (items 4, 5, 6)

| Règle |
|---|
| Une chip porte un `ContextRef` (01-ARCHITECTURE §6), **pas** de contenu. La résolution est faite par l'hôte à l'envoi. |
| Le fichier actif et la sélection sont attachés **automatiquement**, sous forme de chips marquées « auto » — retirables, et le retrait est mémorisé pour le tour suivant. |
| Une chip affiche une estimation de taille (« ~2,4k »). L'estimation vient de l'hôte, qui seul connaît le contenu. |
| Chips en doublon fusionnées (même URI + même plage). |
| Les chips sont **conservées après l'envoi** si elles sont « épinglées », sinon vidées. Les auto-chips se recalculent. |

Bouton `＋` ⇒ quick-pick natif VS Code (pas un menu maison) listant : Files,
Selection, Symbol, Problems, Terminal, Git changes, Image. La recherche de fichiers
utilise la complétion floue (item 14).

## 3. `#`-références inline (item 3)

Taper `#` dans le textarea ouvre un menu de complétion **dans la webview** (le
quick-pick natif ne peut pas s'ancrer à un caret de webview).

| Déclencheur | Résultat |
|---|---|
| `#` + texte | recherche floue de fichiers (via `searchFiles` → `fileResults`, débounce 120 ms) |
| `#file:` | fichier explicite |
| `#sym:` | symbole du workspace |
| `#problems` | diagnostics du fichier actif |
| `#terminal` | dernière commande + sortie |
| `#git` | statut et diff courants |
| `#selection` | sélection courante |

Une référence validée devient une **chip** et le token disparaît du texte : le
message envoyé reste lisible, et le contexte voyage dans `context[]`, pas
concaténé dans `text` (03-PROTOCOL §2.2).

## 4. `/`-commandes (item 1)

`/` en **début de champ** ouvre le menu des commandes. Sources :

| Source | WP |
|---|---|
| Commandes intégrées : `/clear`, `/new`, `/stop`, `/help`, `/components` | C03 |
| Fichiers `*.prompt.md` du dépôt | C10 |
| Prompts exposés par les serveurs MCP | C12 |

Une commande est résolue par l'hôte (`resolveCommand`) qui renvoie soit un texte à
préremplir, soit une action locale. **Le client n'interprète pas la sémantique** :
il affiche et transmet.

## 5. Pièces jointes (items 7, 8)

| Geste | Comportement |
|---|---|
| Glisser un fichier depuis l'explorateur | chip `file` |
| Glisser une image | chip `image` ; l'octet-stream est stocké côté **hôte**, la webview ne garde qu'un `id` |
| `Ctrl+V` sur une image | idem |
| Glisser un dossier | refusé avec une explication (« attach individual files, or use #git »)  |

> **Le modèle local n'a probablement pas de vision.** L'hôte interroge les
> capacités du modèle courant (`models` de C12) ; si la vision n'est pas
> disponible, la chip image est affichée **barrée** avec un tooltip explicite,
> plutôt que d'envoyer quelque chose qui sera ignoré silencieusement.

## 6. Saisie (items 9, 11, 18)

| Règle |
|---|
| `Enter` envoie, `Shift+Enter` saut de ligne (déjà le cas). `Esc` : annule le menu ouvert, sinon rend le focus à l'éditeur. |
| Auto-grandissement de 1 à 12 lignes, puis scroll interne. |
| `↑` sur un champ **vide** rappelle le prompt précédent ; `↓` redescend. Historique de 50, persistant par dossier. |
| Le brouillon est persisté (`PersistedState.composerDraft`) et survit au reload. |
| Placeholder contextuel : « Message the agent… » au repos, « Add a note while it works… » en `running` (voir C09 item 61), « Not connected » hors ligne. |
| Pendant `running`, le champ **reste actif** : on peut préparer le message suivant. Le bouton est Stop (C01). |

## 7. Budget avant envoi (item 16)

L'hôte renvoie une estimation par chip. Le composer affiche le total et compare à
la fenêtre de contexte connue (`context_stats` de C13).

| Seuil | UI |
|---|---|
| < 50 % | compteur discret |
| 50–80 % | compteur en couleur d'avertissement |
| > 80 % | avertissement explicite + suggestion de retirer les grosses chips (triées par taille) |
| > 100 % | envoi possible mais avec confirmation ; c'est le bridge qui tronquera |

Aucune troncature automatique côté client : on informe, l'utilisateur décide.

## 8. Prompts de démarrage (item 10)

Quand le fil est vide, afficher 3 à 4 suggestions **dérivées du contexte réel** —
jamais génériques :

| Condition | Suggestion |
|---|---|
| Diagnostics présents | « Fix the 3 errors in `black.cpp` » |
| Modifications git non commitées | « Review my uncommitted changes » |
| Un test a échoué dans le terminal | « Why did `ctest` fail? » |
| Aucun signal | « Explain this repository's structure » |

## 9. Tests

| Test | Attendu |
|---|---|
| Cycle de chip | ajout, doublon fusionné, retrait, retrait mémorisé au tour suivant |
| `#` complétion | débounce, navigation clavier, sélection ⇒ chip + token retiré du texte |
| `/` menu | uniquement en début de champ ; `/x` inconnu ⇒ envoyé comme texte |
| Historique | `↑` seulement sur champ vide ; ne détruit pas un brouillon |
| Budget | seuils, tri des chips par taille |
| Image sans vision | chip barrée, tooltip, envoi bloqué |
| Persistance | brouillon et chips épinglées survivent au reload |
| Clavier seul | tout le composer est utilisable sans souris |

## 10. Critères d'acceptation

- [x] Fichier ouvert sans écrire son chemin : auto-chips `file` + `selection` poussées par l'hôte (`sendAutoContext`).
- [x] `#` complète les fichiers en flou au clavier (menu webview, `searchFiles`/`fileResults` débouncé 120 ms).
- [x] Les chips reflètent ce qui partira : `effectiveAttachments` = explicites + auto non retirées ; `userMessage.context` = `chips.map(c => c.ref)`.
- [x] Contexte dans `context[]`, jamais dans `text` : `userMessage {text, context}` → `user_message {text, context}` (le jeton `#` est retiré du texte à la validation).
- [x] `↑`/`↓` sur champ vide → historique (50, persistant, ne détruit pas un brouillon).
- [x] Budget signalé **avant** l'envoi : `BudgetMeter` seuils ok/warn/high/over ; aucune troncature auto.
- [x] Brouillon + historique persistés (`PERSIST_VERSION` 3→4), survivent au reload.
- [x] `aria-label` sur chaque bouton ; navigation menu clavier (↑↓ Enter Tab Esc). 155 tests.
- [ ] **Différé** : glisser-déposer (item 7 — API drag&drop VS Code) ; collage d'image (item 8 — pas de modèle vision, pas de protocole image bridge). Les chips `image` renverraient « unavailable ».
- [ ] **F5** : ancrage du menu au caret, ressenti de l'auto-grow, quick-pick natif, prompts de démarrage sur un vrai projet.
- [ ] Budget branché sur `context_stats` réel = C13 (pour l'instant `usage.contextWindow`).
