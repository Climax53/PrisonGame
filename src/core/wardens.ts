// ─────────────────────────────────────────────────────────────────────────────
// Playable wardens — who you are changes how the keep answers you
//
// Research: player-selectable identity/pacing (RimWorld storytellers, Reigns
// replay variety) is a top-loved mechanic. Each warden is a bundle of pure rule
// modifiers consulted at the systems' existing touch points — no special-case
// branches scattered through the simulation. All are earned through play
// (achievement unlocks in achievements.ts); nothing is ever sold.
// ─────────────────────────────────────────────────────────────────────────────

import type { GameState, WardenClass } from "./types";

export interface WardenMods {
  /** Market buy prices (food/wood/buckets/buildings/capacity). */
  priceMult: number;
  /** Guard hire cost and daily wages. */
  wageMult: number;
  /** Prisoner daily payout at intake. */
  intakePayMult: number;
  /** Accept-bounty multiplier. */
  bountyMult: number;
  /** All positive reputation gains. */
  repGainMult: number;
  /** Reputation for releases specifically (stacks with repGainMult). */
  releaseRepMult: number;
  /** Conscripted labour output. */
  laborMult: number;
  /** Reputation cost of deaths (stacks with morality's butcher effect). */
  deathRepMult: number;
  /** Riot-crush toll multiplier (fewer die under a practiced hand). */
  crushTollMult: number;
  /** Rarity is rolled as if this many tiers higher (capped at crown). */
  rarityTierShift: number;
  /** Multiplier on danger chances (riot/fire/disease/escape). */
  dangerMult: number;
  /** Multiplier on opportunity events (inspection/bribe/story/legend). */
  opportunityMult: number;
  /** Starting adjustments. */
  startMorality: number;
  startBonusGuards: number;
}

const BASE: WardenMods = {
  priceMult: 1,
  wageMult: 1,
  intakePayMult: 1,
  bountyMult: 1,
  repGainMult: 1,
  releaseRepMult: 1,
  laborMult: 1,
  deathRepMult: 1,
  crushTollMult: 1,
  rarityTierShift: 0,
  dangerMult: 1,
  opportunityMult: 1,
  startMorality: 0,
  startBonusGuards: 0,
};

export interface WardenDef {
  id: WardenClass;
  name: string;
  epithet: string;
  /** One-line fantasy shown on the select screen. */
  blurb: string;
  /** Honest mechanical summary (pros first, cons after the em-dash). */
  effects: string;
  /** Achievement id that unlocks this warden (undefined = always available). */
  unlockedBy?: string;
  mods: Partial<WardenMods>;
  /** Select-screen glyph (replaced by portraits per the art spec). */
  glyph: string;
}

export const WARDENS: WardenDef[] = [
  {
    id: "steward",
    name: "The Steward",
    epithet: "an honest start",
    blurb: "Appointed for competence, kept for convenience. No talents, no burdens.",
    effects: "Balanced — the baseline warden.",
    mods: {},
    glyph: "🗝",
  },
  {
    id: "veteran",
    name: "The Veteran",
    epithet: "old soldier, older scars",
    blurb: "The garrison respects you; the treasury less so.",
    effects: "+1 free starting guard, guards cost 20% less — intake pays 10% less.",
    unlockedBy: "longReign",
    mods: { startBonusGuards: 1, wageMult: 0.8, intakePayMult: 0.9 },
    glyph: "🛡",
  },
  {
    id: "confessor",
    name: "The Confessor",
    epithet: "mercy as doctrine",
    blurb: "You believe every soul in these cells can still be saved.",
    effects: "Begins well toward Saint, reputation gains +15% — the kind path's costs apply from day one.",
    unlockedBy: "saintly",
    mods: { startMorality: 30, repGainMult: 1.15 },
    glyph: "🕊",
  },
  {
    id: "butcher",
    name: "The Butcher",
    epithet: "order, whatever it costs",
    blurb: "They whisper your name to frighten prisoners in other counties.",
    effects: "Begins well toward Tyrant, crushing riots kills 30% fewer — every death stains your name 30% more.",
    unlockedBy: "feared",
    mods: { startMorality: -30, crushTollMult: 0.7, deathRepMult: 1.3 },
    glyph: "☠",
  },
  {
    id: "merchant",
    name: "The Merchant",
    epithet: "everything has a price",
    blurb: "You bought this post. You intend to profit from it.",
    effects: "Market 20% cheaper, bounties +30%, intake pays +10% — reputation gains 20% slower.",
    unlockedBy: "goldenLedger",
    mods: { priceMult: 0.8, bountyMult: 1.3, intakePayMult: 1.1, repGainMult: 0.8 },
    glyph: "🪙",
  },
  {
    id: "reformer",
    name: "The Reformer",
    epithet: "the sentence ends; the person remains",
    blurb: "Every release is a small victory over the gallows-minded.",
    effects: "Releases earn double reputation — conscripted labour yields 15% less.",
    unlockedBy: "liberator",
    mods: { releaseRepMult: 2, laborMult: 0.85 },
    glyph: "📜",
  },
  {
    id: "gambler",
    name: "The Gambler",
    epithet: "fortune favors the reckless",
    blurb: "Why hold petty thieves when the realm has legends to lose?",
    effects: "Rarity rolls one tier richer, opportunities knock 30% more — dangers run 20% hotter.",
    unlockedBy: "mythKeeper",
    mods: { rarityTierShift: 1, opportunityMult: 1.3, dangerMult: 1.2 },
    glyph: "🎲",
  },
];

export function wardenDef(id: WardenClass): WardenDef {
  return WARDENS.find((w) => w.id === id) ?? WARDENS[0];
}

/** The full modifier bundle for the state's warden (defaults filled). */
export function wardenMods(state: GameState): WardenMods {
  return { ...BASE, ...wardenDef(state.warden).mods };
}
