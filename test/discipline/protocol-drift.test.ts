import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INBOUND_TYPES, OUTBOUND_TYPES } from "../../src/protocol";

/**
 * Test de dérive du protocole (décision D4, 05-TESTING §4). `src/protocol.ts` est
 * un miroir manuel de `openhands_bridge/protocol.py` : sans garde-fou, il dérive.
 *
 * Le test **skippe proprement** si AgenticEnv n'est pas disponible (CI publique),
 * mais doit tourner en local avant toute release.
 */

function agenticEnvPath(): string | null {
  const candidates = [
    process.env.AGENTICENV_PATH,
    join(homedir(), "AgenticEnv"),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(join(p, "packages", "openhands-bridge"))) ?? null;
}

function protocolPy(root: string): string | null {
  for (const rel of [
    "packages/openhands-bridge/src/openhands_bridge/protocol.py",
    "packages/openhands-bridge/openhands_bridge/protocol.py",
  ]) {
    const p = join(root, rel);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

const root = agenticEnvPath();
const py = root ? protocolPy(root) : null;

describe.skipIf(!py)("discipline — dérive du protocole bridge", () => {
  it("tous les `type: Literal[...]` de protocol.py sont couverts par src/protocol.ts", () => {
    const literals = new Set<string>();
    for (const m of (py as string).matchAll(/type:\s*Literal\[\s*["']([a-z_]+)["']\s*\]/g)) {
      literals.add(m[1]);
    }
    const mirrored = new Set<string>([...INBOUND_TYPES, ...OUTBOUND_TYPES]);
    const missingInTs = [...literals].filter((l) => !mirrored.has(l));
    const staleInTs = [...mirrored].filter((l) => literals.size > 0 && !literals.has(l));
    expect({ missingInTs, staleInTs }).toEqual({ missingInTs: [], staleInTs: [] });
  });
});

it("garde-fou : le test de dérive s'exécute ou skippe explicitement", () => {
  if (!py) {
    // eslint-disable-next-line no-console
    console.warn("[protocol-drift] AgenticEnv introuvable — test skippé (attendu en CI publique)");
  }
  expect(true).toBe(true);
});
