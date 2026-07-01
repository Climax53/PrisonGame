// ─────────────────────────────────────────────────────────────────────────────
// Morality — the warden's soul
//
// One scalar in [−100, +100] that the player never sets directly; it drifts from
// how they treat inmates. It is deliberately two-sided: neither extreme is
// strictly better. Cruelty (negative) fears the cells into order and hard work
// but makes cornered riots deadlier and stains reputation on every death;
// kindness (positive) wins public love and calms riots but breeds disrespect,
// idleness, and escape attempts.
//
// Every effect is expressed as a pure multiplier over `moralityFactor` so the
// coupling is legible and unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import type { GameState } from "./types";
import { clamp } from "./util";

const M = BALANCE.morality;

/** moralityFactor ∈ [−1, +1]. Negative = cruel, positive = kind. */
export function moralityFactor(state: GameState): number {
  return clamp(state.morality, M.min, M.max) / 100;
}

/** The player-facing standing label (Saint … Tyrant). */
export function moralityStanding(morality: number): string {
  for (const s of M.standings) {
    if (morality >= s.at) return s.label;
  }
  return M.standings[M.standings.length - 1].label;
}

/** Shift morality by `delta`, clamped. */
export function adjustMorality(state: GameState, delta: number): void {
  state.morality = clamp(state.morality + delta, M.min, M.max);
}

// ── Effect multipliers (all pure) ────────────────────────────────────────────

/** Added to each inmate's daily unrest: +kind (disrespect) / −cruel (fear). */
export function unrestDrift(state: GameState): number {
  return moralityFactor(state) * M.unrestSwing;
}

/** Labour output multiplier: cruel drives harder, kind lets them slack. */
export function laborMultiplier(state: GameState): number {
  return clamp(1 - moralityFactor(state) * M.laborSwing, 0.5, 1.5);
}

/** Escape-attempt multiplier: kind emboldens, cruel terrifies. */
export function escapeMultiplier(state: GameState): number {
  return clamp(1 + moralityFactor(state) * M.escapeSwing, 0.4, 1.8);
}

/** Riot deadliness multiplier: a cruel warden's inmates fight harder when cornered. */
export function riotDeadlinessMultiplier(state: GameState): number {
  return clamp(1 - moralityFactor(state) * M.riotDeadlinessSwing, 0.6, 1.4);
}

/** Death-reputation-penalty multiplier: cruelty makes you a butcher, kindness softens the blow. */
export function deathReputationMultiplier(state: GameState): number {
  return clamp(1 - moralityFactor(state) * M.deathRepSwing, 0.5, 1.6);
}

/** Reputation-gain multiplier: a kind warden is beloved; a cruel one distrusted. */
export function repGainMultiplier(state: GameState): number {
  return clamp(1 + moralityFactor(state) * M.repGainSwing, 0.5, 1.6);
}
