/**
 * Suggestions quand le fil est vide (item 10). **Dérivées du contexte réel** par
 * l'hôte (diagnostics, git, terminal) — jamais génériques (C03 §8). Si l'hôte n'a
 * rien envoyé, on n'affiche rien plutôt qu'une phrase creuse.
 */
export function StarterPrompts(props: {
  prompts: string[];
  onPick: (text: string) => void;
}): JSX.Element | null {
  if (props.prompts.length === 0) {
    return null;
  }
  return (
    <div className="agx-starters">
      {props.prompts.slice(0, 4).map((p) => (
        <button key={p} className="agx-starter" onClick={() => props.onPick(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
