import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { resolveEvents } from "../src/core/events";
import { Rng } from "../src/core/rng";

describe("events", () => {
  it("can trigger a riot when unrest is maxed and guards are absent", () => {
    // Run many seeds; with unrest pinned at 100 and no guards a riot must
    // occur at least once.
    let sawRiot = false;
    for (let seed = 0; seed < 50 && !sawRiot; seed++) {
      const s = createInitialState(seed);
      s.guards = [];
      for (const p of s.prisoners) p.unrest = 100;
      const rng = new Rng(s.rngState);
      const events = resolveEvents(s, rng);
      if (events.some((e) => e.kind === "riot")) sawRiot = true;
    }
    expect(sawRiot).toBe(true);
  });

  it("never riots when the keep is perfectly calm", () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = createInitialState(seed);
      for (const p of s.prisoners) p.unrest = 0;
      const rng = new Rng(s.rngState);
      const events = resolveEvents(s, rng);
      expect(events.some((e) => e.kind === "riot")).toBe(false);
    }
  });

  it("spreads disease when there are far too few buckets", () => {
    let sawDisease = false;
    for (let seed = 0; seed < 50 && !sawDisease; seed++) {
      const s = createInitialState(seed);
      s.resources.buckets = 0; // guaranteed sanitation debt
      const rng = new Rng(s.rngState);
      const events = resolveEvents(s, rng);
      if (events.some((e) => e.kind === "disease")) sawDisease = true;
    }
    expect(sawDisease).toBe(true);
  });

  it("records reputation/coin deltas on every event it returns", () => {
    const s = createInitialState(3);
    s.guards = [];
    for (const p of s.prisoners) p.unrest = 100;
    const rng = new Rng(s.rngState);
    const events = resolveEvents(s, rng);
    for (const e of events) {
      expect(typeof e.reputationDelta).toBe("number");
      expect(typeof e.coinDelta).toBe("number");
      expect(e.day).toBe(s.day);
    }
  });
});
