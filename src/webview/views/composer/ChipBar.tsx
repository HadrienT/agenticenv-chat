import type { ContextChip } from "../../../messages";
import { fmtCount } from "../util";

const ICON: Record<string, string> = {
  file: "📄",
  selection: "✂",
  symbol: "❰❱",
  diagnostics: "⚠",
  terminal: "$",
  git: "±",
  image: "🖼",
};

/**
 * Chips de contexte retirables (items 4, 5). Une chip porte un `ContextRef`, pas
 * de contenu. Les auto-chips (fichier actif, sélection) sont marquées « auto » ;
 * leur retrait est mémorisé pour les tours suivants.
 */
export function ChipBar(props: {
  chips: { chip: ContextChip; auto: boolean }[];
  onRemove: (index: number, auto: boolean, refKey: string) => void;
}): JSX.Element | null {
  if (props.chips.length === 0) {
    return null;
  }
  return (
    <div className="agx-chipbar">
      {props.chips.map(({ chip, auto }, i) => (
        <span
          key={JSON.stringify(chip.ref)}
          className={`agx-chip${chip.sensitive ? " agx-chip--sensitive" : ""}${
            chip.unavailable ? " agx-chip--unavailable" : ""
          }`}
          title={chip.unavailable ?? chip.detail ?? chip.label}
        >
          <span aria-hidden="true">{ICON[chip.ref.kind] ?? "•"}</span>
          <span className="agx-chip__label">{chip.label}</span>
          {chip.estBytes > 0 && (
            <span className="agx-chip__size">~{fmtCount(Math.round(chip.estBytes / 4))}</span>
          )}
          {auto && <span className="agx-chip__auto">auto</span>}
          <button
            className="agx-chip__x"
            aria-label={`Remove ${chip.label}`}
            onClick={() => props.onRemove(i, auto, JSON.stringify(chip.ref))}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
