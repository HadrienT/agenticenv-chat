# C13 — Budget de contexte, compaction, statusline

> **Contexte** : la jauge de contexte n'apparaît qu'après le premier message
> `usage`, donc **après** le premier tour — c'est-à-dire trop tard pour décider
> quoi envoyer. Elle ne bouge pas pendant un tour. Et rien ne se passe quand la
> fenêtre se remplit : la conversation dégrade sans prévenir.
>
> Sur un modèle local à fenêtre modeste (32K est courant), le budget de contexte
> est **la** ressource rare. C'est ce qui décide si une session tient une heure ou
> s'écroule au dixième tour.

**Fichiers à lire** : ce fichier · [C01-turn-protocol.md](C01-turn-protocol.md) ·
[C04-context-providers.md](C04-context-providers.md) §4 · [C08-sessions.md](C08-sessions.md)

**Dépend de** : C01, C08. **Bloque** : C14. **Parallélisable avec** : C11.

**Items du catalogue** : 65 (compaction automatique), 80 (budget et trim),
108 (compteur de quota — *réinterprété, voir §5*), 115 (indicateur de coût et de
tokens en continu), 120 (statusline configurable).

---

## 1. Jauge en continu (item 115)

`context_stats {prompt_tokens, context_window, compacted}` est poussé **pendant**
le tour (03-PROTOCOL §2.3), pas seulement à la fin.

| Règle |
|---|
| La jauge est visible **dès la connexion**, alimentée par la `context_window` du modèle (C12 §2), avant même le premier tour. |
| Trois zones : < 60 % neutre, 60–85 % avertissement, > 85 % alerte. Le seuil de 85 % du code actuel est conservé. |
| Affichage : `18.2k / 32k · 57%` plus le coût cumulé quand il est non nul. |
| Un survol détaille la répartition estimée : instructions, contexte attaché, historique, dernier message. C'est ce qui permet de savoir **quoi couper**. |
| La jauge ne clignote pas : les mises à jour sont lissées, pas appliquées à chaque token. |

## 2. Que faire quand ça se remplit (items 65, 80)

Trois stratégies, dans l'ordre de préférence :

| # | Stratégie | Qui décide |
|---|---|---|
| 1 | **Réduire ce qu'on ajoute** — l'utilisateur retire des chips (C03 §7) | l'utilisateur, avant l'envoi |
| 2 | **Compacter** — le bridge résume l'historique ancien et repart | l'agent, à la demande ou automatiquement |
| 3 | **Nouvelle session avec report** — repartir propre en réinjectant un résumé et le working set | l'utilisateur |

| Règle |
|---|
| La compaction est un **comportement de harness** : elle appartient au bridge (P1). Le client la déclenche (`/compact`) et l'affiche, il ne résume pas lui-même. |
| Une compaction **automatique** doit être visible dans le fil : « history compacted — 24 turns summarized ». Une conversation qui perd son passé sans le dire produit des réponses incohérentes et inexplicables. |
| Le résumé produit est consultable (item déplié dans le fil). L'utilisateur doit pouvoir vérifier ce qui a été retenu. |
| À > 85 %, le composer propose les trois options ci-dessus, sans en imposer aucune. |
| Si le bridge ne sait pas compacter, l'option n'est pas affichée, et à saturation on propose la stratégie 3 avec un résumé construit à partir du **titre, du plan et du working set** — des données factuelles du client, pas un résumé généré par lui. |

## 3. Trim de l'historique (item 80)

| Règle |
|---|
| Le client **n'ampute jamais** l'historique envoyé : c'est le bridge qui compose le contexte du modèle. Le client n'a pas la vue exacte du prompt. |
| Ce que le client contrôle : ce qu'il **ajoute** (chips, instructions). C'est là que porte le budget de C04 §4. |
| L'ordre de sacrifice, quand le budget ajouté est trop grand : contexte automatique, puis contexte explicite le plus gros, puis jamais les instructions (C10 §7). |

## 4. Statusline (item 120)

Un `StatusBarItem` aligné à droite, visible seulement quand une session existe :

```
$(hubot) qwen2.5-coder-32b · 57% · $0.0000
```

| Règle |
|---|
| Clic ⇒ ouvre le panneau. Survol ⇒ tooltip détaillé (modèle, fenêtre, coût, durée du tour, mode de permission). |
| Pendant `running`, l'élément affiche un indicateur d'activité et la durée écoulée — sur un tour de 10 minutes, savoir qu'il tourne depuis 7 min est l'information la plus utile de tout l'écran. |
| En `awaiting`, l'élément passe en couleur d'avertissement : une approbation attend. |
| Contenu configurable par `agenticenvChat.statusBar.format` (jetons `${model}`, `${context}`, `${cost}`, `${elapsed}`, `${mode}`), avec un défaut sensé. Masquable entièrement. |

