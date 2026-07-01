// ─────────────────────────────────────────────────────────────────────────────
// The day tick — the core game loop
//
// advanceDay() is the spine of the whole game. It runs a fixed, ordered sequence
// of systems (income → labour → upkeep → unrest → events → deaths → release →
// intake) and is completely deterministic given the state's rngState. Everything
// the UI shows is a consequence of this function.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import { resolveEvents } from "./events";
import { createOffer, tierForReputation } from "./factory";
import { Rng } from "./rng";
import {
  averageBrutality,
  effectiveGuardSkill,
  evaluateGameOver,
  livingPrisoners,
  pushLog,
} from "./state";
import type { GameState, Prisoner, Severity } from "./types";
import { clamp, round1 } from "./util";

const R = BALANCE.reputation;

/** Apply reputation change and keep it inside [min,max]. */
function adjustReputation(state: GameState, delta: number): void {
  state.reputation = clamp(state.reputation + delta, R.min, R.max);
}

/** Government income: paid per living prisoner per day. */
function collectIncome(state: GameState): number {
  const income = state.prisoners
    .filter((p) => p.alive)
    .reduce((sum, p) => sum + p.dailyPayout, 0);
  state.resources.coin += income;
  return income;
}

/** Pay the warders. Unpaid guards quit and stir up the cells. */
function payWages(state: GameState): void {
  const wages = state.guards.reduce((sum, g) => sum + g.wage, 0);
  if (state.resources.coin >= wages) {
    state.resources.coin -= wages;
    return;
  }
  // Can't make payroll: the lowest-skill guard walks off the job.
  state.resources.coin = Math.max(0, state.resources.coin - wages);
  if (state.guards.length > 0) {
    state.guards.sort((a, b) => a.skill - b.skill);
    const quitter = state.guards.shift()!;
    pushLog(state, `${quitter.name} quits over unpaid wages.`, "bad");
    for (const p of state.prisoners) {
      if (p.alive) p.unrest = clamp(p.unrest + 6, 0, 100);
    }
  }
}

/** Conscripted labour produces resources, but costs unrest and risks injury. */
function runLabor(state: GameState, rng: Rng): void {
  for (const p of state.prisoners) {
    if (!p.alive || p.assignment === "none") continue;
    const job = BALANCE.labor[p.assignment];
    // Output scales with the worker's health.
    const efficiency = 0.5 + (p.health / 100) * 0.5;
    const produced = job.yield * efficiency;
    state.resources[job.resource] = round1(
      state.resources[job.resource] + produced,
    );
    p.unrest = clamp(p.unrest + job.unrest, 0, 100);
    if (rng.chance(job.injuryRisk)) {
      const hurt = rng.int(10, 30);
      p.health = clamp(p.health - hurt, 0, 100);
      pushLog(state, `${p.name} is injured at the ${p.assignment}.`, "bad");
    }
  }
}

/** Feed the prisoners. Shortfall starves them. */
function consumeFood(state: GameState): void {
  const living = state.prisoners.filter((p) => p.alive);
  const need = living.length * BALANCE.upkeep.foodPerPrisoner;
  if (state.resources.food >= need) {
    state.resources.food = round1(state.resources.food - need);
    return;
  }
  // Ration what's left; the unfed starve.
  const fed = Math.floor(state.resources.food / BALANCE.upkeep.foodPerPrisoner);
  state.resources.food = 0;
  for (let i = fed; i < living.length; i++) {
    living[i].health = clamp(living[i].health - 18, 0, 100);
    living[i].unrest = clamp(living[i].unrest + 10, 0, 100);
  }
  if (fed < living.length) {
    pushLog(state, `Food runs short — ${living.length - fed} go hungry.`, "bad");
  }
}

/** Burn firewood for warmth. Shortfall chills the cells. */
function consumeFirewood(state: GameState): void {
  const living = state.prisoners.filter((p) => p.alive);
  const need = round1(living.length * BALANCE.upkeep.firewoodPerPrisoner);
  if (state.resources.firewood >= need) {
    state.resources.firewood = round1(state.resources.firewood - need);
    return;
  }
  state.resources.firewood = 0;
  for (const p of living) {
    p.health = clamp(p.health - 8, 0, 100);
    p.unrest = clamp(p.unrest + 5, 0, 100);
  }
  if (living.length > 0) {
    pushLog(state, "The fires die — a cold, bitter night in the cells.", "bad");
  }
}

/** Daily unrest drift from crowding, severity, and guard suppression. */
function updateUnrest(state: GameState): void {
  const living = livingPrisoners(state);
  const overcrowd = Math.max(0, living - state.cellCapacity);
  const skill = effectiveGuardSkill(state);
  const brutality = averageBrutality(state);
  const suppression =
    skill * BALANCE.guards.skillSuppression +
    brutality * BALANCE.guards.brutalitySuppression;

  for (const p of state.prisoners) {
    if (!p.alive) continue;
    let delta = BALANCE.unrestPressure[p.severity];
    delta += overcrowd * 1.5; // crowded keeps simmer
    delta -= suppression;
    p.unrest = clamp(p.unrest + delta, 0, 100);
  }

  // Guards recover stamina on a normal day.
  for (const g of state.guards) {
    g.fatigue = clamp(g.fatigue - BALANCE.guards.fatigueRecovery, 0, 100);
  }
}

