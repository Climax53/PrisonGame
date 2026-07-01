import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { serialize, deserialize, SAVE_VERSION } from "../src/core/save";
import { advanceDay } from "../src/core/simulation";
import { applyDecision } from "../src/core/decisions";

/** Build a JSON blob shaped like a v1 save (pre-morality, pre-rarity). */
function v1SaveBlob(seed: number): string {
  const s = createInitialState(seed);
  const blob = JSON.parse(serialize(s));
  blob.version = 1;
  delete blob.state.morality;
  for (const p of blob.state.prisoners) delete p.rarity;
  for (const g of blob.state.guards) delete g.rarity;
  for (const o of blob.state.offers) delete o.prisoner.rarity;
  return JSON.stringify(blob);
}

describe("save migration", () => {
  it("round-trips a current save unchanged", () => {
    const s = createInitialState(2024);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("migrates a v1 save (no morality/rarity) to a playable state", () => {
    const restored = deserialize(v1SaveBlob(42));
    expect(restored).not.toBeNull();
    expect(restored!.morality).toBe(0);
    expect(restored!.prisoners.every((p) => p.rarity === "common")).toBe(true);
    expect(restored!.guards.every((g) => g.rarity === "common")).toBe(true);
    expect(restored!.offers.every((o) => o.prisoner.rarity === "common")).toBe(true);
  });

  it("a migrated v1 save simulates 30 days without corruption (the old crash)", () => {
    const restored = deserialize(v1SaveBlob(7))!;
    for (let i = 0; i < 30 && !restored.gameOver; i++) {
      advanceDay(restored);
      if (restored.pendingDecision) {
        applyDecision(restored, restored.pendingDecision.options[1].id);
      }
      expect(Number.isNaN(restored.morality)).toBe(false);
      expect(Number.isNaN(restored.reputation)).toBe(false);
      expect(Number.isNaN(restored.resources.coin)).toBe(false);
      for (const p of restored.prisoners) {
        expect(Number.isNaN(p.unrest)).toBe(false);
        expect(typeof p.rarity).toBe("string");
      }
    }
  });

  it("repairs NaN/garbage fields instead of loading corrupted state", () => {
    const s = createInitialState(9);
    const blob = JSON.parse(serialize(s));
    blob.state.morality = null;
    blob.state.prisoners[0].rarity = "unicorn";
    const restored = deserialize(JSON.stringify(blob));
    expect(restored).not.toBeNull();
    expect(restored!.morality).toBe(0);
    expect(restored!.prisoners[0].rarity).toBe("common");
  });

  it("rejects malformed and from-the-future saves", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION + 1, state: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION, state: { day: "x" } }))).toBeNull();
  });
});
