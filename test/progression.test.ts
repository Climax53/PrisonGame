import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { tierForReputation } from "../src/core/factory";
import { BALANCE } from "../src/core/balance";

describe("reputation tiers", () => {
  it("maps reputation thresholds to the right tier", () => {
    expect(tierForReputation(0)).toBe("village");
    expect(tierForReputation(29)).toBe("village");
    expect(tierForReputation(30)).toBe("town");
    expect(tierForReputation(54)).toBe("town");
    expect(tierForReputation(55)).toBe("city");
    expect(tierForReputation(79)).toBe("city");
    expect(tierForReputation(80)).toBe("crown");
    expect(tierForReputation(100)).toBe("crown");
  });

  it("higher tiers can send more valuable prisoners", () => {
    const valueOf: Record<string, number> = {
      petty: 1,
      violent: 2,
      political: 3,
      noble: 4,
    };
    const maxValue = (tier: keyof typeof BALANCE.tierIntake) =>
      Math.max(...BALANCE.tierIntake[tier].map((s) => valueOf[s]));
    expect(maxValue("village")).toBeLessThan(maxValue("crown"));
    expect(maxValue("town")).toBeLessThanOrEqual(maxValue("city"));
  });

  it("reaching a higher reputation unlocks a better intake pool over a run", () => {
    const s = createInitialState(1);
    s.reputation = 90; // crown tier
    s.tier = tierForReputation(s.reputation);
    expect(s.tier).toBe("crown");
    expect(BALANCE.tierIntake[s.tier]).toContain("noble");
  });
});
