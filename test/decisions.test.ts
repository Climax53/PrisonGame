import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { createPrisoner } from "../src/core/factory";
import { Rng } from "../src/core/rng";
import {
  applyDecision,
  buildBribeDecision,
  buildRiotDecision,
} from "../src/core/decisions";
import { advanceDay } from "../src/core/simulation";
import { applyAction } from "../src/core/actions";

/** Build a state with several prisoners for casualty tests. */
function crowdedState(seed: number) {
  const s = createInitialState(seed);
  const rng = new Rng(s.rngState);
  for (let i = 0; i < 4; i++) s.prisoners.push(createPrisoner(s, rng, "violent"));
  s.rngState = rng.state;
  return s;
}

describe("riot decision resolution", () => {
  it("'crush' kills up to the potential toll and clears the decision", () => {
    const s = crowdedState(1);
    const before = s.prisoners.filter((p) => p.alive).length;
    s.pendingDecision = buildRiotDecision(s, 3, 0.2);
    const out = applyDecision(s, "crush");
    expect(out.ok).toBe(true);
    expect(s.pendingDecision).toBeUndefined();
    const after = s.prisoners.filter((p) => p.alive).length;
    expect(before - after).toBeGreaterThanOrEqual(0);
    expect(before - after).toBeLessThanOrEqual(3);
    expect(out.deaths).toBe(before - after);
  });

  it("'negotiate' with enough coin spares all lives but costs coin", () => {
    const s = crowdedState(2);
    s.resources.coin = 1000;
    const coinBefore = s.resources.coin;
    const livingBefore = s.prisoners.filter((p) => p.alive).length;
    s.pendingDecision = buildRiotDecision(s, 3, 0.2);
    const out = applyDecision(s, "negotiate");
    expect(out.ok).toBe(true);
    expect(out.deaths).toBe(0);
    expect(s.prisoners.filter((p) => p.alive).length).toBe(livingBefore);
    expect(s.resources.coin).toBeLessThan(coinBefore);
  });

  it("'negotiate' with no coin causes some deaths", () => {
    const s = crowdedState(3);
    s.resources.coin = 0;
    const livingBefore = s.prisoners.filter((p) => p.alive).length;
    s.pendingDecision = buildRiotDecision(s, 4, 0.1);
    const out = applyDecision(s, "negotiate");
    expect(out.ok).toBe(true);
    expect(out.deaths).toBeGreaterThan(0);
    expect(s.prisoners.filter((p) => p.alive).length).toBeLessThan(livingBefore);
  });

  it("vents unrest across the survivors", () => {
    const s = crowdedState(4);
    for (const p of s.prisoners) p.unrest = 90;
    s.pendingDecision = buildRiotDecision(s, 2, 0.3);
    applyDecision(s, "waitItOut");
    for (const p of s.prisoners.filter((p) => p.alive)) {
      expect(p.unrest).toBeLessThan(90);
    }
  });
});

describe("bribe decision resolution", () => {
  function bribeState(seed: number) {
    const s = createInitialState(seed);
    const rng = new Rng(s.rngState);
    const noble = createPrisoner(s, rng, "noble");
    s.prisoners.push(noble);
    s.rngState = rng.state;
    return { s, noble };
  }

  it("'accept' adds the purse to coin", () => {
    const { s, noble } = bribeState(1);
    const coinBefore = s.resources.coin;
    s.pendingDecision = buildBribeDecision(s, noble, 60);
    const out = applyDecision(s, "accept");
    expect(out.ok).toBe(true);
    expect(s.resources.coin).toBe(coinBefore + 60);
    expect(s.pendingDecision).toBeUndefined();
  });

  it("'refuse' raises reputation and takes no coin", () => {
    const { s, noble } = bribeState(2);
    s.reputation = 50;
    const coinBefore = s.resources.coin;
    s.pendingDecision = buildBribeDecision(s, noble, 60);
    const out = applyDecision(s, "refuse");
    expect(out.ok).toBe(true);
    expect(s.reputation).toBeGreaterThan(50);
    expect(s.resources.coin).toBe(coinBefore);
  });
});

describe("decision framework guarantees", () => {
  it("rejects an invalid option id", () => {
    const s = createInitialState(1);
    s.pendingDecision = buildRiotDecision(s, 2, 0.2);
    const out = applyDecision(s, "not-an-option");
    expect(out.ok).toBe(false);
    expect(s.pendingDecision).toBeTruthy(); // unchanged
  });

  it("is deterministic given the same seed and choice", () => {
    const a = crowdedState(9);
    const b = crowdedState(9);
    a.pendingDecision = buildRiotDecision(a, 3, 0.2);
    b.pendingDecision = buildRiotDecision(b, 3, 0.2);
    applyDecision(a, "waitItOut");
    applyDecision(b, "waitItOut");
    expect(a).toEqual(b);
  });

  it("blocks advancing the day while a decision is pending", () => {
    const s = createInitialState(1);
    s.pendingDecision = buildRiotDecision(s, 2, 0.2);
    const dayBefore = s.day;
    advanceDay(s);
    expect(s.day).toBe(dayBefore); // no-op
  });

  it("blocks player actions while a decision is pending", () => {
    const s = createInitialState(1);
    s.pendingDecision = buildRiotDecision(s, 2, 0.2);
    const res = applyAction(s, { type: "hireGuard" });
    expect(res.ok).toBe(false);
  });

  it("a forced-riot day sets a pending decision that resolves cleanly", () => {
    // Drive unrest up until advanceDay produces a riot decision, then resolve.
    const s = createInitialState(7);
    s.guards = [];
    let raised = false;
    for (let i = 0; i < 60 && !raised; i++) {
      for (const p of s.prisoners) p.unrest = 100;
      advanceDay(s);
      if (s.pendingDecision) {
        expect(s.pendingDecision.kind).toBe("riot");
        const out = applyDecision(s, "crush");
        expect(out.ok).toBe(true);
        expect(s.pendingDecision).toBeUndefined();
        raised = true;
      }
      if (s.gameOver) break;
    }
    expect(raised).toBe(true);
  });
});
