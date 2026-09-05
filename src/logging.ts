import * as vscode from "vscode";

/**
 * Journalisation centralisée (L6 du WP C00).
 *
 * Un seul `OutputChannel` « AgenticEnv Chat ». Tous les modules hôte passent par
 * `log.*` — un `catch` vide est interdit (04-CONVENTIONS §5), un test de
 * discipline le vérifie. Le canal reçoit tout le trafic bridge en niveau `trace`,
 * c'est le premier outil de diagnostic.
 */

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Masque ce qui ressemble à un secret avant écriture (04-CONVENTIONS §4).
 * Couvre les jetons OpenAI (`sk-…`), GitHub (`ghp_…`, `gho_…`, …) et les
 * en-têtes `Authorization: Bearer …` / `token …`.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk|rk)-[A-Za-z0-9_-]{8,}/g, "$1-***")
    .replace(/\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{8,}/g, "$1_***")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{8,}/g, "xox*-***")
    .replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "$1 ***")
    .replace(/("?(?:api_?key|password|secret)"?\s*[:=]\s*"?)[^"\s,}]{6,}/gi, "$1***");
}

/** Sous-ensemble de `vscode.OutputChannel` réellement utilisé par le logger. */
export interface LogSink {
  appendLine(line: string): void;
}

class Logger {
  private channel: LogSink | undefined;
  private level: LogLevel = "info";

  init(channel: LogSink, level: LogLevel): void {
    this.channel = channel;
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private write(level: LogLevel, parts: unknown[]): void {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[this.level]) {
      return;
    }
    const body = parts
      .map((p) => (typeof p === "string" ? p : safeStringify(p)))
      .join(" ");
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${redactSecrets(body)}`;
    if (this.channel) {
      this.channel.appendLine(line);
    } else {
      // Avant `init` (tout début d'activation) : ne rien perdre.
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  error(...parts: unknown[]): void {
    this.write("error", parts);
  }
  warn(...parts: unknown[]): void {
    this.write("warn", parts);
  }
  info(...parts: unknown[]): void {
    this.write("info", parts);
  }
  debug(...parts: unknown[]): void {
    this.write("debug", parts);
  }
  trace(...parts: unknown[]): void {
    this.write("trace", parts);
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch (err) {
    return `[unserializable: ${String(err)}]`;
  }
}

export const log = new Logger();

export function createOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel("AgenticEnv Chat");
}
