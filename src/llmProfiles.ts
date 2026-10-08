import * as fs from "node:fs";
import * as path from "node:path";
import { run } from "./health";
import { log } from "./logging";
import type { LlmProfileView } from "./messages";

// Chemins figés côté AgenticEnv (`infra/scripts/agx-llm-use.sh`, issue #16) :
// rien n'y est pris de l'environnement de l'appelant, on fait pareil ici.
const PROFILES_DIR = "/etc/llm/profiles";
const ENV_LINK = "/etc/llm/llama-server.env";
const SWITCH_BIN = "/usr/local/sbin/agx-llm-use";
const MODELS_URL = "http://127.0.0.1:8000/v1/models";
/** Même forme que celle qu'`agx-llm-use` accepte. */
const PROFILE_NAME = /^[a-z][a-z0-9-]*$/;

const SWITCH_TIMEOUT_MS = 180_000;
const SWITCH_POLL_MS = 2000;

function envVar(text: string, name: string): string | undefined {
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m?.[1].trim() || undefined;
}

/** Lit un `<profil>.env` rendu par `render-llama-env.sh`. `undefined` s'il ne sert aucun modèle. */
export function parseProfileEnv(name: string, text: string): Omit<LlmProfileView, "active"> | undefined {
  const servedName = envVar(text, "LLAMA_SERVED_NAME");
  if (!PROFILE_NAME.test(name) || !servedName) {
    return undefined;
  }
  return { name, servedName, contextWindow: Number(envVar(text, "LLAMA_CTX_SIZE")) || 0 };
}

/**
 * Profils installés (un `.env` par profil) + celui vers lequel pointe
 * `llama-server.env`. Liste vide si la pile n'a pas de profils (AgenticEnv
 * antérieur à #16) ⇒ aucun sélecteur affiché.
 */
export function listProfiles(dir = PROFILES_DIR, link = ENV_LINK): LlmProfileView[] {
  let files: string[];
  let active: string | undefined;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".env")).sort();
  } catch (err) {
    log.trace("listProfiles: no profiles directory:", err);
    return [];
  }
  try {
    active = envVar(fs.readFileSync(link, "utf8"), "LLAMA_PROFILE");
  } catch (err) {
    log.trace("listProfiles: llama-server.env unreadable:", err);
  }
  const profiles: LlmProfileView[] = [];
  for (const f of files) {
    const name = f.slice(0, -".env".length);
    try {
      const parsed = parseProfileEnv(name, fs.readFileSync(path.join(dir, f), "utf8"));
      if (parsed) {
        profiles.push({ ...parsed, active: name === active });
      }
    } catch (err) {
      log.debug(`listProfiles: ${f} unreadable:`, err);
    }
  }
  return profiles;
}

/** Argv de la bascule, lancé sans shell via le sudoers étroit (un profil = une entrée). */
export function switchArgv(profile: string): string[] | undefined {
  return PROFILE_NAME.test(profile) ? ["sudo", "-n", SWITCH_BIN, profile] : undefined;
}

async function servedModels(): Promise<string[]> {
  const r = await run("curl", ["-sf", "-m", "3", MODELS_URL]);
  if (r.code !== 0) {
    return [];
  }
  try {
    const data = (JSON.parse(r.out) as { data?: { id?: unknown }[] }).data ?? [];
    return data.map((m) => String(m.id));
  } catch (err) {
    log.debug("servedModels: /v1/models is not JSON:", err);
    return [];
  }
}

/**
 * Attend que `/v1/models` annonce `servedName`. Le code de retour
 * d'`agx-llm-use` ne dit rien du chargement : la bascule coupe `llama-server`
 * 10 à 30 s et peut échouer en VRAM (agenticenv-chat#11).
 */
export async function waitForServed(servedName: string, timeoutMs = SWITCH_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await servedModels()).includes(servedName)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, SWITCH_POLL_MS));
  }
  return false;
}
