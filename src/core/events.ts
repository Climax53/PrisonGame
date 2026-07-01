// ─────────────────────────────────────────────────────────────────────────────
// Random events
//
// Events are the drama of the game. Their probabilities are computed in
// danger.ts and *shared* with the on-screen danger forecast, so what the player
// is warned about is exactly what the dice roll against here.
//
// Two events — riot and bribe — are too consequential to auto-resolve: they
// raise a PendingDecision for the warden to answer (see decisions.ts). The rest
// (fire, disease, escape, inspection) resolve immediately and return a
// GameEvent describing exactly what they did, which feeds the log and the tests.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import { diseaseChance, escapeChance, fireChance, riotChance } from "./danger";
import { buildBribeDecision, buildRiotDecision } from "./decisions";
import {
  adjustMorality,
  deathReputationMultiplier,
  riotDeadlinessMultiplier,
} from "./morality";
import { prisonerRarityMods } from "./rarity";
import type { Rng } from "./rng";
import {
  averageUnrest,
  effectiveGuardSkill,
  killWeakestPrisoners,
  livingPrisoners,
} from "./state";
import type { GameEvent, GameState, PendingDecision } from "./types";

const E = BALANCE.events;

/** What resolveEvents produces: immediate events, plus at most one decision. */
export interface EventResolution {
  events: GameEvent[];
  decision?: PendingDecision;
}

/** Guard mitigation in [0,1]: fraction of harm prevented by the warder corps. */
function guardMitigation(state: GameState): number {
  const skill = effectiveGuardSkill(state);
  const coverage = state.guards.length / Math.max(1, livingPrisoners(state) / 4);
  return Math.min(0.85, (skill / 100) * 0.6 + Math.min(1, coverage) * 0.25);
}

function fatigueGuards(state: GameState): void {
  for (const g of state.guards) {
    g.fatigue = Math.min(100, g.fatigue + BALANCE.guards.fatiguePerEvent);
  }
}

