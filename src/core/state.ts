// New-game construction and tiny pure helpers over GameState.

import { BALANCE } from "./balance";
import { createGuard, createPrisoner, tierForReputation } from "./factory";
import { Rng } from "./rng";
import type { GameState, LogEntry, Prisoner } from "./types";

/**
 * Build a fresh game from a seed. The seed makes the whole playthrough
 * reproducible, which is what the test-suite leans on. The Phaser layer passes
 * a time-derived seed at the boundary (outside the core) for variety.
 */
export function createInitialState(seed: number): GameState {
  const s: GameState = {
    day: 1,
    tier: "village",
    reputation: BALANCE.start.reputation,
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
    idCounter: 0,
  };

  const rng = new Rng(s.rngState);

  // Seed the keep with one guard and two starter petty criminals.
  for (let i = 0; i < BALANCE.start.guards; i++) {
    s.guards.push(createGuard(s, rng));
  }
  s.prisoners.push(createPrisoner(s, rng, "petty"));
  s.prisoners.push(createPrisoner(s, rng, "petty"));

  s.rngState = rng.state;
  s.tier = tierForReputation(s.reputation);
  pushLog(s, "You take command of a village lock-up. Keep order. Get paid.", "neutral");
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

/**
 * Set the loss flags if a terminal condition is met. Shared by the daily tick
 * and the decision system (a bad choice can end the game outright). Lives here,
 * not in simulation.ts, to avoid an import cycle with decisions.ts.
 */
export function evaluateGameOver(state: GameState): void {
  if (state.reputation <= BALANCE.reputation.min) {
    state.gameOver = true;
    state.gameOverReason =
      "Your reputation has collapsed. The magistrate strips you of the keep.";
  } else if (state.resources.coin <= -100) {
    state.gameOver = true;
    state.gameOverReason = "Bankrupt. Your creditors seize the keep.";
  }
}

/** Average guard skill, accounting for fatigue. 0 if no guards. */
export function effectiveGuardSkill(state: GameState): number {
  if (state.guards.length === 0) return 0;
  const total = state.guards.reduce(
    (sum, g) => sum + g.skill * (1 - g.fatigue / 200),
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
  living.sort(
    (a, b) => b.unrest - b.health - (a.unrest - a.health) + rng.range(-10, 10),
  );
  const victims = living.slice(0, Math.max(0, Math.min(count, living.length)));
  for (const v of victims) v.alive = false;
  return victims;
}
