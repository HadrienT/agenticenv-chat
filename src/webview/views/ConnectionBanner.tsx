import type { ConnectionState } from "../store/types";

const DOT: Record<ConnectionState["state"], string> = {
  connecting: "agx-dot--warn",
  open: "agx-dot--ok",
  closed: "agx-dot--error",
};

export function ConnectionBanner(props: {
  connection: ConnectionState;
  llmSource?: string;
}): JSX.Element {
  const { state, detail, protocol } = props.connection;
  const label =
    state === "open"
      ? "bridge connected"
      : state === "connecting"
        ? "connecting to bridge…"
        : `bridge disconnected${detail ? ` (${detail})` : ""}`;
  return (
    <div className="agx-banner" role="status">
      <span className={`agx-dot ${DOT[state]}`} aria-hidden="true" />
      <span>{label}</span>
      {protocol != null && protocol < 2 && (
        <span className="agx-banner__meta">· protocol v{protocol}</span>
      )}
      {props.llmSource && <span className="agx-banner__meta">· llm: {props.llmSource}</span>}
    </div>
  );
}
