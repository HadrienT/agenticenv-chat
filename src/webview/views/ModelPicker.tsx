import type { ModelView } from "../../messages";

/**
 * Sélecteur de modèle discret (C12 §2). N'apparaît **que** si le bridge a
 * répondu à `list_models` (`state.models !== null`) — jamais de liste en dur.
 * Le rechargement `llama-server` peut durer des minutes et échouer en VRAM
 * (primer §5) : pendant `loading`, on renvoie au panneau Components plutôt que
 * d'afficher un spinner opaque ; un `error` montre le message brut de
 * `llama-server`.
 */
export function ModelPicker(props: {
  models: ModelView[] | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}): JSX.Element | null {
  if (!props.models || props.models.length === 0) {
    return null;
  }
  const current = props.models.find((m) => m.current);
  const loading = props.models.find((m) => m.state === "loading");
  const errored = props.models.find((m) => m.state === "error" && m.error);

  return (
    <div className="agx-modelpick">
      <label className="agx-modelpick__label" htmlFor="agx-model-select">
        model
      </label>
      <select
        id="agx-model-select"
        className="agx-modelpick__select"
        value={current?.id ?? ""}
        disabled={props.disabled || !!loading}
        onChange={(e) => e.target.value && props.onSelect(e.target.value)}
      >
        {props.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.contextWindow > 0 ? ` · ${Math.round(m.contextWindow / 1000)}k` : ""}
          </option>
        ))}
      </select>
      {loading && <span className="agx-modelpick__note">loading… — see Components</span>}
      {!loading && errored && <span className="agx-modelpick__err">{errored.error}</span>}
    </div>
  );
}
