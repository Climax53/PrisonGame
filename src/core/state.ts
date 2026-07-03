// New-game construction and tiny pure helpers over GameState.

import { BALANCE } from "./balance";
import { createGuard, createPrisoner, tierForReputation } from "./factory";
import { randomHeraldry, randomKeepName, randomWardenName } from "./identity";
import { Rng } from "./rng";
import { wardenDef, wardenMods } from "./wardens";
import type {
  GameState,
  Heraldry,
  LogEntry,
  Pacing,
  Prisoner,
  RunStats,
  WardenClass,
} from "./types";

/** Optional new-game setup (all default sensibly for tests/quick starts). */
export interface NewGameOptions {
  warden?: WardenClass;
  wardenName?: string;
  keepName?: string;
  heraldry?: Heraldry;
  pacing?: Pacing;
  /** ISO date when this run is a daily challenge. */
  dailyChallenge?: string;
}

/** A zeroed statistics block for a fresh run (also used by save repair). */
export function emptyStats(): RunStats {
  return {
    totalDeaths: 0,
    totalEscapes: 0,
    totalReleased: 0,
    totalCoinEarned: 0,
    riotsFaced: 0,
    decisionsMade: 0,
    bestRarityRank: 0,
    peakReputation: 0,
  };
}

/**
 * Build a fresh game from a seed. The seed makes the whole playthrough
 * reproducible, which is what the test-suite leans on. The Phaser layer passes
 * a time-derived seed at the boundary (outside the core) for variety.
 */
export function createInitialState(seed: number, options: NewGameOptions = {}): GameState {
  const warden = options.warden ?? "steward";
  const s: GameState = {
    day: 1,
    hour: BALANCE.time.dayStartHour,
    tier: "village",
    reputation: BALANCE.start.reputation,
    morality: 0,
    resources: {
      coin: BALANCE.start.coin,
      food: BALANCE.start.food,
      firewood: BALANCE.start.firewood,
      buckets: BALANCE.start.buckets,
    },
    prisoners: [],
    guards: [],
    cellCapacity: BALANCE.start.cellCapacity,
    offers: [],
    log: [],
    lastEvents: [],
    rngState: seed | 0,
    gameOver: false,
    crownDays: 0,
    winterDaysLeft: 0,
    stats: emptyStats(),
    warden,
    wardenName: "",
    keepName: "",
    heraldry: { color: 0, sigil: "🗝" },
    pacing: options.pacing ?? "steady",
    buildings: {
      infirmary: false,
      chapel: false,
      gallows: false,
      walls: false,
      barracks: false,
      tavern: false,
    },
    legendsSeen: [],
    dailyChallenge: options.dailyChallenge,
    idCounter: 0,
  };

  const rng = new Rng(s.rngState);

  // Identity: player-chosen or rolled from the seed.
  s.wardenName = options.wardenName || randomWardenName(rng);
  s.keepName = options.keepName || randomKeepName(rng);
  s.heraldry = options.heraldry ?? randomHeraldry(rng);

  // The warden's nature shapes the starting position.
  const mods = wardenMods(s);
  s.morality = mods.startMorality;

  // Seed the keep with warders and two starter petty criminals.
  for (let i = 0; i < BALANCE.start.guards + mods.startBonusGuards; i++) {
    s.guards.push(createGuard(s, rng));
  }
  s.prisoners.push(createPrisoner(s, rng, "petty"));
  s.prisoners.push(createPrisoner(s, rng, "petty"));
  assignCells(s);

  s.rngState = rng.state;
  s.tier = tierForReputation(s.reputation);
  pushLog(
    s,
    `${s.wardenName}, ${wardenDef(warden).name}, takes command of ${s.keepName}. Keep order. Get paid.`,
    "neutral",
  );
  return s;
}

/** Append a log line, trimming history so saves stay small. */
export function pushLog(state: GameState, text: string, tone: LogEntry["tone"]): void {
  state.log.push({ day: state.day, text, tone });
  const MAX = 200;
  if (state.log.length > MAX) {
    state.log.splice(0, state.log.length - MAX);
  }
}

