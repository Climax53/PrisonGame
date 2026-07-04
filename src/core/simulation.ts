// ─────────────────────────────────────────────────────────────────────────────
// The clock — the core game loop
//
// A day has two phases:
//   • DAYTIME (advanceHour, 6:00→21:00): income and labour output accrue in
//     hourly slices — RNG-free, so real-time UI ticking stays deterministic.
//   • NIGHT (retire): the ordered resolution — wages, meals for inmates AND
//     warders, warmth, unrest, guard morale, deaths, events, decisions,
//     releases, intake — everything random happens here, off one RNG cursor.
// advanceDay() remains as the "fast-forward the rest of the day, then retire"
// wrapper the tests and bots drive.
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
import { traitDef } from "./traits";
import { checkVictory } from "./endings";
import { dueLegendBeat, maybeBrandLegend } from "./legends";
import { wardenMods } from "./wardens";
import { Rng } from "./rng";
import {
  assignCells,
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

/** Total government pay per full day for the current roster. */
function dailyIncome(state: GameState): number {
  return state.prisoners
    .filter((p) => p.alive)
    .reduce((sum, p) => sum + p.dailyPayout, 0);
}

/** One hour's slice of labour output (production only — strain lands at night). */
function hourlyLaborOutput(state: GameState): Partial<Record<"coin" | "food" | "firewood" | "buckets", number>> {
  const out: Partial<Record<"coin" | "food" | "firewood" | "buckets", number>> = {};
  const moraleMult = laborMultiplier(state) * wardenMods(state).laborMult;
  for (const p of state.prisoners) {
    if (!p.alive || p.assignment === "none") continue;
    const job = BALANCE.labor[p.assignment];
    const efficiency = 0.5 + (p.health / 100) * 0.5;
    const produced =
      (job.yield / BALANCE.time.hoursPerDay) *
      efficiency *
      prisonerRarityMods(p.rarity).laborMult *
      (traitDef(p.trait)?.laborMult ?? 1) *
      moraleMult;
    out[job.resource] = (out[job.resource] ?? 0) + produced;
  }
  return out;
}

/**
 * Advance the clock one hour. Coins drip in and workshops produce. RNG-free —
 * safe to drive from a real-time UI timer without touching determinism.
 * No-op once the evening bell (dayEndHour) has rung, or during a decision.
 */
export function advanceHour(state: GameState): GameState {
  if (state.gameOver || state.pendingDecision) return state;
  if (state.hour >= BALANCE.time.dayEndHour) return state;

  const incomeSlice = dailyIncome(state) / BALANCE.time.hoursPerDay;
  state.resources.coin += incomeSlice;
  state.stats.totalCoinEarned += incomeSlice;

  const produced = hourlyLaborOutput(state);
  for (const key of Object.keys(produced) as Array<keyof typeof produced>) {
    state.resources[key] = state.resources[key] + (produced[key] ?? 0);
  }

  state.hour += 1;
  return state;
}

/** Pay the warders. Unpaid guards quit and stir up the cells. */
function payWages(state: GameState): boolean {
  const wages = state.guards.reduce((sum, g) => sum + g.wage, 0);
  if (state.resources.coin >= wages) {
    state.resources.coin -= wages;
    return true;
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
  return false;
}

/** The day's toll on the workforce: unrest and injuries from conscription.
 * (Production itself accrued hourly during the day.) */
function laborStrain(state: GameState, rng: Rng): void {
  for (const p of state.prisoners) {
    if (!p.alive || p.assignment === "none") continue;
    const job = BALANCE.labor[p.assignment];
    p.unrest = clamp(p.unrest + job.unrest, 0, 100);
    if (rng.chance(job.injuryRisk)) {
      const hurt = rng.int(10, 30);
      p.health = clamp(p.health - hurt, 0, 100);
      pushLog(state, `${p.name} is injured at the ${p.assignment}.`, "bad");
    }
  }
}

/** Feed the keep: warders eat first (they hold the keys), then the inmates.
 * Shortfall starves prisoners and sours unfed guards. Returns guardsFed. */
function consumeFood(state: GameState): boolean {
  const living = state.prisoners.filter((p) => p.alive);
  const guardNeed = state.guards.length * BALANCE.guardNeeds.foodPerGuard;
  const prisonerNeed = living.length * BALANCE.upkeep.foodPerPrisoner;

  let guardsFed = true;
  if (state.resources.food >= guardNeed) {
    state.resources.food = round1(state.resources.food - guardNeed);
  } else {
    state.resources.food = 0;
    guardsFed = false;
    if (state.guards.length > 0) {
      pushLog(state, "The warders' mess stands empty — hungry men make poor sentries.", "bad");
    }
  }

  if (state.resources.food >= prisonerNeed) {
    state.resources.food = round1(state.resources.food - prisonerNeed);
    return guardsFed;
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
  return guardsFed;
}

/** Bunks available for the corps (base quarters + barracks). */
export function guardQuarters(state: GameState): number {
  return (
    BALANCE.guardNeeds.baseQuarters +
    (state.buildings.barracks ? BALANCE.buildings.barracks.quarters : 0)
  );
}

/**
 * Nightly care of the corps: morale moves with pay, food, quarters, and the
 * tavern; the truly miserable hand in their keys.
 */
function updateGuardNeeds(
  state: GameState,
  rng: Rng,
  guardsFed: boolean,
  paidInFull: boolean,
): void {
  const N = BALANCE.guardNeeds;
  const crowded = state.guards.length > guardQuarters(state);
  for (const g of state.guards) {
    let delta = paidInFull ? N.paidGain : -N.unpaidLoss;
    if (!guardsFed) delta -= N.unfedLoss;
    if (crowded) delta -= N.crowdedLoss;
    if (state.buildings.tavern) delta += BALANCE.buildings.tavern.moralePerDay;
    g.morale = clamp(g.morale + delta, 0, 100);
  }
  if (crowded && state.guards.length > 0) {
    pushLog(state, "Warders grumble over shared bunks — the quarters are full.", "bad");
  }
  // Resignations: checked in roster order for determinism.
  for (let i = state.guards.length - 1; i >= 0; i--) {
    const g = state.guards[i];
    if (g.morale < N.quitThreshold && rng.chance(N.quitChance)) {
      state.guards.splice(i, 1);
      pushLog(state, `${g.name} resigns — pay, bunks, or boredom, the result is the same.`, "bad");
    }
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
    // Temperament: the Brawler stews, the Penitent prays; the Gaol-Lunged and
    // Iron-Backed pay their nightly toll in flesh.
    const t = traitDef(p.trait);
    if (t) {
      delta += t.unrestPerDay;
      if (t.healthPerDay !== 0) p.health = clamp(p.health + t.healthPerDay, 0, 100);
    }
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
  // Standing at court widens the docket: higher tiers see more offers per day.
  for (let i = 0; i < BALANCE.intake.offersByTier[state.tier]; i++) {
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
 * Retire for the night: fast-forward any remaining daylight (accruing income
 * and labour), then resolve the night — the ordered, RNG-driven half of the
 * loop. A no-op while the game is over or a decision awaits an answer.
 */
export function retire(state: GameState): GameState {
  if (state.gameOver || state.pendingDecision) return state;

  // Let the remaining hours of daylight pass in an instant.
  while (state.hour < BALANCE.time.dayEndHour) advanceHour(state);

  const rng = new Rng(state.rngState);
  state.lastEvents = [];
  const income = Math.round(dailyIncome(state));

  const paidInFull = payWages(state);
  laborStrain(state, rng);
  const guardsFed = consumeFood(state);
  consumeFirewood(state);
  updateUnrest(state);
  updateGuardNeeds(state, rng, guardsFed, paidInFull);

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

  // A held legend's story beat claims the night if nothing else did.
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
  assignCells(state); // freed bunks are reusable at dawn

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
  state.hour = BALANCE.time.dayStartHour;
  state.rngState = rng.state;

  pushLog(
    state,
    `Day ${state.day - 1} closes. ~${income} coin earned${
      released ? `, ${released} freed` : ""
    }.`,
    anyDeaths ? "bad" : "neutral",
  );

  evaluateGameOver(state);
  return state;
}

/**
 * Advance one full day: the compatibility wrapper the tests and bot harness
 * drive — remaining daylight fast-forwards, then the night resolves.
 */
export function advanceDay(state: GameState): GameState {
  return retire(state);
}

/**
 * The honest ledger for tomorrow-you: expected net movement of each resource
 * over a full day, given today's roster/assignments/buildings. Deterministic
 * expectation — random events are deliberately excluded (that is what the
 * danger forecast is for).
 */
export function projectDay(state: GameState): {
  coin: number;
  food: number;
  firewood: number;
  buckets: number;
} {
  const moraleMult = laborMultiplier(state) * wardenMods(state).laborMult;
  const production = { coin: 0, food: 0, firewood: 0, buckets: 0 };
  for (const p of state.prisoners) {
    if (!p.alive || p.assignment === "none") continue;
    const job = BALANCE.labor[p.assignment];
    const efficiency = 0.5 + (p.health / 100) * 0.5;
    production[job.resource] +=
      job.yield *
      efficiency *
      prisonerRarityMods(p.rarity).laborMult *
      (traitDef(p.trait)?.laborMult ?? 1) *
      moraleMult;
  }
  const living = livingPrisoners(state);
  const wages = state.guards.reduce((s, g) => s + g.wage, 0);
  const winterMult = state.winterDaysLeft > 0 ? 2 : 1;
  return {
    coin: Math.round(dailyIncome(state) + production.coin - wages),
    food: round1(
      production.food -
        living * BALANCE.upkeep.foodPerPrisoner -
        state.guards.length * BALANCE.guardNeeds.foodPerGuard,
    ),
    firewood: round1(
      production.firewood - living * BALANCE.upkeep.firewoodPerPrisoner * winterMult,
    ),
    buckets: round1(production.buckets),
  };
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