/** Resolve all possible events for the day. Mutates state, returns what fired. */
export function resolveEvents(state: GameState, rng: Rng): EventResolution {
  const events: GameEvent[] = [];
  let decision: PendingDecision | undefined;
  const avgUnrest = averageUnrest(state);
  const living = livingPrisoners(state);
  const mitigation = guardMitigation(state);

  // ── Riot → decision (highest priority) ───────────────────────────────────
  if (rng.chance(riotChance(state))) {
    const severity = (avgUnrest - E.riot.unrestThreshold) / 50; // 0..~1
    // Un-mitigated worst case; morality (cornered violence) and guards shape it.
    const potentialDeaths = Math.max(
      1,
      Math.round(
        severity *
          Math.min(4, living) *
          (1 - mitigation * 0.4) *
          riotDeadlinessMultiplier(state),
      ),
    );
    decision = buildRiotDecision(state, potentialDeaths, mitigation);
  }

  // ── Fire ───────────────────────────────────────────────────────────────
  if (rng.chance(fireChance(state))) {
    const lostWood = Math.min(state.resources.firewood, rng.int(10, 30));
    const lostFood = Math.min(state.resources.food, rng.int(0, 15));
    state.resources.firewood -= lostWood;
    state.resources.food -= lostFood;
    const deaths =
      living > 0 && rng.chance(0.4 * (1 - mitigation))
        ? killWeakestPrisoners(state, rng.int(1, 2), rng).length
        : 0;
    fatigueGuards(state);
    const repDelta = -deaths * BALANCE.reputation.perDeath * deathReputationMultiplier(state);
    state.reputation += repDelta;
    events.push({
      kind: "fire",
      day: state.day,
      message: `Fire breaks out! ${lostWood} firewood and ${lostFood} food lost${
        deaths ? `, ${deaths} perished` : ""
      }.`,
      deaths,
      reputationDelta: repDelta,
      coinDelta: 0,
    });
  }

  // ── Disease ──────────────────────────────────────────────────────────────
  if (rng.chance(diseaseChance(state))) {
    let deaths = 0;
    for (const p of state.prisoners) {
      if (!p.alive) continue;
      p.health -= rng.int(8, 20);
      if (p.health <= 0) {
        p.alive = false;
        deaths++;
      }
    }
    if (deaths > 0) {
      // Dying of gaol-fever is a neglect death like any other: it darkens the
      // warden's soul and works the warders, same as fire/starvation paths.
      adjustMorality(state, -BALANCE.morality.perNeglectDeath * deaths);
      fatigueGuards(state);
    }
    const repDelta = -deaths * BALANCE.reputation.perDeath * deathReputationMultiplier(state);
    state.reputation += repDelta;
    events.push({
      kind: "disease",
      day: state.day,
      message: `Gaol-fever spreads through the filth${
        deaths ? `; ${deaths} die` : " but all survive"
      }.`,
      deaths,
      reputationDelta: repDelta,
      coinDelta: 0,
    });
  }

  // ── Escape ───────────────────────────────────────────────────────────────
  if (living > 0 && rng.chance(escapeChance(state))) {
    const candidates = state.prisoners.filter((p) => p.alive);
    candidates.sort((a, b) => b.unrest - a.unrest);
    const escapee = candidates[0];
    // Rarer inmates are cunning — harder to drag back.
    const escapeMods = prisonerRarityMods(escapee.rarity);
    const caught = rng.chance(mitigation / escapeMods.escapeMult);
    if (caught) {
      escapee.unrest = Math.max(0, escapee.unrest - 30);
      escapee.health = Math.max(1, escapee.health - 15);
      events.push({
        kind: "escape",
        day: state.day,
        message: `${escapee.name} bolts for the gate — the warders drag them back.`,
        deaths: 0,
        reputationDelta: 0,
        coinDelta: 0,
      });
    } else {
      escapee.alive = false;
      // Losing a notorious inmate is a far greater scandal.
      const repDelta = -BALANCE.reputation.perEscape * escapeMods.repSwingMult;
      state.reputation += repDelta;
      events.push({
        kind: "escape",
        day: state.day,
        message: `${escapee.name} escapes over the wall! Word will reach the magistrate.`,
        deaths: 0,
        reputationDelta: repDelta,
        coinDelta: 0,
      });
    }
  }

  // ── Inspection ───────────────────────────────────────────────────────────
  if (rng.chance(E.inspection.baseChance)) {
    const orderly = avgUnrest < 35 && livingPrisoners(state) <= state.cellCapacity;
    if (orderly) {
      const reward = rng.int(20, 50);
      const repDelta = rng.int(2, 5);
      state.resources.coin += reward;
      state.reputation += repDelta;
      events.push({
        kind: "inspection",
        day: state.day,
        message: `A crown inspector finds your keep orderly. +${reward} coin, reputation rises.`,
        deaths: 0,
        reputationDelta: repDelta,
        coinDelta: reward,
      });
    } else {
      const fine = rng.int(15, 40);
      // Only seize coin the warden actually has — a negative balance must not
      // turn a fine into a payout.
      const actualFine = Math.min(Math.max(0, state.resources.coin), fine);
      const repDelta = -rng.int(2, 5);
      state.resources.coin -= actualFine;
      state.reputation += repDelta;
      events.push({
        kind: "inspection",
        day: state.day,
        message: `An inspector recoils at the squalor. Fined ${actualFine} coin.`,
        deaths: 0,
        reputationDelta: repDelta,
        coinDelta: -actualFine,
      });
    }
  }

  // ── Bribe → decision (only if a riot didn't already claim the day) ────────
  if (!decision) {
    const wealthy = state.prisoners.filter(
      (p) => p.alive && (p.severity === "political" || p.severity === "noble"),
    );
    if (wealthy.length > 0 && rng.chance(E.bribe.baseChance)) {
      const briber = wealthy[rng.int(0, wealthy.length - 1)];
      const purse = rng.int(25, 80);
      decision = buildBribeDecision(state, briber, purse);
    }
  }

  return { events, decision };
}
