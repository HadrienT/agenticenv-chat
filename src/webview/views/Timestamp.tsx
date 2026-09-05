/**
 * Horodatage discret (item 33). Format relatif (« 2 min ago ») jusqu'à 1 h,
 * absolu ensuite. Se recalcule au rendu ; pas d'horloge interne (pas d'effet).
 */
export function Timestamp(props: { ts?: number }): JSX.Element | null {
  if (!props.ts) {
    return null;
  }
  const d = new Date(props.ts);
  const rel = relative(props.ts);
  return (
    <time className="agx-ts" dateTime={d.toISOString()} title={d.toLocaleString()}>
      {rel}
    </time>
  );
}

function relative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) {
    return "just now";
  }
  if (delta < 3_600_000) {
    const m = Math.round(delta / 60_000);
    return `${m} min ago`;
  }
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