/**
 * Brutal warders keep order through fear, but the brutal hand sometimes kills.
 * Returns the number of prisoners beaten to death this day.
 */
function brutalityCasualties(state: GameState, rng: Rng): number {
  const brutality = averageBrutality(state);
  if (brutality <= 0) return 0;
  let deaths = 0;
  for (const p of state.prisoners) {
    if (!p.alive) continue;
    // High-unrest inmates draw the warders' clubs.
    if (p.unrest > 60 && rng.chance((brutality / 100) * 0.05)) {
      p.alive = false;
      deaths++;
      pushLog(state, `${p.name} dies under the warders' discipline.`, "bad");
    }
  }
  return deaths;
}

/** Resolve prisoners whose health hit zero (starvation, cold, labour). */
function resolveHealthDeaths(state: GameState): number {
  let deaths = 0;
  for (const p of state.prisoners) {
    if (p.alive && p.health <= 0) {
      p.alive = false;
      deaths++;
      pushLog(state, `${p.name} dies in the cells.`, "bad");
    }
  }
  return deaths;
}

/** Release prisoners who have served their sentence. */
function releaseServed(state: GameState): number {
  let released = 0;
  for (const p of state.prisoners) {
    if (p.alive && p.sentenceDays <= 0) {
      p.alive = false; // leaves the keep
      released++;
      adjustReputation(state, R.perRelease);
      pushLog(state, `${p.name} has served their sentence and is freed.`, "good");
    }
  }
  return released;
}

/** Generate new government intake offers based on the current tier. */
function generateOffers(state: GameState, rng: Rng): void {
  state.offers = [];
  const pool = BALANCE.tierIntake[state.tier];
  for (let i = 0; i < BALANCE.intake.offersPerDay; i++) {
    const severity = (rng.pick(pool) ?? "petty") as Severity;
    state.offers.push(createOffer(state, rng, severity));
  }
}

/** Remove dead/released/escaped inmates from the active roster. */
function sweepRoster(state: GameState): void {
  state.prisoners = state.prisoners.filter((p) => p.alive);
}

/** Tick sentences/age for everyone still held. */
function ageRoster(state: GameState): void {
  for (const p of state.prisoners) {
    if (!p.alive) continue;
    p.daysHeld += 1;
    p.sentenceDays -= 1;
  }
}

/**
 * Advance the simulation by one full day. Mutates and returns the same state
 * object. A no-op while the game is over or an unresolved decision is pending
 * (the warden must answer the riot/bribe first).
 */
export function advanceDay(state: GameState): GameState {
  if (state.gameOver || state.pendingDecision) return state;

  const rng = new Rng(state.rngState);
  state.lastEvents = [];

  const income = collectIncome(state);
  payWages(state);
  runLabor(state, rng);
  consumeFood(state);
  consumeFirewood(state);
  updateUnrest(state);

  const preDeaths =
    resolveHealthDeaths(state) + brutalityCasualties(state, rng);
  if (preDeaths > 0) adjustReputation(state, -preDeaths * R.perDeath);

  const { events, decision } = resolveEvents(state, rng);
  state.lastEvents = events;
  if (decision) state.pendingDecision = decision;

  const released = releaseServed(state);

  // A genuinely calm day (no deaths, no bad events, no looming decision) slowly
  // rebuilds trust.
  const anyDeaths = preDeaths > 0 || events.some((e) => e.deaths > 0);
  const anyBad =
    !!decision || events.some((e) => e.kind === "fire" || e.kind === "escape");
  if (!anyDeaths && !anyBad) {
    adjustReputation(state, R.calmDayGain);
  }

  // Clamp reputation after the event pass (events adjust it raw).
  state.reputation = clamp(state.reputation, R.min, R.max);

  sweepRoster(state);
  ageRoster(state);

  state.tier = tierForReputation(state.reputation);
  generateOffers(state, rng);

  state.day += 1;
  state.rngState = rng.state;

  pushLog(
    state,
    `Day ${state.day - 1} closes. +${income} coin earned${
      released ? `, ${released} freed` : ""
    }.`,
    anyDeaths ? "bad" : "neutral",
  );

  evaluateGameOver(state);
  return state;
}

/** Exposed for tests and UI: the current loss-condition snapshot. */
export function summarize(state: GameState): {
  living: number;
  capacity: number;
  dailyIncome: number;
  dailyWages: number;
} {
  const living = state.prisoners.filter((p) => p.alive);
  return {
    living: living.length,
    capacity: state.cellCapacity,
    dailyIncome: living.reduce((s: number, p: Prisoner) => s + p.dailyPayout, 0),
    dailyWages: state.guards.reduce((s, g) => s + g.wage, 0),
  };
}
