import type { ReactNode } from "react";
import type { ToolStatus } from "../store/types";

/** Vue normalisée d'un appel d'outil, passée aux renderers (C05 §1). */
export interface ToolCall {
  toolName: string;
  args: Record<string, unknown> | undefined;
  thought: string;
}

export interface ToolObs {
  raw: unknown;
  text: string;
  error: boolean;
}

export interface ToolRenderContext {
  sandboxRoot: string | null;
  onOpenFile: (path: string, line?: number) => void;
}

/**
 * Un renderer d'outil. **Pur** (04-CONVENTIONS §2) : mêmes entrées ⇒ même sortie,
 * aucun hook, aucun effet. `rendererFor` en renvoie toujours un (repli générique).
 */
export interface ToolRenderer {
  /** Glyphe d'entête (pas de codicon embarqué dans la webview). */
  icon: string;
  /** Ligne d'entête sur **une seule ligne**. */
  summary(call: ToolCall, obs: ToolObs | null): ReactNode;
  /** Corps déplié. Absent ⇒ JSON formaté générique. */
  body?(call: ToolCall, obs: ToolObs | null, ctx: ToolRenderContext): ReactNode;
  /** Corps ouvert d'office (une erreur, typiquement). */
  defaultExpanded?(call: ToolCall, obs: ToolObs | null, status: ToolStatus): boolean;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Ellipse **au milieu** d'un chemin : `src/…/black.cpp` reste utile (C05 §1). */
export function middleEllipsis(path: string, max = 44): string {
  if (path.length <= max) {
    return path;
  }
  const parts = path.split("/");
  if (parts.length <= 2) {
    return path.slice(0, max - 1) + "…";
  }
  const last = parts[parts.length - 1];
  const first = parts[0];
  return `${first}/…/${last}`.length <= max ? `${first}/…/${last}` : `…/${last}`;
}
