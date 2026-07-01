// ─────────────────────────────────────────────────────────────────────────────
// Balance constants
//
// Every tunable number in the game lives here so designers can re-balance
// without hunting through logic. Keeping these in one object also means the
// tests can reference the exact same source of truth the simulation uses.
// ─────────────────────────────────────────────────────────────────────────────

import type { Rarity, Severity, WardenTier } from "./types";

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
    winter: { baseChance: 0.03, durationDays: 3 },
    amnesty: { baseChance: 0.02 },
    bard: { baseChance: 0.04 },
    ratPlague: { baseChance: 0.04 },
    /** Chance per day that one eligible story decision fires (if no other decision claimed the day). */
    storyDecision: { baseChance: 0.14 },
  },

  /** Victory condition: hold Crown tier this many consecutive days. */
  victory: {
    crownDaysRequired: 30,
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

  // ── Rarity ─────────────────────────────────────────────────────────────────
  rarity: {
    /**
     * Per-rarity prisoner modifiers.
     * - payoutMult: government pay (rarer inmates are worth far more)
     * - laborMult: conscripted-labour output (notorious craftsmen)
     * - unrestMult: daily unrest pressure (rarer = harder to hold)
     * - escapeMult: escape cunning (harder to recapture)
     * - repSwingMult: reputation impact of their release/escape (a mythic makes headlines)
     */
    prisoner: {
      common: { payoutMult: 1.0, laborMult: 1.0, unrestMult: 1.0, escapeMult: 1.0, repSwingMult: 1.0 },
      uncommon: { payoutMult: 1.35, laborMult: 1.05, unrestMult: 1.1, escapeMult: 1.1, repSwingMult: 1.15 },
      rare: { payoutMult: 1.8, laborMult: 1.1, unrestMult: 1.25, escapeMult: 1.3, repSwingMult: 1.35 },
      epic: { payoutMult: 2.4, laborMult: 1.15, unrestMult: 1.45, escapeMult: 1.6, repSwingMult: 1.6 },
      legendary: { payoutMult: 3.2, laborMult: 1.2, unrestMult: 1.7, escapeMult: 2.0, repSwingMult: 2.0 },
      mythic: { payoutMult: 4.5, laborMult: 1.25, unrestMult: 2.0, escapeMult: 2.5, repSwingMult: 2.6 },
    } as Record<Rarity, {
      payoutMult: number; laborMult: number; unrestMult: number; escapeMult: number; repSwingMult: number;
    }>,

    /** Per-rarity guard roll ranges + wage premium. */
    guard: {
      common: { skill: [20, 45], brutality: [20, 60], wageMult: 1.0 },
      uncommon: { skill: [30, 55], brutality: [20, 58], wageMult: 1.2 },
      rare: { skill: [42, 68], brutality: [15, 55], wageMult: 1.45 },
      epic: { skill: [55, 80], brutality: [15, 50], wageMult: 1.8 },
      legendary: { skill: [68, 90], brutality: [10, 45], wageMult: 2.3 },
      mythic: { skill: [82, 99], brutality: [10, 40], wageMult: 3.0 },
    } as Record<Rarity, { skill: [number, number]; brutality: [number, number]; wageMult: number }>,

    /** Relative roll weights per tier. Rarer inmates/guards appear as you rise. */
    weights: {
      village: { common: 60, uncommon: 28, rare: 10, epic: 2, legendary: 0, mythic: 0 },
      town: { common: 45, uncommon: 30, rare: 18, epic: 6, legendary: 1, mythic: 0 },
      city: { common: 28, uncommon: 30, rare: 24, epic: 13, legendary: 4, mythic: 1 },
      crown: { common: 15, uncommon: 25, rare: 28, epic: 20, legendary: 9, mythic: 3 },
    } as Record<WardenTier, Record<Rarity, number>>,
  },

  // ── Morality ───────────────────────────────────────────────────────────────
  morality: {
    min: -100,
    max: 100,
    /** Standing thresholds (morality ≥ value → label), checked high to low. */
    standings: [
      { at: 66, label: "Saint" },
      { at: 33, label: "Benevolent" },
      { at: 10, label: "Kind" },
      { at: -10, label: "Fair" },
      { at: -33, label: "Stern" },
      { at: -66, label: "Cruel" },
      { at: -100, label: "Tyrant" },
    ] as Array<{ at: number; label: string }>,

    // Effect swings, applied as functions of moralityFactor = morality/100 ∈ [-1,1].
    /** Added to each inmate's daily unrest: +kind (disrespect) / −cruel (fear). */
    unrestSwing: 3,
    /** Labour output ×(1 − factor·swing): cruel works them harder, kind lets them slack. */
    laborSwing: 0.25,
    /** Escape chance ×(1 + factor·swing): kind emboldens, cruel terrifies. */
    escapeSwing: 0.5,
    /** Riot deadliness ×(1 − factor·swing): cornered inmates of a cruel warden fight harder. */
    riotDeadlinessSwing: 0.35,
    /** Death reputation penalty ×(1 − factor·swing): a cruel warden is called a butcher. */
    deathRepSwing: 0.4,
    /** Reputation gains ×(1 + factor·swing): a kind warden is beloved. */
    repGainSwing: 0.4,

    // How choices/treatment move morality (all magnitudes; sign applied at call site).
    perCrush: 6,
    perNegotiate: 4,
    perBrutalDeath: 4,
    perNeglectDeath: 2,
    perRelease: 1,
    perBribeAccept: 2,
    perBribeRefuse: 2,
    perExtort: 4,
    /** Daily drift toward cruelty from employing brutal guards (×avgBrutality/100). */
    brutalStaffDrift: 0.6,
  },
} as const;
