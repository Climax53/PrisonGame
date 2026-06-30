// ─────────────────────────────────────────────────────────────────────────────
// Random events
//
// Events are the drama of the game. Their probabilities are not fixed — they are
// computed from the live state, so a mismanaged keep (high unrest, no buckets,
// piles of firewood, too few guards) is genuinely more dangerous. Every event
// returns a GameEvent describing exactly what it did, which feeds both the log
// and the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import type { Rng } from "./rng";
import { effectiveGuardSkill, livingPrisoners } from "./state";
import type { GameEvent, GameState, Prisoner } from "./types";

const E = BALANCE.events;

/** Average unrest across living prisoners (0 if empty). */
function averageUnrest(state: GameState): number {
  const living = state.prisoners.filter((p) => p.alive);
  if (living.length === 0) return 0;
  return living.reduce((s, p) => s + p.unrest, 0) / living.length;
}

/** Guard mitigation in [0,1]: fraction of harm prevented by the warder corps. */
function guardMitigation(state: GameState): number {
  const skill = effectiveGuardSkill(state);
  const coverage = state.guards.length / Math.max(1, livingPrisoners(state) / 4);
  // Skill and coverage both help; capped so guards are never a total shield.
  return Math.min(0.85, (skill / 100) * 0.6 + Math.min(1, coverage) * 0.25);
}

/** Kill `count` living prisoners, preferring the most unhealthy/unrestful. */
function killPrisoners(state: GameState, count: number, rng: Rng): Prisoner[] {
  const living = state.prisoners.filter((p) => p.alive);
  // Bias toward high-unrest/low-health victims, with a little noise.
  living.sort(
    (a, b) =>
      b.unrest - b.health - (a.unrest - a.health) + rng.range(-10, 10),
  );
  const victims = living.slice(0, Math.min(count, living.length));
  for (const v of victims) v.alive = false;
  return victims;
}

function fatigueGuards(state: GameState): void {
  for (const g of state.guards) {
    g.fatigue = Math.min(100, g.fatigue + BALANCE.guards.fatiguePerEvent);
  }
}

/** Resolve all possible events for the day. Mutates state, returns what fired. */
export function resolveEvents(state: GameState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const avgUnrest = averageUnrest(state);
  const living = livingPrisoners(state);
  const mitigation = guardMitigation(state);

  // ── Riot ────────────────────────────────────────────────────────────────
  if (avgUnrest > E.riot.unrestThreshold && living > 0) {
    const chance = Math.min(
      E.riot.maxChance,
      (avgUnrest - E.riot.unrestThreshold) * E.riot.perUnrestOver,
    );
    if (rng.chance(chance)) {
      const severity = (avgUnrest - E.riot.unrestThreshold) / 50; // 0..~1
      const rawDeaths = Math.round(severity * Math.min(4, living));
      const deaths = Math.max(0, Math.round(rawDeaths * (1 - mitigation)));
      const victims = killPrisoners(state, deaths, rng);
      // A riot vents pressure: survivors' unrest drops sharply afterward.
      for (const p of state.prisoners) {
        if (p.alive) p.unrest = Math.max(0, p.unrest - 25);
      }
      fatigueGuards(state);
      const repDelta = -victims.length * BALANCE.reputation.perDeath;
      const coinDelta = -10 * victims.length; // damages, repairs
      state.reputation += repDelta;
      state.resources.coin += coinDelta;
      events.push({
        kind: "riot",
        day: state.day,
        message:
          victims.length > 0
            ? `Riot in the cells! ${victims.length} dead before order returns.`
            : "A riot flares but the warders beat it down with no deaths.",
        deaths: victims.length,
        reputationDelta: repDelta,
        coinDelta,
      });
    }
  }

  // ── Fire ───────────────────────────────────────────────────────────────
  {
    const firewoodOver = Math.max(0, state.resources.firewood - 50);
    const chance = E.fire.baseChance + firewoodOver * E.fire.perFirewoodOver50;
    if (rng.chance(chance)) {
      const lostWood = Math.min(state.resources.firewood, rng.int(10, 30));
      const lostFood = Math.min(state.resources.food, rng.int(0, 15));
      state.resources.firewood -= lostWood;
      state.resources.food -= lostFood;
      const deaths =
        living > 0 && rng.chance(0.4 * (1 - mitigation))
          ? killPrisoners(state, rng.int(1, 2), rng).length
          : 0;
      fatigueGuards(state);
      const repDelta = -deaths * BALANCE.reputation.perDeath;
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
  }

  // ── Disease ──────────────────────────────────────────────────────────────
  {
    const capacity = state.resources.buckets * BALANCE.upkeep.prisonersPerBucket;
    const debt = Math.max(0, living - capacity);
    const chance = Math.min(E.disease.maxChance, debt * E.disease.perSanitationDebt);
    if (debt > 0 && rng.chance(chance)) {
      // Disease saps health across the population; the weakest may die.
      let deaths = 0;
      for (const p of state.prisoners) {
        if (!p.alive) continue;
        p.health -= rng.int(8, 20);
        if (p.health <= 0) {
          p.alive = false;
          deaths++;
        }
      }
      const repDelta = -deaths * BALANCE.reputation.perDeath;
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
  }

  // ── Escape ───────────────────────────────────────────────────────────────
  if (living > 0) {
    const unrestOver = Math.max(0, avgUnrest - 40);
    const emptySlots = Math.max(0, livingPrisoners(state) / 4 - state.guards.length);
    const chance =
      unrestOver * E.escape.perUnrestOver40 + emptySlots * E.escape.perEmptyGuardSlot;
    if (rng.chance(Math.min(0.9, chance))) {
      // The most restless prisoner makes a break for it.
      const candidates = state.prisoners.filter((p) => p.alive);
      candidates.sort((a, b) => b.unrest - a.unrest);
      const escapee = candidates[0];
      const caught = rng.chance(mitigation);
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
        escapee.alive = false; // removed from the keep (escaped)
        const repDelta = -BALANCE.reputation.perEscape;
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
      const actualFine = Math.min(state.resources.coin, fine);
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

  // ── Bribe ────────────────────────────────────────────────────────────────
  {
    const wealthy = state.prisoners.filter(
      (p) => p.alive && (p.severity === "political" || p.severity === "noble"),
    );
    if (wealthy.length > 0 && rng.chance(E.bribe.baseChance)) {
      const briber = wealthy[rng.int(0, wealthy.length - 1)];
      const purse = rng.int(25, 80);
      // You pocket the coin, but there's a scandal risk that bruises reputation.
      const scandal = rng.chance(0.3);
      const repDelta = scandal ? -rng.int(3, 7) : 0;
      state.resources.coin += purse;
      state.reputation += repDelta;
      briber.unrest = Math.max(0, briber.unrest - 10);
      events.push({
        kind: "bribe",
        day: state.day,
        message: scandal
          ? `${briber.name} slips you ${purse} coin — but tongues wag and your name suffers.`
          : `${briber.name} quietly slips you ${purse} coin for softer treatment.`,
        deaths: 0,
        reputationDelta: repDelta,
        coinDelta: purse,
      });
    }
  }

  return events;
}
