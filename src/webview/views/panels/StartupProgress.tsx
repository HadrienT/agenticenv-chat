import { useEffect, useState } from "react";
import type { AppState } from "../../store/types";

/**
 * Étapes réelles du démarrage, annoncées par le bridge. Pas de pourcentage : leur
 * durée varie trop (la copie du projet dépend de sa taille). Le chrono montre que
 * ça avance quand une étape est longue.
 */
export function StartupProgress(props: { startup: AppState["startup"] }): JSX.Element {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const steps = props.startup?.steps ?? [];
  const current = props.startup?.current ?? 0;
  return (
    <div className="agx-startup" role="status">
      <div className="agx-startup__bar">
        <div
          className="agx-startup__fill"
          style={{ width: `${steps.length ? (current / steps.length) * 100 : 0}%` }}
        />
      </div>
      <ol className="agx-startup__steps">
        {steps.map((step, i) => (
          <li
            key={step}
            className={i === current ? "agx-startup__step--active" : "agx-startup__step"}
          >
            {i < current ? "✓" : i === current ? "●" : "○"} {step}
          </li>
        ))}
      </ol>
      <div className="agx-startup__time">{seconds} s</div>
    </div>
  );
}
