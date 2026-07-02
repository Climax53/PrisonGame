import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { createGuard } from "../src/core/factory";
import { Rng } from "../src/core/rng";
import { advanceDay } from "../src/core/simulation";
import { applyDecision, buildRiotDecision, buildBribeDecision } from "../src/core/decisions";
import { createPrisoner } from "../src/core/factory";
import {
  adjustMorality,
  moralityStanding,
  moralityFactor,
  laborMultiplier,
  escapeMultiplier,
  riotDeadlinessMultiplier,
  deathReputationMultiplier,
  repGainMultiplier,
} from "../src/core/morality";

describe("morality standing & factor", () => {
  it("labels the standing across the scale", () => {
    expect(moralityStanding(100)).toBe("Saint");
    expect(moralityStanding(50)).toBe("Benevolent");
    expect(moralityStanding(15)).toBe("Kind");
    expect(moralityStanding(0)).toBe("Fair");
    expect(moralityStanding(-20)).toBe("Stern");
    expect(moralityStanding(-50)).toBe("Cruel");
    expect(moralityStanding(-100)).toBe("Tyrant");
  });

  it("moralityFactor maps to [-1,1]", () => {
    const s = createInitialState(1);
    s.morality = 100;
    expect(moralityFactor(s)).toBe(1);
    s.morality = -100;
    expect(moralityFactor(s)).toBe(-1);
    s.morality = 0;
    expect(moralityFactor(s)).toBe(0);
  });

  it("adjustMorality clamps to [-100,100]", () => {
    const s = createInitialState(1);
    adjustMorality(s, 999);
    expect(s.morality).toBe(100);
    adjustMorality(s, -9999);
    expect(s.morality).toBe(-100);
  });
});

describe("morality effect multipliers are two-sided", () => {
  const cruel = () => {
    const s = createInitialState(1);
    s.morality = -100;
    return s;
  };
  const kind = () => {
    const s = createInitialState(1);
    s.morality = 100;
    return s;
  };

  it("cruelty drives labour harder, kindness lets inmates slack", () => {
    expect(laborMultiplier(cruel())).toBeGreaterThan(1);
    expect(laborMultiplier(kind())).toBeLessThan(1);
  });

  it("kindness emboldens escapes, cruelty deters them", () => {
    expect(escapeMultiplier(kind())).toBeGreaterThan(1);
    expect(escapeMultiplier(cruel())).toBeLessThan(1);
  });

  it("cruelty makes cornered riots deadlier", () => {
    expect(riotDeadlinessMultiplier(cruel())).toBeGreaterThan(1);
    expect(riotDeadlinessMultiplier(kind())).toBeLessThan(1);
  });

  it("cruelty amplifies the reputation cost of deaths (butcher)", () => {
    expect(deathReputationMultiplier(cruel())).toBeGreaterThan(1);
    expect(deathReputationMultiplier(kind())).toBeLessThan(1);
  });

  it("kindness amplifies reputation gains (beloved)", () => {
    expect(repGainMultiplier(kind())).toBeGreaterThan(1);
    expect(repGainMultiplier(cruel())).toBeLessThan(1);
  });
});

describe("choices and treatment move morality", () => {
  it("crushing a riot lowers morality; negotiating raises it", () => {
    const crush = createInitialState(1);
    crush.pendingDecision = buildRiotDecision(crush, 2, 0.2);
    applyDecision(crush, "crush");
    expect(crush.morality).toBeLessThan(0);

    const talk = createInitialState(1);
    talk.resources.coin = 1000;
    talk.pendingDecision = buildRiotDecision(talk, 2, 0.2);
    applyDecision(talk, "negotiate");
    expect(talk.morality).toBeGreaterThan(0);
  });

  it("accepting a bribe corrupts; refusing ennobles", () => {
    const s = createInitialState(1);
    const rng = new Rng(s.rngState);
    const noble = createPrisoner(s, rng, "noble");
    s.prisoners.push(noble);

    const accept = structuredClone(s);
    accept.pendingDecision = buildBribeDecision(accept, noble, 50);
    applyDecision(accept, "accept");
    expect(accept.morality).toBeLessThan(0);

    const refuse = structuredClone(s);
    refuse.pendingDecision = buildBribeDecision(refuse, noble, 50);
    applyDecision(refuse, "refuse");
    expect(refuse.morality).toBeGreaterThan(0);
  });

  it("employing brutal warders drifts morality toward cruelty over time", () => {
    const s = createInitialState(1);
    // Replace the corps with a maximally brutal warder.
    s.guards = [];
    const rng = new Rng(s.rngState);
    const g = createGuard(s, rng);
    g.brutality = 100;
    g.skill = 50;
    s.guards.push(g);
    s.rngState = rng.state;
    s.resources.food = 999;
    s.resources.firewood = 999;
    const before = s.morality;
    for (let i = 0; i < 5 && !s.gameOver; i++) {
      advanceDay(s);
      if (s.pendingDecision) applyDecision(s, "negotiate");
    }
    expect(s.morality).toBeLessThan(before);
  });
});
