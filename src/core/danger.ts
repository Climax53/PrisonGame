// ─────────────────────────────────────────────────────────────────────────────
// Danger forecast — honest risk telegraphing
//
// These functions compute the *probability* that each crisis fires on the next
// day, from the exact same formulas the event engine rolls against
// (events.ts imports them). That single source of truth is what makes the
// on-screen danger bars trustworthy: what you see is the real chance.
//
// Crucially, they return *probabilities*, not certainties — the dice still roll.
// A high bar can pass quietly; a low bar can still bite. So the player must keep
// making hard calls on the fly rather than reading the future.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import { escapeMultiplier } from "./morality";
import { averageUnrest, livingPrisoners } from "./state";
import type { GameState } from "./types";

const E = BALANCE.events;

/** Probability a riot erupts next day (0 if the cells are calm/empty). */
export function riotChance(state: GameState): number {
  const living = livingPrisoners(state);
  const avg = averageUnrest(state);
  if (living === 0 || avg <= E.riot.unrestThreshold) return 0;
  return Math.min(E.riot.maxChance, (avg - E.riot.unrestThreshold) * E.riot.perUnrestOver);
}

/** Probability of a fire next day — rises the more firewood you hoard past 50. */
export function fireChance(state: GameState): number {
  const firewoodOver = Math.max(0, state.resources.firewood - 50);
  return Math.min(1, E.fire.baseChance + firewoodOver * E.fire.perFirewoodOver50);
}

/** Probability of a disease outbreak next day (driven by sanitation-bucket debt). */
export function diseaseChance(state: GameState): number {
  const capacity = state.resources.buckets * BALANCE.upkeep.prisonersPerBucket;
  const debt = Math.max(0, livingPrisoners(state) - capacity);
  if (debt <= 0) return 0;
  return Math.min(E.disease.maxChance, debt * E.disease.perSanitationDebt);
}

/** Probability an escape is attempted next day (unrest + guard gaps, scaled by morality). */
export function escapeChance(state: GameState): number {
  const avg = averageUnrest(state);
  const unrestOver = Math.max(0, avg - 40);
  const emptySlots = Math.max(0, livingPrisoners(state) / 4 - state.guards.length);
  const base =
    unrestOver * E.escape.perUnrestOver40 + emptySlots * E.escape.perEmptyGuardSlot;
  return Math.min(0.9, base * escapeMultiplier(state));
}

export interface DangerReport {
  riot: number;
  fire: number;
  disease: number;
  escape: number;
}

/** The full next-day risk snapshot, for the UI's danger indicators. */
export function assessDangers(state: GameState): DangerReport {
  return {
    riot: riotChance(state),
    fire: fireChance(state),
    disease: diseaseChance(state),
    escape: escapeChance(state),
  };
}

/** Bucket a probability into a legible level for colour/labelling. */
export function dangerLevel(p: number): "none" | "low" | "medium" | "high" | "critical" {
  if (p <= 0.001) return "none";
  if (p < 0.15) return "low";
  if (p < 0.4) return "medium";
  if (p < 0.65) return "high";
  return "critical";
}