export function livingPrisoners(state: GameState): number {
  return state.prisoners.filter((p) => p.alive).length;
}

/** Average unrest across living prisoners (0 if empty). */
export function averageUnrest(state: GameState): number {
  const living = state.prisoners.filter((p) => p.alive);
  if (living.length === 0) return 0;
  return living.reduce((s, p) => s + p.unrest, 0) / living.length;
}

/**
 * Set the loss flags if a terminal condition is met. Shared by the daily tick
 * and the decision system (a bad choice can end the game outright). Lives here,
 * not in simulation.ts, to avoid an import cycle with decisions.ts.
 */
export function evaluateGameOver(state: GameState): void {
  // Once a run has concluded (including victory), its ending is final.
  if (state.gameOver) return;
  if (state.reputation <= BALANCE.reputation.min) {
    state.gameOver = true;
    state.endingId = "disgraced";
    state.gameOverReason =
      "Your reputation has collapsed. The magistrate strips you of the keep.";
  } else if (state.resources.coin <= -100) {
    state.gameOver = true;
    state.endingId = "bankrupt";
    state.gameOverReason = "Bankrupt. Your creditors seize the keep.";
  }
  // A fallen keep has no decisions left to make — don't let a dead modal
  // linger in the save.
  if (state.gameOver) state.pendingDecision = undefined;
}

/**
 * Assign every living, unhoused prisoner to the lowest free cell number.
 * Stable: prisoners keep their cell across days; freed cells are reused.
 * Overcrowded keeps spill past cellCapacity (the UI shows those in "the yard").
 */
export function assignCells(state: GameState): void {
  const used = new Set<number>();
  for (const p of state.prisoners) {
    if (p.alive && typeof p.cell === "number" && !used.has(p.cell)) {
      used.add(p.cell);
    } else if (p.alive) {
      p.cell = undefined;
    }
  }
  for (const p of state.prisoners) {
    if (!p.alive || typeof p.cell === "number") continue;
    let i = 0;
    while (used.has(i)) i++;
    p.cell = i;
    used.add(i);
  }
}

/** Average guard skill, accounting for fatigue AND morale. 0 if no guards.
 * A miserable corps (morale 0) works at 60% of its rested best. */
export function effectiveGuardSkill(state: GameState): number {
  if (state.guards.length === 0) return 0;
  const total = state.guards.reduce(
    (sum, g) => sum + g.skill * (1 - g.fatigue / 200) * (0.6 + 0.4 * (g.morale / 100)),
    0,
  );
  return total / state.guards.length;
}

/** Average guard brutality. 0 if no guards. */
export function averageBrutality(state: GameState): number {
  if (state.guards.length === 0) return 0;
  return state.guards.reduce((sum, g) => sum + g.brutality, 0) / state.guards.length;
}

/**
 * Kill up to `count` living prisoners, preferring the most unhealthy/unrestful
 * (with a little noise). Shared by the event and decision systems so death
 * always selects victims the same way. Returns the victims.
 */
export function killWeakestPrisoners(
  state: GameState,
  count: number,
  rng: Rng,
): Prisoner[] {
  const living = state.prisoners.filter((p) => p.alive);
  // Score each prisoner ONCE (unrest-heavy, health-protective, small noise),
  // then sort by the precomputed score. Drawing RNG inside a sort comparator
  // would both violate the comparator contract and consume an engine-dependent
  // number of draws — silently breaking cross-device determinism.
  const score = new Map<string, number>();
  for (const p of living) {
    score.set(p.id, p.unrest - p.health + rng.range(-10, 10));
  }
  living.sort((a, b) => score.get(b.id)! - score.get(a.id)!);
  const victims = living.slice(0, Math.max(0, Math.min(count, living.length)));
  for (const v of victims) v.alive = false;
  state.stats.totalDeaths += victims.length;
  return victims;
}
