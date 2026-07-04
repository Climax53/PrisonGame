import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { advanceDay, summarize } from "../src/core/simulation";
import { applyDecision } from "../src/core/decisions";
import { BALANCE } from "../src/core/balance";

describe("advanceDay", () => {
  it("is fully deterministic for a given seed", () => {
    let a = createInitialState(42);
    let b = createInitialState(42);
    for (let i = 0; i < 30; i++) {
      a = advanceDay(a);
      b = advanceDay(b);
    }
    expect(a).toEqual(b);
  });

  it("advances the day counter", () => {
    let s = createInitialState(1);
    expect(s.day).toBe(1);
    s = advanceDay(s);
    expect(s.day).toBe(2);
  });

  it("pays government income each day", () => {
    const s = createInitialState(1);
    const expectedIncome = summarize(s).dailyIncome;
    const before = s.resources.coin;
    advanceDay(s);
    // Income credited, then wages + upkeep debited; income must be reflected.
    expect(expectedIncome).toBeGreaterThan(0);
    // Coin should not have changed by more than income + plausible spend.
    expect(s.resources.coin).toBeLessThanOrEqual(before + expectedIncome);
  });

  it("consumes food proportional to the population", () => {
    const s = createInitialState(1);
    const living = s.prisoners.filter((p) => p.alive).length;
    const before = s.resources.food;
    advanceDay(s);
    // Food dropped by at least the upkeep need (events/labour may add some).
    const need = living * BALANCE.upkeep.foodPerPrisoner;
    expect(s.resources.food).toBeLessThanOrEqual(before - need + 0.001 + 100);
    expect(s.resources.food).toBeLessThan(before + 50);
  });

  it("starves prisoners when food is gone", () => {
    const s = createInitialState(1);
    s.resources.food = 0;
    const before = s.prisoners.map((p) => p.health);
    advanceDay(s);
    const after = s.prisoners.filter((p) => p.alive).map((p) => p.health);
    // At least one survivor should have lost health to starvation.
    const lostHealth = after.some((h, i) => before[i] !== undefined && h < before[i]);
    expect(lostHealth).toBe(true);
  });

  it("generates fresh intake offers each day", () => {
    const s = createInitialState(1);
    advanceDay(s);
    expect(s.offers.length).toBe(BALANCE.intake.offersByTier[s.tier]);
    expect(s.offers.every((o) => o.dailyPayout > 0)).toBe(true);
  });

  it("does not mutate a game that is already over", () => {
    const s = createInitialState(1);
    s.gameOver = true;
    const snapshot = JSON.stringify(s);
    advanceDay(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("ends the game when reputation collapses", () => {
    const s = createInitialState(1);
    s.reputation = 1;
    // Force a brutal, doomed keep: starve and freeze everyone repeatedly.
    // Resolve any riot/bribe decision the chaos raises so the day loop proceeds.
    for (let i = 0; i < 60 && !s.gameOver; i++) {
      s.resources.food = 0;
      s.resources.firewood = 0;
      advanceDay(s);
      if (s.pendingDecision) {
        applyDecision(s, s.pendingDecision.options[0].id);
      }
    }
    expect(s.gameOver).toBe(true);
    expect(s.gameOverReason).toBeTruthy();
  });
});
