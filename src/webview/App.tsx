import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ComponentHealth,
  GitChangeDTO,
  HealthActionId,
  HostToWebview,
  Outbound,
  SdkEvent,
  Usage,
} from "../protocol";
import {
  ChatBubble,
  ConfirmCard,
  ConnectionBanner,
  ContextGauge,
  FileChanges,
  HealthPanel,
  McpPicker,
  ToolRow,
  styles,
} from "./components";
import { post } from "./vscodeApi";

type Conn = { state: "connecting" | "open" | "closed"; detail?: string };
type McpServer = { name: string; transport: string; tools: string[] };

type ChatItem =
  | { kind: "user" | "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; toolName: string; thought: string; args: unknown }
  | { kind: "observation"; id: string; toolName: string; result: unknown }
  | { kind: "error"; id: string; text: string };

function eventToItems(ev: SdkEvent, index: number): ChatItem[] {
  const id = `${ev.timestamp ?? "e"}-${index}`;
  const kind = ev.kind ?? "";
  if (kind === "MessageEvent") {
    const role = ev.llm_message?.role;
    const text = (ev.llm_message?.content ?? [])
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!text || (role !== "user" && role !== "assistant")) {
      return [];
    }
    return [{ kind: role, id, text }];
  }
  if (kind === "ActionEvent") {
    const thought = Array.isArray(ev.thought)
      ? ev.thought.map((t) => t.text ?? "").join("")
      : typeof ev.thought === "string"
        ? ev.thought
        : "";
    return [
      { kind: "tool", id, toolName: ev.tool_name ?? "tool", thought: thought.trim(), args: ev.action },
    ];
  }
  if (kind === "ObservationEvent") {
    return [{ kind: "observation", id, toolName: ev.tool_name ?? "tool", result: ev.observation }];
  }
  if (kind === "AgentErrorEvent" || typeof ev.error === "string") {
    return [{ kind: "error", id, text: String(ev.error ?? "agent error") }];
  }
  return [];
}

export function App(): JSX.Element {
  const [conn, setConn] = useState<Conn>({ state: "connecting" });
  const [phase, setPhase] = useState<"picking" | "chat">("picking");
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ChatItem[]>([]);
  const [filesChanged, setFilesChanged] = useState<GitChangeDTO[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ llmSource: string } | null>(null);
  const [health, setHealth] = useState<ComponentHealth[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const evIndex = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent<HostToWebview>) => {
      const msg = e.data;
      if (msg.type === "connection") {
        setConn({ state: msg.state, detail: msg.detail });
        if (msg.state === "open") {
          setNotice(null);
        }
      } else if (msg.type === "mcpServers") {
        setMcpServers(msg.servers);
      } else if (msg.type === "health") {
        setHealth(msg.components);
      } else if (msg.type === "hostError") {
        setStarting(false);
        setRunning(false);
        setNotice(msg.text);
      } else if (msg.type === "reset") {
        resetAll();
      } else if (msg.type === "bridge") {
        handleBridge(msg.message);
      }
    };
    window.addEventListener("message", handler);
    post({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, running]);

  function resetAll(): void {
    setPhase("picking");
    setItems([]);
    setFilesChanged([]);
    setUsage(null);
    setPendingConfirm(false);
    setSessionInfo(null);
    setRunning(false);
    setStarting(false);
    evIndex.current = 0;
  }

  function handleBridge(message: Outbound): void {
    switch (message.type) {
      case "session_started":
        setSessionInfo({ llmSource: message.llm_source });
        setPhase("chat");
        setStarting(false);
        break;
      case "event": {
        const newItems = eventToItems(message.event, evIndex.current++);
        if (newItems.length) {
          setItems((prev) => [...prev, ...newItems]);
        }
        break;
      }
      case "files_changed":
        setFilesChanged(message.changes);
        setRunning(false);
        break;
      case "usage":
        setUsage(message);
        setRunning(false);
        break;
      case "awaiting_confirmation":
        setPendingConfirm(true);
        break;
      case "error":
        setItems((prev) => [
          ...prev,
          { kind: "error", id: `err-${evIndex.current++}`, text: `${message.code}: ${message.message}` },
        ]);
        setRunning(false);
        setStarting(false);
        break;
    }
  }

  function startSession(): void {
    setStarting(true);
    post({ type: "startSession", mcpServers: [...selectedMcp] });
  }

  function sendMessage(): void {
    const text = input.trim();
    if (!text || running) {
      return;
    }
    post({ type: "userMessage", text });
    setInput("");
    setRunning(true);
  }

  function confirm(accept: boolean): void {
    post({ type: "confirm", accept });
    setPendingConfirm(false);
    if (accept) {
      setRunning(true);
    }
  }

  const canChat = conn.state === "open" && phase === "chat";

  const body = useMemo(() => {
    if (phase === "picking") {
      return (
        <McpPicker
          servers={mcpServers}
          selected={selectedMcp}
          disabled={conn.state !== "open" || starting}
          onToggle={(name) => {
            setSelectedMcp((prev) => {
              const next = new Set(prev);
              if (next.has(name)) {
                next.delete(name);
              } else {
                next.add(name);
              }
              return next;
            });
          }}
          onStart={startSession}
          starting={starting}
        />
      );
    }
    return (
      <>
        <div style={styles.scroll} ref={scrollRef}>
          {items.map((it) =>
            it.kind === "user" || it.kind === "assistant" ? (
              <ChatBubble key={it.id} role={it.kind} text={it.text} />
            ) : it.kind === "tool" ? (
              <ToolRow key={it.id} toolName={it.toolName} thought={it.thought} args={it.args} />
            ) : it.kind === "observation" ? (
              <ToolRow key={it.id} toolName={it.toolName} result={it.result} observation />
            ) : (
              <div key={it.id} style={styles.errorItem}>
                {it.text}
              </div>
            ),
          )}
          {running && <div style={styles.thinking}>agent is working…</div>}
        </div>
        {pendingConfirm && <ConfirmCard onAnswer={confirm} />}
        <FileChanges changes={filesChanged} onOpen={(p) => post({ type: "openDiff", path: p })} />
        {usage && <ContextGauge usage={usage} />}
        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            placeholder={canChat ? "Message the agent…" : "Not connected"}
            value={input}
            disabled={!canChat || running}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button style={styles.sendButton} disabled={!canChat || running} onClick={sendMessage}>
            Send
          </button>
        </div>
      </>
    );
  }, [
    phase,
    mcpServers,
    selectedMcp,
    conn.state,
    starting,
    items,
    running,
    pendingConfirm,
    filesChanged,
    usage,
    input,
    canChat,
  ]);

  return (
    <div style={styles.app}>
      <ConnectionBanner state={conn.state} detail={conn.detail} llmSource={sessionInfo?.llmSource} />
      <HealthPanel
        components={health}
        onRefresh={() => post({ type: "refreshHealth" })}
        onAction={(component: ComponentHealth["id"], action: HealthActionId) =>
          post({ type: "healthAction", component, action })
        }
      />
      {notice && (
        <div style={styles.notice} onClick={() => setNotice(null)} title="dismiss">
          {notice}
        </div>
      )}
      {body}
    </div>
  );
}
