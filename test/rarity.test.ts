import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import {
  rarityRank,
  rollRarity,
  prisonerRarityMods,
  guardRarityMods,
} from "../src/core/rarity";
import { createInitialState } from "../src/core/state";
import { createPrisoner, createGuard } from "../src/core/factory";
import { RARITY_ORDER } from "../src/core/types";

describe("rarity", () => {
  it("orders common → mythic by rank", () => {
    expect(rarityRank("common")).toBe(0);
    expect(rarityRank("mythic")).toBe(5);
    for (let i = 1; i < RARITY_ORDER.length; i++) {
      expect(rarityRank(RARITY_ORDER[i])).toBeGreaterThan(rarityRank(RARITY_ORDER[i - 1]));
    }
  });

  it("rollRarity is deterministic and always valid", () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 50; i++) {
      const ra = rollRarity(a, "city");
      const rb = rollRarity(b, "city");
      expect(ra).toBe(rb);
      expect(RARITY_ORDER).toContain(ra);
    }
  });

  it("higher tiers yield rarer inmates on average", () => {
    const avgRank = (tier: "village" | "crown") => {
      const rng = new Rng(2024);
      let sum = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) sum += rarityRank(rollRarity(rng, tier));
      return sum / n;
    };
    expect(avgRank("crown")).toBeGreaterThan(avgRank("village"));
  });

  it("village never rolls legendary or mythic (weight 0)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 3000; i++) {
      const r = rollRarity(rng, "village");
      expect(r).not.toBe("legendary");
      expect(r).not.toBe("mythic");
    }
  });

  it("rarer prisoners are worth more and rarer guards cost more", () => {
    expect(prisonerRarityMods("mythic").payoutMult).toBeGreaterThan(
      prisonerRarityMods("common").payoutMult,
    );
    expect(prisonerRarityMods("mythic").unrestMult).toBeGreaterThan(
      prisonerRarityMods("common").unrestMult,
    );
    expect(guardRarityMods("mythic").wageMult).toBeGreaterThan(
      guardRarityMods("common").wageMult,
    );
    expect(guardRarityMods("mythic").skill[0]).toBeGreaterThan(
      guardRarityMods("common").skill[0],
    );
  });

  it("factory stamps a valid rarity on prisoners and guards", () => {
    const s = createInitialState(1);
    const rng = new Rng(s.rngState);
    const p = createPrisoner(s, rng, "violent");
    const g = createGuard(s, rng);
    expect(RARITY_ORDER).toContain(p.rarity);
    expect(RARITY_ORDER).toContain(g.rarity);
    // Payout must reflect the prisoner's rarity multiplier.
    expect(p.dailyPayout).toBeGreaterThan(0);
    // Guard wage must reflect its rarity premium (>= base).
    expect(g.wage).toBeGreaterThanOrEqual(8);
  });
});
