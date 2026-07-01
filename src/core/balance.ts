// ─────────────────────────────────────────────────────────────────────────────
// Balance constants
//
// Every tunable number in the game lives here so designers can re-balance
// without hunting through logic. Keeping these in one object also means the
// tests can reference the exact same source of truth the simulation uses.
// ─────────────────────────────────────────────────────────────────────────────

import type { Severity, WardenTier } from "./types";

export const BALANCE = {
  /** Starting condition for a new game. */
  start: {
    coin: 250,
    food: 40,
    firewood: 40,
    buckets: 6,
    cellCapacity: 6,
    reputation: 20,
    guards: 1,
  },

  /** Daily upkeep per living prisoner. */
  upkeep: {
    foodPerPrisoner: 1,
    /** Firewood is burned per occupied cell for warmth. */
    firewoodPerPrisoner: 0.5,
    /** Inmates served per sanitation bucket before disease pressure climbs. */
    prisonersPerBucket: 2,
  },

  /** Government pay per prisoner per day, by severity, before reputation scaling. */
  payout: {
    petty: 6,
    violent: 14,
    political: 30,
    noble: 55,
  } as Record<Severity, number>,

  /** How much each severity contributes to baseline unrest each day. */
  unrestPressure: {
    petty: 1,
    violent: 4,
    political: 6,
    noble: 3,
  } as Record<Severity, number>,

  /** Resource shop prices (coin per unit) when buying. */
  prices: {
    food: 2,
    firewood: 2,
    buckets: 10,
  },

  guards: {
    hireCost: 60,
    baseWage: 8,
    /** Each point of average guard skill suppresses this much unrest per prisoner. */
    skillSuppression: 0.06,
    /** Each unit of brutality suppresses this much unrest but adds death risk. */
    brutalitySuppression: 0.12,
    fatigueRecovery: 12,
    fatiguePerEvent: 20,
  },

  upgrade: {
    /** Coin to add capacity; scales with current capacity. */
    capacityCostPerCell: 45,
    capacityStep: 2,
  },

  /** Labor production per assigned prisoner per day, and the unrest/injury it adds. */
  labor: {
    woodcutting: { resource: "firewood" as const, yield: 4, unrest: 2, injuryRisk: 0.04 },
    kitchen: { resource: "food" as const, yield: 4, unrest: 1, injuryRisk: 0.01 },
    latrine: { resource: "buckets" as const, yield: 1, unrest: 3, injuryRisk: 0.02 },
    smithy: { resource: "coin" as const, yield: 7, unrest: 3, injuryRisk: 0.05 },
  },

  /** Event probability model. Base chance modified by current state. */
  events: {
    riot: { unrestThreshold: 50, perUnrestOver: 0.012, maxChance: 0.85 },
    fire: { baseChance: 0.04, perFirewoodOver50: 0.0009 },
    disease: { perSanitationDebt: 0.05, maxChance: 0.8 },
    escape: { perUnrestOver40: 0.006, perEmptyGuardSlot: 0.05 },
    inspection: { baseChance: 0.05 },
    bribe: { baseChance: 0.06 },
  },

  reputation: {
    /** Reputation gained per prisoner successfully released at end of sentence. */
    perRelease: 2,
    /** Reputation lost per in-house death. */
    perDeath: 4,
    /** Reputation lost per successful escape. */
    perEscape: 8,
    /** Small daily drift toward stability when nothing bad happens. */
    calmDayGain: 0.5,
    min: 0,
    max: 100,
  },

  /** Reputation needed to reach each tier; higher tiers unlock richer intake. */
  tiers: {
    village: 0,
    town: 30,
    city: 55,
    crown: 80,
  } as Record<WardenTier, number>,

  /** Which severities the government will send you at each tier. */
  tierIntake: {
    village: ["petty", "petty", "violent"],
    town: ["petty", "violent", "violent", "political"],
    city: ["violent", "political", "political", "noble"],
    crown: ["political", "noble", "noble"],
  } as Record<WardenTier, Severity[]>,

  intake: {
    /** Max pending offers generated per day. */
    offersPerDay: 2,
    /** Signing bounty as a multiple of daily payout. */
    bountyMultiplier: 1.5,
  },

  sentence: {
    /** Sentence length range (days) by severity. */
    petty: [4, 8],
    violent: [8, 16],
    political: [14, 26],
    noble: [20, 40],
  } as Record<Severity, [number, number]>,
} as const;