## 5. Coût et « quota » (item 108)

Il n'y a pas de quota : le modèle est local. L'item est donc réinterprété en
**budget de ressources locales**, ce qui est le vrai analogue.

| Indicateur | Source |
|---|---|
| Coût cumulé | `usage.accumulated_cost` (0 en local, non nul si un modèle distant est configuré) |
| Durée cumulée d'inférence | mesurée par le client sur les tours |
| Tokens produits par seconde | dérivé de `completion_tokens` et de la durée |
| Contention GPU | déjà fourni par le panneau Components (`health.ts` détecte les process étrangers) |

Le débit en tokens/s est la métrique qui dit si la machine est saine : un
effondrement signale une contention GPU ou un débordement en mémoire. Le relier
visuellement au panneau Components plutôt que d'en faire un chiffre isolé.

## 6. Persistance

Les statistiques par conversation sont archivées avec elle (C08 §2) : coût,
tokens, nombre de tours, durée cumulée, modèle. L'historique affiche ces chiffres,
ce qui rend les sessions comparables — utile pour évaluer un changement de modèle
ou de prompt système côté AgenticEnv.

## 7. Tests

| Test | Attendu |
|---|---|
| Jauge avant premier tour | affichée dès que `context_window` est connue |
| Mise à jour en cours de tour | jauge lissée, pas de clignotement |
| Seuils | 60 % et 85 % changent l'apparence |
| Répartition au survol | somme cohérente avec le total |
| Compaction | visible dans le fil, résumé consultable |
| Compaction non supportée | option masquée, stratégie 3 proposée |
| Statusline | masquée sans session ; durée écoulée correcte ; format personnalisé respecté |
| `awaiting` | statusline en avertissement |
| Débit | tokens/s calculé, cohérent avec `usage` |
| Archivage | statistiques relues correctement depuis l'historique |

## 8. Critères d'acceptation

- [x] La jauge est utile **avant** d'envoyer le premier message. — `metrics {contextWindow}`
  poussé au `ready`/`session_started` ; `ContextGauge` s'affiche dès `state.usage != null`.
- [x] Elle progresse pendant un tour. — `context_stats` routé par `reduceBridge` met à jour
  `usage.promptTokens` **pendant** le tour (pas seulement `usage` en fin).
- [x] À > 85 %, trois options concrètes sont proposées, aucune imposée. — zone `alert` :
  « remove chips » / bouton `/compact` (si capability) / bouton « new session ».
- [x] Une compaction automatique est toujours annoncée dans le fil et son résumé est
  consultable. — `history_compacted` → `CompactionItem` **toujours rendu**, `<pre>` dépliable.
- [x] Le client ne résume jamais l'historique lui-même. — `/compact` et le bouton envoient
  seulement le message `compact` au bridge ; aucun résumé produit côté client.
- [x] La barre d'état montre le modèle, l'avancement du contexte et la durée du tour en
  cours. — `StatusBar` : `${model}` / `${context}` / `${elapsed}` + spinner pendant `running`.
- [x] Le débit tokens/s est visible. — dérivé hôte (`completion_tokens` / durée du tour),
  poussé via `metrics.tokensPerSec`, affiché dans la jauge. *(Lien explicite vers le panneau
  Components : non fait — le débit y est déjà une sonde distincte ; F5.)*
- [~] Les statistiques d'une conversation archivée sont relisibles. — `persistSnapshot` porte
  déjà `cost`/`promptTokens`/`completionTokens` (C08) ; la relecture read-only les affiche.
  `compacted` est redérivé du fil au rechargement. `usage` live n'est pas persisté (recalculé
  au tour suivant).

### Reste (hors portée de l'environnement d'implémentation)

- **Moitié AgenticEnv** : `context_stats`, `history_compacted` (émission) et `compact`
  (réception + compaction réelle) dans `packages/openhands-bridge`, puis retrait de
  `CLIENT_AHEAD_OF_BRIDGE`. Le bridge local est v1 : les trois messages sont inertes.
- **Trim de l'historique (§3)** : reste une responsabilité bridge ; le client ne fait
  qu'afficher et proposer, jamais tronquer.
- **F5** : statusline en thème clair, jauge qui progresse en plein tour, `/compact` réel,
  lien statusline → panneau Components.
