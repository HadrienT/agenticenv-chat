import { Fragment } from "react";
import type {
  ComponentHealth,
  ComponentId,
  HealthActionId,
  HealthStatus,
  LlmProfileView,
} from "../../../messages";

const DOT: Record<HealthStatus, string> = {
  up: "agx-dot--ok",
  degraded: "agx-dot--warn",
  down: "agx-dot--error",
  unknown: "agx-dot--unknown",
};

const ACTION_LABEL: Record<HealthActionId, string> = {
  start: "start",
  stop: "stop",
  restart: "restart",
  pull: "pull",
};

function worst(components: ComponentHealth[]): HealthStatus {
  const order: HealthStatus[] = ["down", "degraded", "unknown", "up"];
  for (const s of order) {
    if (components.some((c) => c.status === s)) {
      return s;
    }
  }
  return "unknown";
}

/**
 * Panneau Components : santé du bridge, de llama-server, du proxy, de Docker, de
 * l'image et du GPU. C'est la partie la plus aboutie de l'existant et elle n'a
 * pas d'équivalent chez Copilot — **déplacée sans changement de comportement**
 * depuis `components.tsx` (C00 §2).
 */
export function Health(props: {
  components: ComponentHealth[];
  open: boolean;
  onToggle: () => void;
  onAction: (component: ComponentId, action: HealthActionId) => void;
  onRefresh: () => void;
  llm?: { profiles: LlmProfileView[]; switching: string | null };
  onSelectProfile?: (profile: string) => void;
}): JSX.Element | null {
  const open = props.open;
  if (props.components.length === 0) {
    return null;
  }
  const overall = worst(props.components);
  const bad = props.components.filter(
    (c) => c.status === "down" || c.status === "degraded",
  ).length;

  return (
    <div className="agx-health">
      <button
        className="agx-health__header"
        aria-expanded={open}
        onClick={props.onToggle}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span className={`agx-dot ${DOT[overall]}`} aria-hidden="true" />
        <span>components{bad > 0 ? ` — ${bad} need attention` : " ok"}</span>
        <span
          className="agx-health__refresh"
          role="button"
          aria-label="Refresh component health"
          title="refresh"
          onClick={(e) => {
            e.stopPropagation();
            props.onRefresh();
          }}
        >
          ↻
        </span>
      </button>
      {open &&
        props.components.map((c) => (
          <Fragment key={c.id}>
            <div className="agx-health__row">
              <span className={`agx-dot ${DOT[c.status]}`} aria-hidden="true" />
              <span className="agx-health__label">{c.label}</span>
              <span className="agx-health__detail" title={c.detail}>
                {c.detail}
              </span>
              {c.actions.map((a) => (
                <button
                  key={a}
                  className="agx-health__action"
                  onClick={() => props.onAction(c.id, a)}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
            {c.id === "llama-server" && props.llm && (
              <LlmProfileRow llm={props.llm} onSelect={props.onSelectProfile} />
            )}
          </Fragment>
        ))}
    </div>
  );
}

/**
 * Profil de modèle servi (AgenticEnv#16) : un seul modèle chargé à la fois, la
 * bascule redémarre `llama-server`. Rien si la pile n'a pas de profils.
 */
function LlmProfileRow(props: {
  llm: { profiles: LlmProfileView[]; switching: string | null };
  onSelect?: (profile: string) => void;
}): JSX.Element | null {
  const { profiles, switching } = props.llm;
  if (profiles.length === 0) {
    return null;
  }
  const selected = switching ?? profiles.find((p) => p.active)?.name ?? "";
  return (
    <div className="agx-health__row agx-health__row--sub">
      <label className="agx-health__label" htmlFor="agx-llm-profile">
        profile
      </label>
      <select
        id="agx-llm-profile"
        className="agx-health__select"
        value={selected}
        disabled={!!switching}
        title="Switching restarts llama-server (10–30 s) for every client"
        onChange={(e) => e.target.value && props.onSelect?.(e.target.value)}
      >
        {selected === "" && <option value="">—</option>}
        {profiles.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} · {p.servedName}
            {p.contextWindow > 0 ? ` · ${Math.round(p.contextWindow / 1024)}k` : ""}
          </option>
        ))}
      </select>
      {switching && <span className="agx-health__detail">switching…</span>}
    </div>
  );
}
