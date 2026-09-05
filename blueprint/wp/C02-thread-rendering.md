# C02 — Rendu du fil : markdown, code, liens, raisonnement

> **Contexte** : la réponse de l'agent est affichée en texte brut
> (`white-space: pre-wrap`). Un LLM répond en markdown avec des blocs de code —
> l'utilisateur voit donc des ``` littéraux, sans coloration, sans bouton Copier.
> **C'est le plus gros écart visuel avec Copilot Chat**, et le WP au meilleur
> rapport effort/effet du plan.

**Fichiers à lire** : ce fichier · [00-PRIMER.md](../00-PRIMER.md) §5 (contraintes CSP
et bundle) · [04-CONVENTIONS.md](../04-CONVENTIONS.md) §3–4 · [05-TESTING.md](../05-TESTING.md) §2

**Dépend de** : C00. **Bloque** : C05, C06, C11. **Parallélisable avec** : C01, C04.

**Items du catalogue** : 21 (markdown complet), 22 (code coloré), 23 (barre d'outils
de bloc), 24 (feedback « Copié »), 25 (Mermaid), 26 (maths), 27 (liens `fichier:ligne`),
28 (bloc de commande — *rendu seulement*, l'exécution est en C07), 29 (troncature),
32 (bloc de raisonnement), 33 (horodatage), 34 (pouces), 44 (liens dans les résultats).

---

## 1. Livrables

| # | Livrable |
|---|---|
| L1 | `render/Markdown.tsx` — markdown assaini, tolérant au document incomplet |
| L2 | `render/CodeBlock.tsx` — coloration + barre d'outils |
| L3 | `render/FileLink.tsx` — `chemin:ligne` cliquable, via `paths.ts` |
| L4 | `render/Mermaid.tsx`, `render/Math.tsx` — chargés à la demande |
| L5 | `render/Diff.tsx` — rendu d'un bloc ```diff (réutilisé et enrichi par C06) |
| L6 | `views/items/MessageItem.tsx` — bulle + horodatage + retour utilisateur |
| L7 | `views/items/ThinkingItem.tsx` — raisonnement repliable |
| L8 | Actions hôte : `copy`, `insertAtCursor`, `createFile`, `openFile` |

## 2. Choix de bibliothèques — contraintes d'abord

Avant de choisir, relire 00-PRIMER §5. Les deux contraintes qui éliminent :
**pas d'`unsafe-eval`** et **budget de bundle 1,5 Mo**.

| Besoin | Piste | À vérifier `[À CONFIRMER]` |
|---|---|---|
| Parseur markdown | `markdown-it` ou `marked` | pas de `new Function` ; support des tables et du GFM |
| Assainissement | `dompurify` | fonctionne sous CSP stricte ; configurer une **allowlist**, pas une denylist |
| Coloration | `highlight.js` avec import **sélectif** de langages | `shiki` embarque des grammaires TextMate + un moteur wasm : mesurer avant d'exclure, c'est le rendu le plus fidèle à VS Code |
| Maths | `katex` | CSS et polices à inliner ; sinon pas de rendu |
| Mermaid | `mermaid` | **lourd (~1 Mo)** : import dynamique, uniquement si un bloc ```mermaid existe |

Langages colorés par défaut (le reste retombe sur du texte brut) : `cpp`, `c`,
`python`, `typescript`, `javascript`, `json`, `yaml`, `bash`, `cmake`, `sql`,
`diff`, `markdown`. Le repo cible est du C++ — le C++ n'est pas négociable.

> Si une bibliothèque viole la CSP, **on ne relâche pas la CSP** : on change de
> bibliothèque (04-CONVENTIONS §4).

## 3. Barre d'outils de bloc de code (item 23)

| Action | Comportement |
|---|---|
| **Copy** | copie ; le bouton affiche « Copied! » 1,5 s (item 24) |
| **Insert** | insère au curseur de l'éditeur actif ; grisé si aucun éditeur |
| **New file** | crée un fichier non enregistré, langage prérempli d'après l'info-string |
| **Run** | uniquement si le langage est `bash`/`sh`/`shell` — passe par C07, jamais direct |
| **Apply** | uniquement si le bloc porte un chemin (``` ```cpp path=src/x.cpp```) — délégué à C06 |

La barre apparaît au survol **et** au focus clavier (accessibilité). L'info-string
est parsée : `lang`, `path=`, `title=`.

## 4. Assainissement (règle de sécurité)

Le markdown vient d'un LLM qui a lu des fichiers du dépôt. Un fichier peut
contenir du HTML hostile, et le modèle peut le recracher.

