import * as vscode from "vscode";
import { log } from "../logging";
import type { ContextRef } from "../messages";
import type { ResolvedContext } from "../protocol";
import { allocate, truncateToBytes, type Budget } from "./budget";
import { collectDiagnostics, condense } from "./diagnostics";
import { resolveFile } from "./files";
import { gitContext } from "./git";
import { resolveSymbol } from "./symbols";
import { lastCommandContext, terminalSelectionContext } from "./terminal";

/**
 * Résolution du contexte (01-ARCHITECTURE §6, C04). La webview envoie des
 * `ContextRef[]` ; l'hôte les résout **au moment de l'envoi** (pas au moment où
 * la chip a été posée) et applique le budget. Un provider en échec renvoie un
 * `ResolvedContext` d'erreur explicite — il ne bloque jamais le message.
 */

export const DEFAULT_BUDGET: Budget = { totalBytes: 48_000, perContextBytes: 16_000 };

export async function resolveRefs(
  refs: ContextRef[],
  budget: Budget = DEFAULT_BUDGET,
): Promise<ResolvedContext[]> {
  if (refs.length === 0) {
    return [];
  }
  const allocations = allocate(
    refs.map((ref) => ({
      chip: { ref, label: "", estBytes: budget.perContextBytes },
      explicit: true,
    })),
    budget,
  );

  const out: ResolvedContext[] = [];
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const max = Math.max(512, allocations[i]?.bytes ?? budget.perContextBytes);
    try {
      out.push(await resolveOne(ref, max));
    } catch (err) {
      log.warn(`context: provider for ${ref.kind} failed:`, err);
      out.push({
        kind: ref.kind,
        label: `${ref.kind} (unavailable)`,
        body: `[context unavailable: ${String(err)}]`,
        truncated: false,
      });
    }
  }
  return out;
}

async function resolveOne(ref: ContextRef, maxBytes: number): Promise<ResolvedContext> {
  switch (ref.kind) {
    case "file": {
      const r = await resolveFile(ref.uri, maxBytes);
      return { kind: "file", label: r.label, body: r.body, truncated: r.truncated };
    }
    case "selection": {
      const r = await resolveFile(ref.uri, maxBytes);
      // resolveFile renvoie tout le fichier ; on garde la plage demandée.
      const lines = r.body.split("\n").slice(ref.range[0] - 1, ref.range[1]);
      const { body, truncated } = truncateToBytes(lines.join("\n"), maxBytes);
      return { kind: "selection", label: `${r.label}:${ref.range[0]}-${ref.range[1]}`, body, truncated };
    }
    case "symbol": {
      const r = await resolveSymbol(ref.uri, ref.name, maxBytes);
      return { kind: "symbol", label: r.label, body: r.body, truncated: r.truncated };
    }
    case "diagnostics": {
      const uri = ref.uri ? vscode.Uri.parse(ref.uri) : undefined;
      const flat = await collectDiagnostics(ref.scope, uri);
      const c = condense(flat);
      const suffix = c.truncated ? ` (showing ${c.shown} of ${c.total})` : "";
      return {
        kind: "diagnostics",
        label: `diagnostics: ${ref.scope}${suffix}`,
        body: c.text,
        truncated: c.truncated,
      };
    }
    case "terminal": {
      if (ref.which === "lastCommand") {
        const t = lastCommandContext();
        return t
          ? { kind: "terminal", label: t.label, body: t.body, truncated: t.truncated }
          : unavailable("terminal", "No captured command (shell integration inactive?).");
      }
      const s = terminalSelectionContext();
      return s
        ? { kind: "terminal", label: s.label, body: s.body, truncated: false }
        : unavailable("terminal", "No terminal selection.");
    }
    case "git": {
      const g = await gitContext(ref.what, maxBytes);
      return { kind: "git", label: g.label, body: g.body, truncated: g.truncated };
    }
    case "image":
      return unavailable("image", "Image context is not wired to the bridge yet (needs a vision model).");
    default:
      return unavailable("unknown", "Unknown context kind.");
  }
}

function unavailable(kind: string, why: string): ResolvedContext {
  return { kind, label: `${kind} (unavailable)`, body: `[${why}]`, truncated: false };
}
