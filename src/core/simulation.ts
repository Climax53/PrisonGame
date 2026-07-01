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
import {
  adjustMorality,
  deathReputationMultiplier,
  laborMultiplier,
  repGainMultiplier,
  unrestDrift,
} from "./morality";
import { prisonerRarityMods, rarityRank } from "./rarity";
import { checkVictory } from "./endings";
import { dueLegendBeat, maybeBrandLegend } from "./legends";
import { wardenMods } from "./wardens";
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
const MOR = BALANCE.morality;

/** Apply reputation change and keep it inside [min,max]. Positive gains are
 * scaled by the warden's nature (the Merchant is trusted slowly, etc.). */
function adjustReputation(state: GameState, delta: number): void {
  const scaled = delta > 0 ? delta * wardenMods(state).repGainMult : delta;
  state.reputation = clamp(state.reputation + scaled, R.min, R.max);
}

/** Government income: paid per living prisoner per day. */
function collectIncome(state: GameState): number {
  const income = state.prisoners
    .filter((p) => p.alive)
    .reduce((sum, p) => sum + p.dailyPayout, 0);
  state.resources.coin += income;
  state.stats.totalCoinEarned += income;
  return income;
}

/** Pay the warders. Unpaid guards quit and stir up the cells. */
function payWages(state: GameState): void {
  const wages = state.guards.reduce((sum, g) => sum + g.wage, 0);
  if (state.resources.coin >= wages) {
    state.resources.coin -= wages;
    return;
  }
  // Can't make payroll: spend whatever positive coin remains (never let a
  // failed payday erase existing debt), and the lowest-skill guard walks.
  const affordable = Math.max(0, Math.min(state.resources.coin, wages));
  state.resources.coin -= affordable;
  if (state.guards.length > 0) {
    // Find the quitter without reordering the roster the player sees.
    let idx = 0;
    for (let i = 1; i < state.guards.length; i++) {
      if (state.guards[i].skill < state.guards[idx].skill) idx = i;
    }
    const [quitter] = state.guards.splice(idx, 1);
    pushLog(state, `${quitter.name} quits over unpaid wages.`, "bad");
    for (const p of state.prisoners) {
      if (p.alive) p.unrest = clamp(p.unrest + 6, 0, 100);
    }
  }
}

/** Conscripted labour produces resources, but costs unrest and risks injury. */
function runLabor(state: GameState, rng: Rng): void {
  // A cruel warden works inmates harder; a kind one lets them slack — and the
  // warden's own doctrine (Reformer) shapes output too.
  const moraleMult = laborMultiplier(state) * wardenMods(state).laborMult;
  for (const p of state.prisoners) {
    if (!p.alive || p.assignment === "none") continue;
    const job = BALANCE.labor[p.assignment];
    // Output scales with health, the worker's rarity (notorious craftsmen), and
    // how feared/respected the warden is.
    const efficiency = 0.5 + (p.health / 100) * 0.5;
    const produced =
      job.yield * efficiency * prisonerRarityMods(p.rarity).laborMult * moraleMult;
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
  // A harsh winter doubles the wood the keep must burn.
  const winterMult = state.winterDaysLeft > 0 ? 2 : 1;
  const need = round1(living.length * BALANCE.upkeep.firewoodPerPrisoner * winterMult);
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

  // Morality shifts baseline mood for everyone: fear (cruel) calms, disrespect
  // (kind) agitates.
  const moraleDrift = unrestDrift(state);
  for (const p of state.prisoners) {
    if (!p.alive) continue;
    // Rarer inmates are more volatile.
    let delta = BALANCE.unrestPressure[p.severity] * prisonerRarityMods(p.rarity).unrestMult;
    delta += overcrowd * 1.5; // crowded cells simmer
    delta -= suppression;
    delta += moraleDrift;
    p.unrest = clamp(p.unrest + delta, 0, 100);
  }

  // Guards recover stamina on a normal day.
  for (const g of state.guards) {
    g.fatigue = clamp(g.fatigue - BALANCE.guards.fatigueRecovery, 0, 100);
  }
}

/** Daily effects of the keep's buildings. */
function runBuildings(state: GameState): void {
  const B = BALANCE.buildings;
  for (const p of state.prisoners) {
    if (!p.alive) continue;
    if (state.buildings.infirmary) {
      p.health = clamp(p.health + B.infirmary.healPerDay, 0, 100);
    }
    if (state.buildings.chapel) {
      p.unrest = clamp(p.unrest - B.chapel.unrestPerDay, 0, 100);
    }
    if (state.buildings.gallows) {
      p.unrest = clamp(p.unrest - B.gallows.unrestPerDay, 0, 100);
    }
  }
  // A standing gallows rules by fear — and fear is habit-forming.
  if (state.buildings.gallows) {
    adjustMorality(state, -B.gallows.moralityDriftPerDay);
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
      state.stats.totalDeaths += 1;
      // Beating inmates to death darkens the warden's soul.
      adjustMorality(state, -MOR.perBrutalDeath);
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
      state.stats.totalDeaths += 1;
      // Letting inmates die of neglect is its own kind of cruelty.
      adjustMorality(state, -MOR.perNeglectDeath);
      pushLog(state, `${p.name} dies in the cells.`, "bad");
    }
  }
  return deaths;
}

