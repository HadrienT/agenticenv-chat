import { describe, expect, it } from "vitest";
import { allocate, truncateToBytes } from "../../src/context/budget";
import type { ContextChip } from "../../src/messages";

const chip = (estBytes: number): ContextChip => ({
  ref: { kind: "file", uri: `file:///${estBytes}` },
  label: "c",
  estBytes,
});

describe("allocate — budget de contexte (C04 §4)", () => {
  it("les chips explicites passent avant les automatiques", () => {
    const out = allocate(
      [
        { chip: chip(40_000), explicit: false },
        { chip: chip(2_000), explicit: true },
      ],
      { totalBytes: 10_000, perContextBytes: 8_000 },
    );
    // la chip explicite (2e en entrée) est servie en premier et obtient sa taille
    expect(out[0].bytes).toBe(2_000);
  });

  it("garde une part minimale pour chaque chip restante", () => {
    const out = allocate(
      Array.from({ length: 5 }, () => ({ chip: chip(100_000), explicit: true })),
      { totalBytes: 6_000, perContextBytes: 100_000 },
    );
    expect(out.every((a) => a.bytes >= 512)).toBe(true);
  });
});

describe("truncateToBytes", () => {
  it("signale la troncature et coupe sur une limite de ligne", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const r = truncateToBytes(text, 120);
    expect(r.truncated).toBe(true);
    expect(r.body.endsWith("(truncated)")).toBe(true);
    expect(r.body.length).toBeLessThan(text.length);
  });

  it("texte court : intact", () => {
    expect(truncateToBytes("short", 100)).toEqual({ body: "short", truncated: false });
  });
});