| Règle |
|---|
| Allowlist de balises : titres, paragraphes, listes, `code`, `pre`, `table`, `blockquote`, `a`, `img`, `strong`, `em`, `del`, `hr`, `br`. Rien d'autre. |
| Attributs : `href`, `src`, `alt`, `title`, `class`. Aucun `on*`. |
| Schémas d'URL : `https`, `http`, `command:` restreint à nos propres commandes, `file:` uniquement après traduction par `paths.ts`. Tout le reste est neutralisé en texte. |
| `img` distant : **bloqué par la CSP** de toute façon ; afficher un placeholder explicite plutôt qu'une image cassée. |
| Un test de rendu injecte `<script>`, `<iframe>`, `javascript:`, `onerror=` et vérifie qu'aucun n'est exécuté ni conservé. |

## 5. Streaming : rendre un markdown incomplet (dépend de C01)

Pendant le streaming, le texte est un document **tronqué à un endroit arbitraire**.

| Situation | Traitement |
|---|---|
| Bloc de code non fermé | fermer virtuellement à l'affichage ; ne pas attendre le ``` final |
| Tableau à moitié écrit | rendre les lignes complètes, ignorer la dernière |
| Lien ou emphase non fermés | rendre en texte brut jusqu'à fermeture |
| Bloc ```mermaid en cours | afficher le source brut, ne tenter le rendu qu'une fois le bloc fermé |

Mémorisation : le rendu est mémorisé par `(item.id, revision)` ; un item figé
(`streaming: false`) n'est jamais reparsé.

## 6. Liens de fichiers (items 27, 44)

- Détection dans le markdown rendu et dans les sorties d'outil :
  `path:line`, `path:line:col`, `path` seul si le chemin existe.
- Traduction obligatoire par `paths.ts`. **Un chemin non traduisible est affiché
  en texte non cliquable**, jamais en lien mort (01-ARCHITECTURE §5).
- Clic ⇒ `openFile {path, line}` ⇒ `showTextDocument` avec révélation et sélection
  de la ligne.
- Survol ⇒ tooltip avec le chemin complet côté hôte.

## 7. Raisonnement, horodatage, retour (items 32, 33, 34)

| Élément | Comportement |
|---|---|
| Raisonnement | Le `thought` d'un `ActionEvent` et tout `ThinkingEvent` vont dans un bloc replié par défaut, intitulé « Thought for Ns » (durée mesurée entre `turn_started`/premier token). Réglage `agenticenvChat.thread.expandThinking`. |
| Horodatage | Discret, au survol de l'item (`title` + élément visuel léger). Format relatif (« 2 min ago ») jusqu'à 1 h, absolu ensuite. |
| Pouces | 👍/👎 par message assistant. **Aucune télémétrie** (D7) : le retour est écrit dans un journal local `storageUri/feedback.jsonl` avec le tour et le modèle, pour servir de corpus d'évaluation à AgenticEnv. C'est le seul usage. |

## 8. Troncature (item 29)

Un `ObservationEvent` peut contenir des milliers de lignes.

| Règle |
|---|
| Au-delà de **200 lignes** ou **20 Kio**, on affiche le début et la fin, avec « … N lignes masquées » et un bouton « Show all ». |
| « Show all » au-delà de 2000 lignes propose plutôt « Open in editor » (document virtuel), pour ne pas geler la webview. |
| La troncature est faite au **rendu**, l'item garde le contenu complet en mémoire. |

## 9. Tests

| Test | Attendu |
|---|---|
| `Markdown.test.tsx` sur `message-markdown.json` | titres, listes, table, 3 blocs colorés |
| Injection XSS (5 vecteurs) | neutralisée, rien d'exécuté |
| Markdown incomplet (10 troncatures d'un même document) | aucun crash, aucun clignotement de structure |
| `CodeBlock.test.tsx` | les 5 actions émettent le bon message ; « Copied! » revient à « Copy » |
| `FileLink.test.tsx` | chemin sous montage ⇒ lien ; hors montage ⇒ texte |
| Budget de bundle | ≤ 1,5 Mo **sans** Mermaid (import dynamique) |
| Thèmes | rendu lisible en Dark+, Light+, Dark High Contrast |

## 10. Critères d'acceptation

- [ ] Une réponse markdown typique s'affiche comme dans Copilot Chat : titres, listes, tables, code coloré.
- [ ] Le C++ est colorié correctement.
- [ ] Copier / Insérer / Nouveau fichier fonctionnent sur un vrai éditeur.
- [ ] Aucun vecteur XSS de la suite de tests ne passe.
- [ ] Le rendu pendant le streaming ne clignote pas et ne casse pas sur un bloc non fermé.
- [ ] Les chemins cités sont cliquables et ouvrent la bonne ligne.
- [ ] Budget de bundle respecté ; Mermaid chargé seulement à l'usage.
- [ ] Vérifié en trois thèmes et en sidebar 250 px.
