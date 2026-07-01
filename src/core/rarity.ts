// ─────────────────────────────────────────────────────────────────────────────
// Rarity — the notoriety axis
//
// Rarity is orthogonal to crime severity. It's rolled at intake with weights
// that improve as the warden climbs tiers, so higher standing surfaces rarer,
// more valuable — and more dangerous — inmates and guards. All lookups are pure
// functions over BALANCE so the whole system is data-driven and testable.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import type { Rng } from "./rng";
import { RARITY_ORDER, type Rarity, type WardenTier } from "./types";

/** Numeric rank 0 (common) … 5 (mythic). */
export function rarityRank(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

/** Weighted random rarity for the given tier. Deterministic via the seeded Rng. */
export function rollRarity(rng: Rng, tier: WardenTier): Rarity {
  const weights = BALANCE.rarity.weights[tier];
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  let roll = rng.range(0, total);
  for (const r of RARITY_ORDER) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return "common";
}

/** Prisoner modifiers for a rarity. */
export function prisonerRarityMods(rarity: Rarity) {
  return BALANCE.rarity.prisoner[rarity];
}

/** Guard roll ranges + wage premium for a rarity. */
export function guardRarityMods(rarity: Rarity) {
  return BALANCE.rarity.guard[rarity];
}
