import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { log } from "./logging";

/**
 * Jeton d'accès au bridge (AgenticEnv WP10 §1) : fichier privé régénéré à chaque
 * démarrage du bridge, donc relu à chaque connexion. Même chemin que
 * `openhands_bridge/auth.py:token_path`.
 */
export function bridgeTokenPath(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "agenticenv", "bridge.token");
}

/** `null` si le fichier est absent : un bridge qui exige un jeton refusera, avec un message clair. */
export function readBridgeToken(file: string = bridgeTokenPath()): string | null {
  try {
    return fs.readFileSync(file, "utf8").trim() || null;
  } catch (err) {
    log.debug("no bridge token:", err);
    return null;
  }
}
