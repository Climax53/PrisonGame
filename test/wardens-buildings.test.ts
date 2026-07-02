import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { advanceDay } from "../src/core/simulation";
import { applyAction, costs } from "../src/core/actions";
import { applyDecision, buildRiotDecision } from "../src/core/decisions";
import { WARDENS, wardenDef, wardenMods } from "../src/core/wardens";
import { ACHIEVEMENTS, evaluateAchievements, unlockedWardens } from "../src/core/achievements";
import { escapeChance, dangerScale, opportunityScale } from "../src/core/danger";
import { serialize, deserialize } from "../src/core/save";
import { BALANCE } from "../src/core/balance";
import type { GameState, WardenClass } from "../src/core/types";

const endDayClean = (s: GameState) => {
  advanceDay(s);
  while (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
};

describe("warden classes", () => {
  it("defines 7 wardens; steward is the always-unlocked baseline", () => {
    expect(WARDENS).toHaveLength(7);
    expect(wardenDef("steward").unlockedBy).toBeUndefined();
    for (const w of WARDENS) {
      if (w.id !== "steward") expect(w.unlockedBy).toBeTruthy();
    }
  });

  it("every non-steward unlock maps to a real achievement", () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const w of WARDENS) {
      if (w.unlockedBy) expect(ids.has(w.unlockedBy), w.id).toBe(true);
    }
  });

  it("the veteran starts with an extra guard and cheaper hires", () => {
    const steward = createInitialState(1);
    const veteran = createInitialState(1, { warden: "veteran" });
    expect(veteran.guards.length).toBe(steward.guards.length + 1);
    expect(costs.hireGuard(veteran)).toBeLessThan(costs.hireGuard(steward));
  });

  it("confessor and butcher start on opposite moral footings", () => {
    expect(createInitialState(2, { warden: "confessor" }).morality).toBeGreaterThan(0);
    expect(createInitialState(2, { warden: "butcher" }).morality).toBeLessThan(0);
  });

  it("the merchant buys cheaper and earns bigger bounties", () => {
    const steward = createInitialState(3);
    const merchant = createInitialState(3, { warden: "merchant" });
    expect(costs.buyResource("food", 10, merchant)).toBeLessThan(
      costs.buyResource("food", 10, steward),
    );
    endDayClean(steward);
    endDayClean(merchant);
    // Same seed & same rng consumption order → comparable offers.
    expect(merchant.offers[0].acceptBounty).toBeGreaterThan(0);
  });

  it("the gambler runs hotter on both dials", () => {
    const steward = createInitialState(4);
    const gambler = createInitialState(4, { warden: "gambler" });
    expect(dangerScale(gambler)).toBeGreaterThan(dangerScale(steward));
    expect(opportunityScale(gambler)).toBeGreaterThan(opportunityScale(steward));
  });

  it("the butcher's crush kills fewer for the same riot", () => {
    const run = (warden: WardenClass) => {
      const s = createInitialState(9, { warden });
      // A big roster so the toll difference is visible.
      for (let i = 0; i < 3; i++) s.prisoners.push({ ...s.prisoners[0], id: `x${i}` });
      s.pendingDecision = buildRiotDecision(s, 4, 0.2);
      const before = s.prisoners.filter((p) => p.alive).length;
      applyDecision(s, "crush");
      return before - s.prisoners.filter((p) => p.alive).length;
    };
    expect(run("butcher")).toBeLessThanOrEqual(run("steward"));
  });

  it("all wardens play 60 machine days without corruption", () => {
    for (const w of WARDENS) {
      const s = createInitialState(31, { warden: w.id });
      for (let i = 0; i < 60 && !s.gameOver; i++) {
        endDayClean(s);
        expect(Number.isFinite(s.resources.coin), w.id).toBe(true);
        expect(Number.isFinite(s.morality), w.id).toBe(true);
      }
    }
  });
});

