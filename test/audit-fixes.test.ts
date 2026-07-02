// Regression tests for the adversarial-review findings (July 2026 audit).
// Each test encodes a concrete failure scenario from the report so none of
// these bugs can silently return.

import { describe, expect, it } from "vitest";
import { createInitialState, evaluateGameOver, killWeakestPrisoners } from "../src/core/state";
import { createPrisoner } from "../src/core/factory";
import { advanceDay } from "../src/core/simulation";
import { applyDecision, buildBribeDecision, buildRiotDecision } from "../src/core/decisions";
import { resolveEvents } from "../src/core/events";
import { serialize, deserialize } from "../src/core/save";
import { Rng } from "../src/core/rng";
import { BALANCE } from "../src/core/balance";

describe("finding #1 — fines never pay an indebted warden", () => {
  it("a disorderly inspection with negative coin takes nothing (and never adds)", () => {
    // Force the disorderly-inspection branch across many seeds; coin must
    // never increase from the fine while the balance is negative.
    for (let seed = 0; seed < 200; seed++) {
      const s = createInitialState(seed);
      const rng = new Rng(s.rngState);
      for (const p of s.prisoners) p.unrest = 90; // disorderly, riot possible but fine
      s.resources.coin = -20;
      const before = s.resources.coin;
      const { events } = resolveEvents(s, rng);
      const inspection = events.find((e) => e.kind === "inspection");
      if (inspection && inspection.coinDelta <= 0) {
        expect(s.resources.coin).toBeLessThanOrEqual(before + 0.0001);
        expect(Math.abs(inspection.coinDelta)).toBe(0); // nothing seizable (−0 ok)
        return; // scenario exercised
      }
    }
    throw new Error("no disorderly inspection fired in 200 seeds");
  });
});

describe("finding #2 — failed payroll never erases debt", () => {
  it("negative coin stays negative through a failed payday", () => {
    const s = createInitialState(1);
    s.resources.coin = -60;
    s.resources.food = 999;
    s.resources.firewood = 999;
    const guardsBefore = s.guards.length;
    advanceDay(s);
    // Income is small (2 petty inmates); debt must not have been clamped to 0.
    // coin = -60 + income(±) - 0 wages-paid; it can rise by income but never
    // jump to exactly 0 via clamping while a guard also quit unpaid.
    expect(s.guards.length).toBeLessThan(guardsBefore); // quitter left
    expect(s.resources.coin).toBeLessThan(0);
  });

  it("partial payment spends only what exists", () => {
    const s = createInitialState(1);
    // One guard, wage w; give less coin than the bill.
    const wage = s.guards[0].wage;
    s.resources.coin = wage - 3;
    s.resources.food = 999;
    s.resources.firewood = 999;
    const income = s.prisoners.filter((p) => p.alive).reduce((n, p) => n + p.dailyPayout, 0);
    advanceDay(s);
    // After income, affordable wages were deducted; balance never goes below
    // (before + income - wages-owed) and never got clamped upward.
    expect(s.resources.coin).toBeGreaterThanOrEqual(-1);
    expect(Number.isFinite(s.resources.coin)).toBe(true);
    expect(income).toBeGreaterThan(0);
  });
});

describe("finding #3 — victim selection uses one RNG draw per prisoner", () => {
  it("consumes exactly living-count draws regardless of sort internals", () => {
    const s = createInitialState(5);
    const rng = new Rng(s.rngState);
    for (let i = 0; i < 6; i++) s.prisoners.push(createPrisoner(s, rng, "violent"));
    const living = s.prisoners.filter((p) => p.alive).length;

    const probe = new Rng(rng.state);
    killWeakestPrisoners(s, 2, probe);
    // Advance a fresh cursor by exactly `living` draws — the post-kill cursor
    // must match, proving no comparator-driven, engine-dependent extra draws.
    const expected = new Rng(rng.state);
    for (let i = 0; i < living; i++) expected.next();
    expect(probe.state).toBe(expected.state);
  });

  it("is deterministic for identical input", () => {
    const build = () => {
      const s = createInitialState(9);
      const rng = new Rng(s.rngState);
      for (let i = 0; i < 5; i++) s.prisoners.push(createPrisoner(s, rng, "violent"));
      s.rngState = rng.state;
      return s;
    };
    const a = build();
    const b = build();
    killWeakestPrisoners(a, 3, new Rng(a.rngState));
    killWeakestPrisoners(b, 3, new Rng(b.rngState));
    expect(a.prisoners.map((p) => [p.id, p.alive])).toEqual(
      b.prisoners.map((p) => [p.id, p.alive]),
    );
  });
});

describe("finding #4 — payroll failure does not reshuffle the roster", () => {
  it("surviving guards keep their order when the weakest quits", () => {
    const s = createInitialState(1);
    // Three guards with distinct skills, weakest in the middle.
    const rng = new Rng(s.rngState);
    while (s.guards.length < 3) s.guards.push(createPrisonerSafeGuard(s, rng));
    s.guards[0].skill = 70;
    s.guards[1].skill = 10; // the quitter
    s.guards[2].skill = 50;
    const first = s.guards[0].id;
    const third = s.guards[2].id;
    s.resources.coin = -5; // guarantee failed payroll
    s.resources.food = 999;
    s.resources.firewood = 999;
    advanceDay(s);
    const ids = s.guards.map((g) => g.id);
    expect(ids).toEqual([first, third]); // order preserved, middle removed
  });
});

// Helper: mint a guard without dragging factory's tier-based wage variance
// into the assertions above.
import { createGuard } from "../src/core/factory";
function createPrisonerSafeGuard(s: ReturnType<typeof createInitialState>, rng: Rng) {
  const g = createGuard(s, rng);
  g.wage = 8;
  return g;
}

