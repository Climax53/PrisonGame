// ─────────────────────────────────────────────────────────────────────────────
// Save serialization + versioned migration
//
// GameState is plain JSON, so persistence is JSON.stringify — but fields get
// ADDED over the game's life, and a player's save from an older build must
// never crash the new build. Every schema change gets a migration step here;
// deserialize() walks a save forward version by version and then runs a
// defensive `repair()` pass that fills any still-missing fields with safe
// defaults. A save should load, or return null — never load corrupted.
// ─────────────────────────────────────────────────────────────────────────────

import { emptyStats } from "./state";
import { RARITY_ORDER, type GameState, type Rarity } from "./types";

/**
 * Bump this whenever GameState (or a nested entity) gains/changes fields, and
 * add a matching case to MIGRATIONS below.
 *
 * v1 — initial release (no morality, no rarity)
 * v2 — adds GameState.morality, Prisoner.rarity, Guard.rarity
 * v3 — adds run-arc fields: stats, crownDays, winterDaysLeft, gameWon, endingId
 */
export const SAVE_VERSION = 3;

export interface SaveBlob {
  version: number;
  state: GameState;
}

/** Each entry upgrades a state FROM that version to the next. */
const MIGRATIONS: Record<number, (s: GameState) => void> = {
  1: (s) => {
    // v1 → v2: morality + rarity did not exist yet.
    s.morality ??= 0;
    for (const p of s.prisoners) p.rarity ??= "common";
    for (const g of s.guards) g.rarity ??= "common";
    for (const o of s.offers ?? []) o.prisoner.rarity ??= "common";
  },
  2: (s) => {
    // v2 → v3: run-arc fields (victory tracking, weather, statistics).
    s.crownDays ??= 0;
    s.winterDaysLeft ??= 0;
    s.stats ??= emptyStats();
  },
};

/**
 * Belt-and-braces pass after migrations: clamp/fill anything that could make
 * the simulation NaN or throw, even if a migration was missed. Cheap insurance
 * against corrupted storage.
 */
function repair(s: GameState): GameState | null {
  if (typeof s !== "object" || s === null) return null;
  if (!Array.isArray(s.prisoners) || !Array.isArray(s.guards)) return null;
  if (typeof s.day !== "number" || typeof s.rngState !== "number") return null;

  if (typeof s.morality !== "number" || Number.isNaN(s.morality)) s.morality = 0;
  if (typeof s.reputation !== "number" || Number.isNaN(s.reputation)) s.reputation = 20;

  const validRarity = (r: unknown): r is Rarity =>
    typeof r === "string" && (RARITY_ORDER as string[]).includes(r);
  for (const p of s.prisoners) {
    if (!validRarity(p.rarity)) p.rarity = "common";
  }
  for (const g of s.guards) {
    if (!validRarity(g.rarity)) g.rarity = "common";
  }
  for (const o of s.offers ?? []) {
    if (!validRarity(o.prisoner.rarity)) o.prisoner.rarity = "common";
  }
  if (typeof s.crownDays !== "number" || Number.isNaN(s.crownDays)) s.crownDays = 0;
  if (typeof s.winterDaysLeft !== "number" || Number.isNaN(s.winterDaysLeft)) {
    s.winterDaysLeft = 0;
  }
  if (typeof s.stats !== "object" || s.stats === null) s.stats = emptyStats();
  return s;
}

export function serialize(state: GameState): string {
  const blob: SaveBlob = { version: SAVE_VERSION, state };
  return JSON.stringify(blob);
}

export function deserialize(json: string): GameState | null {
  try {
    const blob = JSON.parse(json) as SaveBlob;
    if (typeof blob.version !== "number" || blob.version > SAVE_VERSION) {
      return null; // from-the-future or malformed
    }
    let state = blob.state;
    for (let v = blob.version; v < SAVE_VERSION; v++) {
      const step = MIGRATIONS[v];
      if (!step) return null; // no path forward — refuse rather than corrupt
      step(state);
    }
    return repair(state);
  } catch {
    return null;
  }
}
