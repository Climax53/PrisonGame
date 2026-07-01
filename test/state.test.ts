import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { BALANCE } from "../src/core/balance";
import { serialize, deserialize } from "../src/core/index";

describe("initial state", () => {
  it("starts a new game with the configured loadout", () => {
    const s = createInitialState(1);
    expect(s.day).toBe(1);
    expect(s.tier).toBe("village");
    expect(s.resources.coin).toBe(BALANCE.start.coin);
    expect(s.guards).toHaveLength(BALANCE.start.guards);
    expect(s.prisoners).toHaveLength(2);
    expect(s.prisoners.every((p) => p.alive)).toBe(true);
    expect(s.gameOver).toBe(false);
    expect(s.morality).toBe(0);
    expect(s.prisoners.every((p) => typeof p.rarity === "string")).toBe(true);
    expect(s.guards.every((g) => typeof g.rarity === "string")).toBe(true);
  });

  it("mints unique ids for every entity", () => {
    const s = createInitialState(5);
    const ids = [...s.prisoners.map((p) => p.id), ...s.guards.map((g) => g.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is reproducible from a seed", () => {
    const a = createInitialState(777);
    const b = createInitialState(777);
    expect(a).toEqual(b);
  });

  it("assigns each starter prisoner a positive daily payout", () => {
    const s = createInitialState(3);
    expect(s.prisoners.every((p) => p.dailyPayout > 0)).toBe(true);
  });
});

describe("save / load", () => {
  it("round-trips through serialize/deserialize", () => {
    const s = createInitialState(2024);
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
  });

  it("rejects malformed saves", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, state: {} }))).toBeNull();
  });
});