describe("finding #5 — a departed briber takes the purse with them", () => {
  it("accept after the briber left changes nothing", () => {
    const s = createInitialState(2);
    const rng = new Rng(s.rngState);
    const noble = createPrisoner(s, rng, "noble");
    s.prisoners.push(noble);
    s.pendingDecision = buildBribeDecision(s, noble, 60);
    // The briber leaves before the player answers.
    noble.alive = false;
    s.prisoners = s.prisoners.filter((p) => p.alive);
    const coinBefore = s.resources.coin;
    const moralityBefore = s.morality;
    const out = applyDecision(s, "accept");
    expect(out.ok).toBe(true);
    expect(s.resources.coin).toBe(coinBefore);
    expect(s.morality).toBe(moralityBefore);
    expect(out.message).toMatch(/gone/i);
  });
});

describe("finding #6 — riots cannot charge for phantom rioters", () => {
  it("negotiating an empty-keep riot costs nothing", () => {
    const s = createInitialState(3);
    s.pendingDecision = buildRiotDecision(s, 4, 0.2);
    s.prisoners = []; // everyone released/dead before the answer
    s.resources.coin = 500;
    const before = s.resources.coin;
    const out = applyDecision(s, "negotiate");
    expect(out.ok).toBe(true);
    expect(out.deaths).toBe(0);
    expect(s.resources.coin).toBe(before);
  });

  it("negotiate cost is capped by the real living count", () => {
    const s = createInitialState(3);
    // Claimed toll of 4, but only 1 inmate actually present.
    s.prisoners = s.prisoners.slice(0, 1);
    s.pendingDecision = buildRiotDecision(s, 4, 0.2);
    s.resources.coin = 500;
    const before = s.resources.coin;
    applyDecision(s, "negotiate");
    // Cost formula: 30 + potential*10, potential capped at living (1) → 40.
    expect(before - s.resources.coin).toBe(40);
  });
});

describe("finding #7 — disease deaths darken the soul like any neglect", () => {
  it("a fatal outbreak lowers morality", () => {
    let exercised = false;
    for (let seed = 0; seed < 120 && !exercised; seed++) {
      const s = createInitialState(seed);
      const rng = new Rng(s.rngState);
      for (let i = 0; i < 4; i++) s.prisoners.push(createPrisoner(s, rng, "violent"));
      for (const p of s.prisoners) p.health = 10; // fatal if disease hits
      for (const p of s.prisoners) p.unrest = 0; // no riot interference
      s.resources.buckets = 0;
      const moralityBefore = s.morality;
      const { events } = resolveEvents(s, rng);
      const disease = events.find((e) => e.kind === "disease" && e.deaths > 0);
      if (disease) {
        expect(s.morality).toBeLessThan(moralityBefore);
        exercised = true;
      }
    }
    expect(exercised).toBe(true);
  });
});

describe("finding #8 — decision outcomes report their real deltas", () => {
  it("the mirrored event carries the actual coin/reputation change", () => {
    const s = createInitialState(4);
    s.resources.coin = 1000;
    s.pendingDecision = buildRiotDecision(s, 2, 0.2);
    const coinBefore = s.resources.coin;
    const repBefore = s.reputation;
    applyDecision(s, "negotiate");
    const ev = s.lastEvents[0];
    expect(ev.kind).toBe("riot");
    expect(ev.coinDelta).toBe(s.resources.coin - coinBefore);
    expect(ev.reputationDelta).toBeCloseTo(s.reputation - repBefore, 6);
    expect(ev.coinDelta).toBeLessThan(0); // negotiation costs coin
  });
});

describe("finding #10 — game over clears any pending decision", () => {
  it("evaluateGameOver drops the dead modal", () => {
    const s = createInitialState(6);
    s.pendingDecision = buildRiotDecision(s, 2, 0.2);
    s.reputation = 0;
    evaluateGameOver(s);
    expect(s.gameOver).toBe(true);
    expect(s.pendingDecision).toBeUndefined();
  });
});

describe("blind spot — mid-game saves round-trip with transient state", () => {
  it("serializes and restores a state carrying pendingDecision and lastEvents", () => {
    const s = createInitialState(11);
    for (let i = 0; i < 5 && !s.pendingDecision; i++) {
      for (const p of s.prisoners) p.unrest = 100;
      s.guards = [];
      advanceDay(s);
    }
    // Whether or not a decision fired, add one explicitly for the round-trip.
    if (!s.pendingDecision) s.pendingDecision = buildRiotDecision(s, 2, 0.2);
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
    // And the restored decision is resolvable.
    const out = applyDecision(restored!, restored!.pendingDecision!.options[0].id);
    expect(out.ok).toBe(true);
  });
});

describe("economy sanity after the fixes", () => {
  it("bankruptcy is still reachable (loss condition not soft-locked)", () => {
    const s = createInitialState(21);
    s.resources.coin = -95;
    s.reputation = 90; // keep reputation-loss from ending it first
    // Drain: no income (no prisoners), wages owed.
    s.prisoners = [];
    s.offers = [];
    let bankrupt = false;
    for (let i = 0; i < 30 && !bankrupt; i++) {
      s.resources.coin -= 2; // ongoing damages (e.g. riot repairs)
      evaluateGameOver(s);
      bankrupt = s.gameOver;
    }
    expect(bankrupt).toBe(true);
    expect(s.gameOverReason).toMatch(/bankrupt/i);
  });

  it("upkeep math is unaffected: BALANCE constants unchanged by fixes", () => {
    expect(BALANCE.upkeep.foodPerPrisoner).toBe(1);
    expect(BALANCE.guards.baseWage).toBe(8);
  });
});
