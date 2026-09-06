import * as vscode from "vscode";

/**
 * `StatusBarItem` aligné à droite (item 120), visible seulement quand une session
 * existe. Pendant `running` : indicateur d'activité + durée écoulée (sur un tour
 * de 10 min, savoir qu'il tourne depuis 7 est l'info la plus utile). En
 * `awaiting` : couleur d'avertissement. Format `agenticenvChat.statusBar.format`
 * (`${model}` `${context}` `${cost}` `${elapsed}` `${mode}`). Masquable.
 */
const DEFAULT_FORMAT = "$(hubot) ${model} · ${context} · ${cost}";

export interface StatusModel {
  session: boolean;
  phase: "idle" | "running" | "awaiting" | "other";
  model: string;
  contextPct: number | null;
  cost: number;
  turnStartMs: number;
  mode: string;
}

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private model: StatusModel | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "agenticenvChat.view.focus";
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.item.dispose();
  }

  update(model: StatusModel): void {
    this.model = model;
    const cfg = vscode.workspace.getConfiguration("agenticenvChat");
    if (!model.session || cfg.get<boolean>("statusBar.hidden", false)) {
      this.item.hide();
      this.stopTicking();
      return;
    }
    if (model.phase === "running" && !this.timer) {
      this.timer = setInterval(() => this.render(), 1000);
    } else if (model.phase !== "running") {
      this.stopTicking();
    }
    this.render();
    this.item.show();
  }

  private stopTicking(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private render(): void {
    const m = this.model;
    if (!m) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration("agenticenvChat");
    const format = cfg.get<string>("statusBar.format", DEFAULT_FORMAT);
    const elapsed = m.phase === "running" ? fmtElapsed(Date.now() - m.turnStartMs) : "";
    const text = format
      .replace("${model}", m.model || "local")
      .replace("${context}", m.contextPct !== null ? `${Math.round(m.contextPct)}%` : "—")
      .replace("${cost}", `$${m.cost.toFixed(4)}`)
      .replace("${elapsed}", elapsed)
      .replace("${mode}", m.mode);
    this.item.text = m.phase === "running" ? `$(sync~spin) ${text} ${elapsed}` : text;
    this.item.tooltip = `${m.model} · window ${m.contextPct ?? "?"}% · $${m.cost.toFixed(4)} · mode ${m.mode}${
      m.phase === "running" ? ` · turn ${elapsed}` : ""
    }`;
    this.item.backgroundColor =
      m.phase === "awaiting"
        ? new vscode.ThemeColor("statusBarItem.warningBackground")
        : undefined;
  }
}

function fmtElapsed(ms: number): string {
  // Horloge reculée pendant un tour (C14 §5) : borne à 0, jamais négatif.
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}`;
}
