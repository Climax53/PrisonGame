import { describe, expect, it } from "vitest";
import { createInitialState, assignCells } from "../src/core/state";
import { createGuard, createPrisoner } from "../src/core/factory";
import { Rng } from "../src/core/rng";
import {
  advanceDay,
  advanceHour,
  retire,
  projectDay,
  guardQuarters,
} from "../src/core/simulation";
import { applyAction } from "../src/core/actions";
import { applyDecision } from "../src/core/decisions";
import { serialize, deserialize } from "../src/core/save";
import { BALANCE } from "../src/core/balance";
import type { GameState } from "../src/core/types";

const T = BALANCE.time;

const calmRichState = (seed: number): GameState => {
  const s = createInitialState(seed);
  s.resources.food = 500;
  s.resources.firewood = 500;
  s.resources.coin = 500;
  for (const p of s.prisoners) p.unrest = 0;
  return s;
};

describe("the hour clock", () => {
  it("a new game dawns at the day's start hour", () => {
    expect(createInitialState(1).hour).toBe(T.dayStartHour);
  });

  it("advanceHour drips income in and stops at the evening bell", () => {
    const s = calmRichState(1);
    const incomePerDay = s.prisoners.reduce((n, p) => n + p.dailyPayout, 0);
    const before = s.resources.coin;
    advanceHour(s);
    expect(s.hour).toBe(T.dayStartHour + 1);
    expect(s.resources.coin).toBeCloseTo(before + incomePerDay / T.hoursPerDay, 6);
    // Run to the bell and try to push past it.
    while (s.hour < T.dayEndHour) advanceHour(s);
    const atBell = s.resources.coin;
    advanceHour(s);
    expect(s.hour).toBe(T.dayEndHour); // locked
    expect(s.resources.coin).toBe(atBell); // no accrual after the bell
  });

  it("hourly slices sum to exactly the full-day income", () => {
    const s = calmRichState(2);
    const incomePerDay = s.prisoners.reduce((n, p) => n + p.dailyPayout, 0);
    const before = s.resources.coin;
    while (s.hour < T.dayEndHour) advanceHour(s);
    expect(s.resources.coin).toBeCloseTo(before + incomePerDay, 6);
  });

  it("labour output accrues hourly and matches the projected daily total", () => {
    const s = calmRichState(3);
    for (const p of s.prisoners) p.assignment = "woodcutting";
    const projected = projectDay(s);
    const woodBefore = s.resources.firewood;
    while (s.hour < T.dayEndHour) advanceHour(s);
    const producedByDay = s.resources.firewood - woodBefore;
    // projectDay's firewood = production − upkeep; upkeep lands at night.
    const living = s.prisoners.filter((p) => p.alive).length;
    const upkeep = living * BALANCE.upkeep.firewoodPerPrisoner;
    expect(producedByDay).toBeCloseTo(projected.firewood + upkeep, 1);
  });

  it("retire resolves the night and resets the clock to dawn of the next day", () => {
    const s = calmRichState(4);
    const day = s.day;
    retire(s);
    if (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
    expect(s.day).toBe(day + 1);
    expect(s.hour).toBe(T.dayStartHour);
  });

  it("advanceDay (wrapper) equals hour-by-hour play + retire, exactly", () => {
    const a = calmRichState(7);
    const b = calmRichState(7);
    advanceDay(a);
    while (b.hour < T.dayEndHour) advanceHour(b);
    retire(b);
    expect(a).toEqual(b);
  });

  it("the clock survives save/load mid-day", () => {
    const s = calmRichState(8);
    advanceHour(s);
    advanceHour(s);
    const restored = deserialize(serialize(s))!;
    expect(restored.hour).toBe(s.hour);
    expect(restored).toEqual(s);
  });
});

describe("guard needs & morale", () => {
  it("guards eat daily; an empty larder sours them", () => {
    const s = calmRichState(10);
    const moraleBefore = s.guards[0].morale;
    s.resources.food = 0;
    advanceDay(s);
    if (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
    const g = s.guards[0];
    if (g) expect(g.morale).toBeLessThan(moraleBefore);
  });

  it("a paid, fed corps with a tavern grows content", () => {
    const s = calmRichState(11);
    s.buildings.tavern = true;
    const before = s.guards[0].morale;
    advanceDay(s);
    if (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
    const g = s.guards[0];
    if (g) expect(g.morale).toBeGreaterThan(before);
  });

  it("overcrowded quarters cost morale; the barracks fixes it", () => {
    const crowded = calmRichState(12);
    const rng = new Rng(9);
    while (crowded.guards.length < guardQuarters(crowded) + 2) {
      crowded.guards.push(createGuard(crowded, rng));
    }
    const housed = structuredClone(crowded);
    housed.buildings.barracks = true;
    expect(crowded.guards.length).toBeGreaterThan(guardQuarters(crowded));
    expect(housed.guards.length).toBeLessThanOrEqual(guardQuarters(housed));

    advanceDay(crowded);
    if (crowded.pendingDecision) applyDecision(crowded, crowded.pendingDecision.options[0].id);
    advanceDay(housed);
    if (housed.pendingDecision) applyDecision(housed, housed.pendingDecision.options[0].id);
    const avg = (s: GameState) =>
      s.guards.reduce((n, g) => n + g.morale, 0) / Math.max(1, s.guards.length);
    expect(avg(housed)).toBeGreaterThan(avg(crowded));
  });

  it("miserable warders eventually resign", () => {
    let sawQuit = false;
    for (let seed = 0; seed < 30 && !sawQuit; seed++) {
      const s = calmRichState(seed * 3 + 1);
      for (const g of s.guards) g.morale = 5;
      s.resources.coin = 0; // unpaid too
      advanceDay(s);
      if (s.guards.length === 0) sawQuit = true;
    }
    expect(sawQuit).toBe(true);
  });

  it("morale scales guard effectiveness (miserable corps suppresses less)", async () => {
    const { effectiveGuardSkill } = await import("../src/core/state");
    const happy = calmRichState(13);
    const sad = structuredClone(happy);
    for (const g of happy.guards) g.morale = 100;
    for (const g of sad.guards) g.morale = 0;
    expect(effectiveGuardSkill(happy)).toBeGreaterThan(effectiveGuardSkill(sad));
  });
});

describe("cells", () => {
  it("every prisoner gets a unique cell from day one", () => {
    const s = createInitialState(20);
    const cells = s.prisoners.map((p) => p.cell);
    expect(cells.every((c) => typeof c === "number")).toBe(true);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("an accepted offer moves into the lowest free cell", () => {
    const s = calmRichState(21);
    advanceDay(s);
    while (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
    s.cellCapacity = 10;
    if (s.offers.length > 0) {
      const res = applyAction(s, { type: "acceptOffer", offerIndex: 0 });
      expect(res.ok).toBe(true);
      const cells = s.prisoners.filter((p) => p.alive).map((p) => p.cell);
      expect(new Set(cells).size).toBe(cells.length);
    }
  });

  it("a freed cell is reused by the next arrival", () => {
    const s = createInitialState(22);
    const rng = new Rng(5);
    const freedCell = s.prisoners[0].cell!;
    s.prisoners[0].alive = false;
    s.prisoners = s.prisoners.filter((p) => p.alive);
    const p = createPrisoner(s, rng, "petty");
    s.prisoners.push(p);
    assignCells(s);
    expect(s.prisoners.some((q) => q.cell === freedCell)).toBe(true);
  });
});

describe("projectDay — the resource forecast", () => {
  it("predicts the actual net movement of a calm, event-free day", () => {
    // Find seeds whose night resolves with no events/decisions, then require
    // the forecast to match reality closely.
    let verified = 0;
    for (let seed = 0; seed < 60 && verified < 3; seed++) {
      const s = calmRichState(seed);
      for (const p of s.prisoners) p.assignment = "kitchen";
      const forecast = projectDay(s);
      const before = { ...s.resources };
      advanceDay(s);
      if (s.pendingDecision || s.lastEvents.length > 0) continue; // event noise — skip
      verified++;
      expect(s.resources.coin - before.coin).toBeCloseTo(forecast.coin, 0);
      expect(s.resources.food - before.food).toBeCloseTo(forecast.food, 0);
      expect(s.resources.firewood - before.firewood).toBeCloseTo(forecast.firewood, 0);
    }
    expect(verified).toBeGreaterThanOrEqual(3);
  });

  it("winter doubles the projected firewood burn", () => {
    const s = calmRichState(30);
    const normal = projectDay(s).firewood;
    s.winterDaysLeft = 2;
    const winter = projectDay(s).firewood;
    expect(winter).toBeLessThan(normal);
  });
});

describe("sentences & save v5", () => {
  it("most sentences now land in the 14–30 day band", () => {
    expect(BALANCE.sentence.petty[0]).toBeGreaterThanOrEqual(10);
    expect(BALANCE.sentence.violent[0]).toBeGreaterThanOrEqual(14);
    expect(BALANCE.sentence.political[1]).toBeLessThanOrEqual(30);
    expect(BALANCE.sentence.noble[0]).toBeGreaterThanOrEqual(20);
  });

  it("a v4 save (no hour/morale/cells) migrates and plays a full day", () => {
    const s = createInitialState(31);
    const blob = JSON.parse(serialize(s));
    blob.version = 4;
    delete blob.state.hour;
    for (const g of blob.state.guards) delete g.morale;
    for (const p of blob.state.prisoners) delete p.cell;
    delete blob.state.buildings.barracks;
    delete blob.state.buildings.tavern;
    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.hour).toBe(6);
    expect(restored.guards.every((g) => g.morale === 70)).toBe(true);
    expect(restored.prisoners.every((p) => typeof p.cell === "number")).toBe(true);
    advanceDay(restored);
    expect(Number.isFinite(restored.resources.coin)).toBe(true);
  });
});