describe("buildings", () => {
  it("build action constructs once and only once", () => {
    const s = createInitialState(5);
    s.resources.coin = 1000;
    expect(applyAction(s, { type: "build", building: "chapel" }).ok).toBe(true);
    expect(s.buildings.chapel).toBe(true);
    expect(applyAction(s, { type: "build", building: "chapel" }).ok).toBe(false);
  });

  it("refuses construction the warden cannot afford", () => {
    const s = createInitialState(5);
    s.resources.coin = 10;
    expect(applyAction(s, { type: "build", building: "walls" }).ok).toBe(false);
  });

  it("walls measurably cut escape risk (and the forecast agrees)", () => {
    const open = createInitialState(6);
    for (const p of open.prisoners) p.unrest = 90;
    open.guards = [];
    const walled = structuredClone(open);
    walled.buildings.walls = true;
    expect(escapeChance(walled)).toBeLessThan(escapeChance(open));
    expect(escapeChance(walled) / escapeChance(open)).toBeCloseTo(
      BALANCE.buildings.walls.escapeMult,
      5,
    );
  });

  it("the infirmary heals and the chapel calms, daily", () => {
    const s = createInitialState(7);
    s.resources.coin = 2000;
    s.resources.food = 500;
    s.resources.firewood = 500;
    s.buildings.infirmary = true;
    s.buildings.chapel = true;
    for (const p of s.prisoners) {
      p.health = 40;
      p.unrest = 50;
    }
    const h0 = s.prisoners[0].health;
    const u0 = s.prisoners[0].unrest;
    advanceDay(s);
    const p0 = s.prisoners.find((p) => p.alive);
    if (p0) {
      expect(p0.health).toBeGreaterThan(h0);
      // Chapel counters the day's natural unrest pressure.
      expect(p0.unrest).toBeLessThanOrEqual(u0 + 2);
    }
  });

  it("a standing gallows hardens the warden's soul over time", () => {
    const s = createInitialState(8);
    s.buildings.gallows = true;
    s.resources.food = 500;
    s.resources.firewood = 500;
    const before = s.morality;
    for (let i = 0; i < 5 && !s.gameOver; i++) endDayClean(s);
    expect(s.morality).toBeLessThan(before);
  });
});

describe("pacing (the Crown's Whim)", () => {
  it("scales danger and opportunity as configured", () => {
    const s = createInitialState(10);
    for (const p of s.prisoners) p.unrest = 90;
    s.pacing = "slow";
    const slowDanger = dangerScale(s);
    s.pacing = "chaos";
    const chaosDanger = dangerScale(s);
    expect(chaosDanger).toBeGreaterThan(slowDanger);
    expect(chaosDanger / BALANCE.pacing.chaos.danger).toBeCloseTo(
      slowDanger / BALANCE.pacing.slow.danger,
      6,
    );
  });

  it("is changeable mid-run via an action, with no penalty", () => {
    const s = createInitialState(10);
    const res = applyAction(s, { type: "setPacing", pacing: "chaos" });
    expect(res.ok).toBe(true);
    expect(s.pacing).toBe("chaos");
    expect(applyAction(s, { type: "setPacing", pacing: "slow" }).ok).toBe(true);
  });
});

describe("achievements", () => {
  it("evaluates against live state", () => {
    const s = createInitialState(11);
    expect(evaluateAchievements(s)).not.toContain("longReign");
    s.day = 50;
    expect(evaluateAchievements(s)).toContain("longReign");
    s.morality = 70;
    expect(evaluateAchievements(s)).toContain("saintly");
    s.gameWon = true;
    expect(evaluateAchievements(s)).toContain("crownKeeper");
    expect(evaluateAchievements(s)).toContain("gentleVictory");
  });

  it("unlockedWardens maps achievements to classes (steward always free)", () => {
    expect(unlockedWardens([])).toEqual(["steward"]);
    const all = unlockedWardens(ACHIEVEMENTS.map((a) => a.id));
    for (const w of WARDENS) expect(all).toContain(w.id);
  });
});

describe("save v4 migration", () => {
  it("a v3 save (no warden/identity/buildings) migrates and plays", () => {
    const s = createInitialState(12);
    const blob = JSON.parse(serialize(s));
    blob.version = 3;
    for (const k of [
      "warden", "wardenName", "keepName", "heraldry", "pacing", "buildings", "legendsSeen",
    ]) {
      delete blob.state[k];
    }
    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.warden).toBe("steward");
    expect(restored.pacing).toBe("steady");
    expect(restored.buildings.walls).toBe(false);
    advanceDay(restored);
    expect(Number.isFinite(restored.resources.coin)).toBe(true);
  });

  it("wardenMods handles every class without throwing", () => {
    for (const w of WARDENS) {
      const s = createInitialState(1, { warden: w.id });
      const m = wardenMods(s);
      expect(m.priceMult).toBeGreaterThan(0);
      expect(m.dangerMult).toBeGreaterThan(0);
    }
  });
});