/** Release prisoners who have served their sentence. */
function releaseServed(state: GameState): number {
  let released = 0;
  const gainMult = repGainMultiplier(state);
  for (const p of state.prisoners) {
    if (p.alive && p.sentenceDays <= 0) {
      p.alive = false; // leaves the keep
      released++;
      state.stats.totalReleased += 1;
      // Freeing a notorious inmate on good terms is a bigger reputation win —
      // and the Reformer has built a career on it.
      const swing = prisonerRarityMods(p.rarity).repSwingMult;
      adjustReputation(
        state,
        R.perRelease * swing * gainMult * wardenMods(state).releaseRepMult,
      );
      adjustMorality(state, MOR.perRelease);
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
    const offer = createOffer(state, rng, severity);
    // A legendary/mythic political or noble arrival may be a named LEGEND with
    // a story arc (at most once each per run).
    maybeBrandLegend(state, rng, offer.prisoner);
    state.offers.push(offer);
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

  runBuildings(state);

  const preDeaths =
    resolveHealthDeaths(state) + brutalityCasualties(state, rng);
  // A cruel warden is judged a butcher; a kind one the benefit of doubt — and
  // some wardens (the Butcher) are judged more harshly still.
  if (preDeaths > 0) {
    adjustReputation(
      state,
      -preDeaths * R.perDeath * deathReputationMultiplier(state) * wardenMods(state).deathRepMult,
    );
  }

  const { events, decision } = resolveEvents(state, rng);
  state.lastEvents = events;
  if (decision) state.pendingDecision = decision;

  // A held legend's story beat claims the day if nothing else did.
  if (!state.pendingDecision) {
    const beat = dueLegendBeat(state);
    if (beat) state.pendingDecision = beat;
  }

  const released = releaseServed(state);

  // A genuinely calm day (no deaths, no bad events, no looming decision) slowly
  // rebuilds trust.
  const anyDeaths = preDeaths > 0 || events.some((e) => e.deaths > 0);
  const anyBad =
    !!decision || events.some((e) => e.kind === "fire" || e.kind === "escape");
  if (!anyDeaths && !anyBad) {
    adjustReputation(state, R.calmDayGain * repGainMultiplier(state));
  }

  // Employing brutal warders slowly hardens the warden's reputation for cruelty.
  const brutalDrift = (averageBrutality(state) / 100) * MOR.brutalStaffDrift;
  if (brutalDrift > 0) adjustMorality(state, -brutalDrift);

  // Clamp reputation after the event pass (events adjust it raw).
  state.reputation = clamp(state.reputation, R.min, R.max);

  sweepRoster(state);
  ageRoster(state);

  // Winter thaws one day at a time.
  if (state.winterDaysLeft > 0) state.winterDaysLeft -= 1;

  // Track reign records for the summary screen.
  state.stats.peakReputation = Math.max(state.stats.peakReputation, state.reputation);
  for (const p of state.prisoners) {
    if (p.alive) {
      state.stats.bestRarityRank = Math.max(state.stats.bestRarityRank, rarityRank(p.rarity));
    }
  }

  state.tier = tierForReputation(state.reputation);
  checkVictory(state);
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
