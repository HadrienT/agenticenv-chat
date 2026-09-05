import { useState } from "react";
import type { CSSProperties } from "react";
import type { GitChangeDTO, Usage } from "../protocol";

const v = (name: string, fallback: string): string => `var(--vscode-${name}, ${fallback})`;

const dotStyle = (color: string): CSSProperties => ({
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: color,
  flexShrink: 0,
});

const fileBadgeStyle = (bg: string): CSSProperties => ({
  width: "14px",
  textAlign: "center",
  borderRadius: "3px",
  background: bg,
  color: "#fff",
  fontSize: "10px",
  fontWeight: 700,
  flexShrink: 0,
});

const gaugeFillStyle = (pct: number): CSSProperties => ({
  height: "100%",
  width: `${Math.min(100, pct)}%`,
  background: pct > 85 ? v("errorForeground", "#f14c4c") : v("textLink-foreground", "#3794ff"),
});

export const styles: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: v("font-family", "sans-serif"),
    fontSize: "13px",
    color: v("foreground", "#ccc"),
  },
  banner: {
    padding: "4px 8px",
    fontSize: "11px",
    borderBottom: `1px solid ${v("panel-border", "#3336")}`,
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  scroll: { flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "8px" },
  bubbleUser: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    background: v("input-background", "#3c3c3c"),
    borderRadius: "8px",
    padding: "6px 10px",
    whiteSpace: "pre-wrap",
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    maxWidth: "95%",
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
  },
  toolRow: {
    alignSelf: "flex-start",
    maxWidth: "95%",
    borderLeft: `2px solid ${v("textLink-foreground", "#3794ff")}`,
    paddingLeft: "8px",
    fontSize: "12px",
  },
  toolName: { fontWeight: 600, color: v("textLink-foreground", "#3794ff") },
  thought: { opacity: 0.8, fontStyle: "italic", margin: "2px 0" },
  pre: {
    background: v("textCodeBlock-background", "#1e1e1e"),
    padding: "4px 6px",
    borderRadius: "4px",
    overflowX: "auto",
    fontSize: "11px",
    margin: "2px 0 0",
  },
  errorItem: {
    alignSelf: "stretch",
    background: v("inputValidation-errorBackground", "#5a1d1d"),
    border: `1px solid ${v("inputValidation-errorBorder", "#be1100")}`,
    borderRadius: "4px",
    padding: "6px 8px",
    whiteSpace: "pre-wrap",
  },
  thinking: { opacity: 0.6, fontStyle: "italic" },
  confirmCard: {
    margin: "0 8px 8px",
    background: v("inputValidation-warningBackground", "#5a4a1d"),
    border: `1px solid ${v("inputValidation-warningBorder", "#b89500")}`,
    borderRadius: "6px",
    padding: "8px",
  },
  confirmButtons: { display: "flex", gap: "8px", marginTop: "6px" },
  files: {
    borderTop: `1px solid ${v("panel-border", "#3336")}`,
    padding: "6px 8px",
    maxHeight: "120px",
    overflowY: "auto",
  },
  fileRow: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    cursor: "pointer",
    fontSize: "12px",
    padding: "1px 0",
  },
  gauge: {
    borderTop: `1px solid ${v("panel-border", "#3336")}`,
    padding: "6px 8px",
    fontSize: "11px",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  gaugeTrack: {
    height: "4px",
    borderRadius: "2px",
    background: v("input-background", "#3c3c3c"),
    overflow: "hidden",
  },
  inputRow: {
    display: "flex",
    gap: "6px",
    padding: "8px",
    borderTop: `1px solid ${v("panel-border", "#3336")}`,
  },
  textarea: {
    flex: 1,
    resize: "none",
    minHeight: "38px",
    maxHeight: "160px",
    background: v("input-background", "#3c3c3c"),
    color: v("input-foreground", "#ccc"),
    border: `1px solid ${v("input-border", "#3336")}`,
    borderRadius: "4px",
    padding: "6px",
    fontFamily: "inherit",
    fontSize: "13px",
  },
  sendButton: {
    background: v("button-background", "#0e639c"),
    color: v("button-foreground", "#fff"),
    border: "none",
    borderRadius: "4px",
    padding: "0 12px",
    cursor: "pointer",
  },
  picker: { padding: "12px", display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" },
  pickerTitle: { fontWeight: 600 },
  pickerHint: { opacity: 0.7, fontSize: "11px" },
  mcpItem: { display: "flex", gap: "6px", alignItems: "baseline" },
  startButton: {
    marginTop: "8px",
    alignSelf: "flex-start",
    background: v("button-background", "#0e639c"),
    color: v("button-foreground", "#fff"),
    border: "none",
    borderRadius: "4px",
    padding: "6px 14px",
    cursor: "pointer",
  },
};

const CONN_COLOR = { connecting: "#d7ba7d", open: "#89d185", closed: "#f14c4c" } as const;

export function ConnectionBanner(props: {
  state: "connecting" | "open" | "closed";
  detail?: string;
  llmSource?: string;
}): JSX.Element {
  const label =
    props.state === "open"
      ? "bridge connected"
      : props.state === "connecting"
        ? "connecting to bridge…"
        : `bridge disconnected${props.detail ? ` (${props.detail})` : ""}`;
  return (
    <div style={styles.banner}>
      <span style={dotStyle(CONN_COLOR[props.state])} />
      <span>{label}</span>
      {props.llmSource && <span style={{ opacity: 0.6 }}>· llm: {props.llmSource}</span>}
    </div>
  );
}

export function McpPicker(props: {
  servers: { name: string; transport: string; tools: string[] }[];
  selected: Set<string>;
  disabled: boolean;
  starting: boolean;
  onToggle: (name: string) => void;
  onStart: () => void;
}): JSX.Element {
  return (
    <div style={styles.picker}>
      <div style={styles.pickerTitle}>New session</div>
      <div style={styles.pickerHint}>
        Select the MCP servers this session may use, then start. (Phase 1: the list is shown but MCP
        access inside the sandbox is not wired yet — see WP08b §7.)
      </div>
      {props.servers.length === 0 && <div style={styles.pickerHint}>No MCP servers configured.</div>}
      {props.servers.map((s) => (
        <label key={s.name} style={styles.mcpItem}>
          <input
            type="checkbox"
            checked={props.selected.has(s.name)}
            disabled={props.disabled}
            onChange={() => props.onToggle(s.name)}
          />
          <span>
            <strong>{s.name}</strong> <span style={{ opacity: 0.6 }}>({s.transport})</span>
            {s.tools.length > 0 && (
              <span style={{ opacity: 0.5, fontSize: "11px" }}> — {s.tools.join(", ")}</span>
            )}
          </span>
        </label>
      ))}
      <button style={styles.startButton} disabled={props.disabled} onClick={props.onStart}>
        {props.starting ? "Starting sandbox…" : "Start session"}
      </button>
    </div>
  );
}

export function ChatBubble(props: { role: "user" | "assistant"; text: string }): JSX.Element {
  return (
    <div style={props.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}>{props.text}</div>
  );
}

export function ToolRow(props: {
  toolName: string;
  thought?: string;
  args?: unknown;
  result?: unknown;
  observation?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const payload = props.observation ? props.result : props.args;
  return (
    <div style={styles.toolRow}>
      <span style={styles.toolName}>{props.observation ? "↳ " : "▸ "}{props.toolName}</span>
      {props.thought ? <div style={styles.thought}>{props.thought}</div> : null}
      {payload != null && (
        <>
          <button
            style={{ ...styles.sendButton, padding: "0 6px", fontSize: "10px", marginTop: "2px" }}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "hide" : props.observation ? "result" : "args"}
          </button>
          {open && <pre style={styles.pre}>{safeJson(payload)}</pre>}
        </>
      )}
    </div>
  );
}

export function ConfirmCard(props: { onAnswer: (accept: boolean) => void }): JSX.Element {
  return (
    <div style={styles.confirmCard}>
      <div>The agent wants to run an action flagged as risky. Allow it?</div>
      <div style={styles.confirmButtons}>
        <button style={styles.sendButton} onClick={() => props.onAnswer(true)}>
          Allow
        </button>
        <button
          style={{ ...styles.sendButton, background: v("errorForeground", "#f14c4c") }}
          onClick={() => props.onAnswer(false)}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

const CHANGE_BADGE: Record<GitChangeDTO["status"], string> = {
  ADDED: "#587c0c",
  DELETED: "#8b2c2c",
  UPDATED: "#8a6d1d",
  MOVED: "#1d5c8a",
};

export function FileChanges(props: {
  changes: GitChangeDTO[];
  onOpen: (path: string) => void;
}): JSX.Element | null {
  if (props.changes.length === 0) {
    return null;
  }
  return (
    <div style={styles.files}>
      <div style={{ opacity: 0.7, fontSize: "11px", marginBottom: "3px" }}>
        {props.changes.length} changed file{props.changes.length === 1 ? "" : "s"}
      </div>
      {props.changes.map((c) => (
        <div key={c.path} style={styles.fileRow} onClick={() => props.onOpen(c.path)}>
          <span style={fileBadgeStyle(CHANGE_BADGE[c.status])}>{c.status[0]}</span>
          <span>{c.path}</span>
        </div>
      ))}
    </div>
  );
}

export function ContextGauge(props: { usage: Usage }): JSX.Element {
  const { prompt_tokens, completion_tokens, context_window, accumulated_cost } = props.usage;
  const pct = context_window > 0 ? (prompt_tokens / context_window) * 100 : 0;
  return (
    <div style={styles.gauge}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>
          context: {fmt(prompt_tokens)}
          {context_window > 0 ? ` / ${fmt(context_window)}` : ""} · out {fmt(completion_tokens)}
        </span>
        {accumulated_cost > 0 && <span>${accumulated_cost.toFixed(4)}</span>}
      </div>
      {context_window > 0 && (
        <div style={styles.gaugeTrack}>
          <div style={gaugeFillStyle(pct)} />
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
