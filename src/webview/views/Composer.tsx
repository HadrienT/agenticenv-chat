/**
 * Zone de saisie. En C00 : textarea + bouton Send, brouillon dans le store (donc
 * persistant). C03 ajoute chips de contexte, `/`-commandes, `#`-références.
 */
export function Composer(props: {
  draft: string;
  canSend: boolean;
  placeholder: string;
  onDraft: (v: string) => void;
  onSend: () => void;
}): JSX.Element {
  const submit = (): void => {
    if (props.canSend && props.draft.trim()) {
      props.onSend();
    }
  };
  return (
    <div className="agx-composer">
      <textarea
        className="agx-composer__input"
        placeholder={props.placeholder}
        value={props.draft}
        disabled={!props.canSend}
        aria-label="Message the agent"
        onChange={(e) => props.onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        className="agx-btn"
        disabled={!props.canSend || !props.draft.trim()}
        onClick={submit}
      >
        Send
      </button>
    </div>
  );
}
