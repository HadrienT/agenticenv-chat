import type { McpServerView } from "../../../messages";

export function McpPicker(props: {
  servers: McpServerView[];
  selected: string[];
  workspaceFolder: string | null;
  disabled: boolean;
  starting: boolean;
  onToggle: (name: string) => void;
  onStart: () => void;
}): JSX.Element {
  const selected = new Set(props.selected);
  return (
    <div className="agx-picker">
      <div className="agx-picker__title">New session</div>
      <div className="agx-picker__hint">
        {props.workspaceFolder
          ? `The agent will work in your open folder "${props.workspaceFolder}" (bind-mounted into the sandbox). It can read and modify files there.`
          : "No folder open in VS Code — the agent will run in an empty sandbox workspace (nothing to edit). Open a folder for a useful session."}
      </div>
      <div className="agx-picker__hint">
        Select the MCP servers this session may use, then start. (Phase 1: the list is shown but MCP
        access inside the sandbox is not wired yet — see WP08b §7.)
      </div>
      {props.servers.length === 0 && (
        <div className="agx-picker__hint">No MCP servers configured.</div>
      )}
      {props.servers.map((s) => (
        <label key={s.name} className="agx-mcp-item">
          <input
            type="checkbox"
            checked={selected.has(s.name)}
            disabled={props.disabled}
            onChange={() => props.onToggle(s.name)}
          />
          <span>
            <strong>{s.name}</strong> <span className="agx-mcp-item__meta">({s.transport})</span>
            {s.tools.length > 0 && (
              <span className="agx-mcp-item__tools"> — {s.tools.join(", ")}</span>
            )}
          </span>
        </label>
      ))}
      <button
        className="agx-btn agx-btn--block"
        disabled={props.disabled}
        onClick={props.onStart}
      >
        {props.starting ? "Starting sandbox…" : "Start session"}
      </button>
    </div>
  );
}
