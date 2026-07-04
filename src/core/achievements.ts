// ─────────────────────────────────────────────────────────────────────────────
// Achievements — earned through play, several unlocking warden classes
//
// The evaluator is pure: given the current run state it returns every
// achievement whose condition holds RIGHT NOW. The UI layer owns persistence
// (a profile that outlives individual runs) and diffs against what's already
// unlocked. Nothing here is ever purchasable.
// ─────────────────────────────────────────────────────────────────────────────

import { rarityRank } from "./rarity";
import type { GameState } from "./types";

export interface AchievementDef {
  id: string;
  title: string;
  text: string;
  /** Crowns (meta-currency of glory) awarded when this deed is first done. */
  crowns: number;
  /** True when the condition holds for this state snapshot. */
  check(state: GameState): boolean;
  /** Warden class this achievement unlocks, if any. */
  unlocksWarden?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "longReign",
    crowns: 15,
    title: "Long Reign",
    text: "Rule the keep for 50 days in a single run.",
    check: (s) => s.day >= 50,
    unlocksWarden: "veteran",
  },
  {
    id: "goldenLedger",
    crowns: 15,
    title: "Golden Ledger",
    text: "Take in 2,000 coin over a single reign.",
    check: (s) => s.stats.totalCoinEarned >= 2000,
    unlocksWarden: "merchant",
  },
  {
    id: "liberator",
    crowns: 15,
    title: "The Liberator",
    text: "See 15 prisoners walk free in one reign.",
    check: (s) => s.stats.totalReleased >= 15,
    unlocksWarden: "reformer",
  },
  {
    id: "saintly",
    crowns: 15,
    title: "Saintly",
    text: "Reach the standing of Saint.",
    check: (s) => s.morality >= 66,
    unlocksWarden: "confessor",
  },
  {
    id: "feared",
    crowns: 15,
    title: "Feared",
    text: "Reach the standing of Tyrant.",
    check: (s) => s.morality <= -66,
    unlocksWarden: "butcher",
  },
  {
    id: "mythKeeper",
    crowns: 20,
    title: "Myth-Keeper",
    text: "Hold a mythic prisoner in your cells.",
    check: (s) => s.stats.bestRarityRank >= rarityRank("mythic"),
    unlocksWarden: "gambler",
  },
  {
    id: "crownKeeper",
    crowns: 25,
    title: "Keeper of the Crown",
    text: "Win a reign — hold the crown's trust for 30 days.",
    check: (s) => !!s.gameWon,
  },
  {
    id: "ironVictory",
    crowns: 20,
    title: "Iron Victory",
    text: "Win a reign as a Tyrant.",
    check: (s) => !!s.gameWon && s.morality <= -33,
  },
  {
    id: "gentleVictory",
    crowns: 20,
    title: "Gentle Victory",
    text: "Win a reign as a Saint.",
    check: (s) => !!s.gameWon && s.morality >= 33,
  },
  {
    id: "stormWeathered",
    crowns: 10,
    title: "Storm-Weathered",
    text: "Face 3 riots in a single reign and still stand.",
    check: (s) => s.stats.riotsFaced >= 3 && !s.gameOver,
  },
  {
    id: "fullHouse",
    crowns: 10,
    title: "Full House",
    text: "Hold 12 prisoners at once.",
    check: (s) => s.prisoners.filter((p) => p.alive).length >= 12,
  },
  {
    id: "architect",
    crowns: 15,
    title: "The Architect",
    text: "Raise all four keep buildings in one reign.",
    check: (s) =>
      s.buildings.infirmary && s.buildings.chapel && s.buildings.gallows && s.buildings.walls,
  },
];

/** Ids of achievements whose conditions hold for this state snapshot. */
export function evaluateAchievements(state: GameState): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(state)).map((a) => a.id);
}

/** Warden classes unlocked by a set of achievement ids ("steward" is free). */
export function unlockedWardens(achievementIds: readonly string[]): string[] {
  const set = new Set(achievementIds);
  const unlocked = ["steward"];
  for (const a of ACHIEVEMENTS) {
    if (a.unlocksWarden && set.has(a.id)) unlocked.push(a.unlocksWarden);
  }
  return unlocked;
}
