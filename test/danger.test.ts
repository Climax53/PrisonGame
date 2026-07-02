import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { createPrisoner } from "../src/core/factory";
import { Rng } from "../src/core/rng";
import { resolveEvents } from "../src/core/events";
import {
  assessDangers,
  dangerLevel,
  diseaseChance,
  escapeChance,
  fireChance,
  riotChance,
} from "../src/core/danger";

describe("danger forecast", () => {
  it("assessDangers returns probabilities in [0,1]", () => {
    const s = createInitialState(1);
    const d = assessDangers(s);
    for (const v of Object.values(d)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("riot risk is zero when calm and rises with unrest", () => {
    const s = createInitialState(1);
    for (const p of s.prisoners) p.unrest = 0;
    expect(riotChance(s)).toBe(0);
    for (const p of s.prisoners) p.unrest = 90;
    expect(riotChance(s)).toBeGreaterThan(0);
  });

  it("fire risk climbs as firewood is hoarded past 50", () => {
    const s = createInitialState(1);
    s.resources.firewood = 40;
    const low = fireChance(s);
    s.resources.firewood = 300;
    expect(fireChance(s)).toBeGreaterThan(low);
  });

  it("disease risk is zero with enough buckets, positive with debt", () => {
    const s = createInitialState(1);
    s.resources.buckets = 100;
    expect(diseaseChance(s)).toBe(0);
    s.resources.buckets = 0;
    expect(diseaseChance(s)).toBeGreaterThan(0);
  });

  it("escape risk scales with morality (kind emboldens, cruel deters)", () => {
    const base = createInitialState(1);
    for (const p of base.prisoners) p.unrest = 80;
    base.guards = [];
    const kind = structuredClone(base);
    kind.morality = 100;
    const cruel = structuredClone(base);
    cruel.morality = -100;
    expect(escapeChance(kind)).toBeGreaterThan(escapeChance(cruel));
  });

  it("dangerLevel buckets probabilities sensibly", () => {
    expect(dangerLevel(0)).toBe("none");
    expect(dangerLevel(0.05)).toBe("low");
    expect(dangerLevel(0.3)).toBe("medium");
    expect(dangerLevel(0.5)).toBe("high");
    expect(dangerLevel(0.9)).toBe("critical");
  });
});

describe("forecast matches reality (single source of truth)", () => {
  it("a zero riot forecast means a riot never fires", () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = createInitialState(seed);
      for (const p of s.prisoners) p.unrest = 0; // riotChance == 0
      expect(riotChance(s)).toBe(0);
      const rng = new Rng(s.rngState);
      const { decision } = resolveEvents(s, rng);
      expect(decision?.kind).not.toBe("riot");
    }
  });

  it("a zero disease forecast means disease never fires", () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = createInitialState(seed);
      s.resources.buckets = 100; // diseaseChance == 0
      expect(diseaseChance(s)).toBe(0);
      const rng = new Rng(s.rngState);
      const { events } = resolveEvents(s, rng);
      expect(events.some((e) => e.kind === "disease")).toBe(false);
    }
  });

  it("a high-risk day eventually produces the forecast crisis", () => {
    // Max sanitation debt → disease forecast is high → it fires within a few seeds.
    let fired = false;
    for (let seed = 0; seed < 40 && !fired; seed++) {
      const s = createInitialState(seed);
      const rng = new Rng(s.rngState);
      for (let i = 0; i < 4; i++) s.prisoners.push(createPrisoner(s, rng, "violent"));
      s.resources.buckets = 0;
      expect(diseaseChance(s)).toBeGreaterThan(0);
      const { events } = resolveEvents(s, rng);
      if (events.some((e) => e.kind === "disease")) fired = true;
    }
    expect(fired).toBe(true);
  });
});
