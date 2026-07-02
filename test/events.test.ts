import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { resolveEvents } from "../src/core/events";
import { Rng } from "../src/core/rng";

describe("events", () => {
  it("raises a RIOT DECISION when unrest is maxed and guards are absent", () => {
    // With unrest pinned at 100 and no guards, a riot decision must arise at
    // least once across many seeds.
    let sawRiot = false;
    for (let seed = 0; seed < 50 && !sawRiot; seed++) {
      const s = createInitialState(seed);
      s.guards = [];
      for (const p of s.prisoners) p.unrest = 100;
      const rng = new Rng(s.rngState);
      const { decision } = resolveEvents(s, rng);
      if (decision?.kind === "riot") sawRiot = true;
    }
    expect(sawRiot).toBe(true);
  });

  it("a riot decision offers exactly three options", () => {
    const s = createInitialState(0);
    s.guards = [];
    for (const p of s.prisoners) p.unrest = 100;
    // Find a seed that produces the riot this call.
    let decision;
    for (let seed = 0; seed < 50; seed++) {
      const t = createInitialState(seed);
      t.guards = [];
      for (const p of t.prisoners) p.unrest = 100;
      const rng = new Rng(t.rngState);
      const res = resolveEvents(t, rng);
      if (res.decision?.kind === "riot") {
        decision = res.decision;
        break;
      }
    }
    expect(decision).toBeTruthy();
    expect(decision!.options.map((o) => o.id).sort()).toEqual([
      "crush",
      "negotiate",
      "waitItOut",
    ]);
  });

  it("never riots when the keep is perfectly calm", () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = createInitialState(seed);
      for (const p of s.prisoners) p.unrest = 0;
      const rng = new Rng(s.rngState);
      const { decision } = resolveEvents(s, rng);
      expect(decision?.kind).not.toBe("riot");
    }
  });

  it("spreads disease when there are far too few buckets", () => {
    let sawDisease = false;
    for (let seed = 0; seed < 50 && !sawDisease; seed++) {
      const s = createInitialState(seed);
      s.resources.buckets = 0; // guaranteed sanitation debt
      const rng = new Rng(s.rngState);
      const { events } = resolveEvents(s, rng);
      if (events.some((e) => e.kind === "disease")) sawDisease = true;
    }
    expect(sawDisease).toBe(true);
  });

  it("records reputation/coin deltas on every immediate event", () => {
    // Force sanitation debt so disease-type events fire with recorded deltas.
    const s = createInitialState(3);
    s.resources.buckets = 0;
    const rng = new Rng(s.rngState);
    const { events } = resolveEvents(s, rng);
    for (const e of events) {
      expect(typeof e.reputationDelta).toBe("number");
      expect(typeof e.coinDelta).toBe("number");
      expect(e.day).toBe(s.day);
    }
  });

  it("raises a bribe decision only when a wealthy inmate is present", () => {
    // No political/noble inmates in a fresh village game → never a bribe.
    for (let seed = 0; seed < 25; seed++) {
      const s = createInitialState(seed);
      const rng = new Rng(s.rngState);
      const { decision } = resolveEvents(s, rng);
      expect(decision?.kind).not.toBe("bribe");
    }
  });
});
