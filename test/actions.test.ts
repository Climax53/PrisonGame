import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { advanceDay } from "../src/core/simulation";
import { applyAction, costs } from "../src/core/actions";
import { BALANCE } from "../src/core/balance";

describe("player actions", () => {
  it("accepts an intake offer, adding the prisoner and the bounty", () => {
    const s = createInitialState(1);
    advanceDay(s); // generates offers
    s.cellCapacity = 20; // ensure room
    const before = s.prisoners.length;
    const coinBefore = s.resources.coin;
    const offer = s.offers[0];
    const res = applyAction(s, { type: "acceptOffer", offerIndex: 0 });
    expect(res.ok).toBe(true);
    expect(s.prisoners.length).toBe(before + 1);
    expect(s.resources.coin).toBe(coinBefore + offer.acceptBounty);
  });

  it("refuses an offer when cells are full", () => {
    const s = createInitialState(1);
    advanceDay(s);
    s.cellCapacity = s.prisoners.filter((p) => p.alive).length; // full
    const res = applyAction(s, { type: "acceptOffer", offerIndex: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/full/i);
  });

  it("buys resources and deducts the correct coin", () => {
    const s = createInitialState(1);
    const coinBefore = s.resources.coin;
    const res = applyAction(s, { type: "buyResource", resource: "food", amount: 10 });
    expect(res.ok).toBe(true);
    expect(s.resources.food).toBe(BALANCE.start.food + 10);
    expect(s.resources.coin).toBe(coinBefore - costs.buyResource("food", 10));
  });

  it("blocks purchases the warden cannot afford", () => {
    const s = createInitialState(1);
    s.resources.coin = 0;
    const res = applyAction(s, { type: "buyResource", resource: "firewood", amount: 5 });
    expect(res.ok).toBe(false);
  });

  it("hires a guard for the listed cost", () => {
    const s = createInitialState(1);
    const before = s.guards.length;
    const coinBefore = s.resources.coin;
    const res = applyAction(s, { type: "hireGuard" });
    expect(res.ok).toBe(true);
    expect(s.guards.length).toBe(before + 1);
    expect(s.resources.coin).toBe(coinBefore - BALANCE.guards.hireCost);
  });

  it("expands cell capacity by the configured step", () => {
    const s = createInitialState(1);
    s.resources.coin = 100000;
    const before = s.cellCapacity;
    const res = applyAction(s, { type: "upgradeCapacity" });
    expect(res.ok).toBe(true);
    expect(s.cellCapacity).toBe(before + BALANCE.upgrade.capacityStep);
  });

  it("assigns labour to a prisoner", () => {
    const s = createInitialState(1);
    const p = s.prisoners[0];
    const res = applyAction(s, {
      type: "assignLabor",
      prisonerId: p.id,
      assignment: "woodcutting",
    });
    expect(res.ok).toBe(true);
    expect(p.assignment).toBe("woodcutting");
  });

  it("produces resources from conscripted labour over a day", () => {
    const s = createInitialState(1);
    // Put everyone on woodcutting and give plenty of food so they survive.
    s.resources.food = 999;
    s.resources.firewood = 0;
    for (const p of s.prisoners) p.assignment = "woodcutting";
    advanceDay(s);
    // Even after upkeep burns some, woodcutting output should leave firewood > 0.
    expect(s.resources.firewood).toBeGreaterThan(0);
  });

  it("rejects all actions once the game is over", () => {
    const s = createInitialState(1);
    s.gameOver = true;
    const res = applyAction(s, { type: "hireGuard" });
    expect(res.ok).toBe(false);
  });
});
