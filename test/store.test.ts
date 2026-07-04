// Store + profile monetization scaffolding tests. Pure node environment:
// profile.ts persists via localStorage, so we install a minimal in-memory
// polyfill before touching the module (Node 22 has no global localStorage).

class MemoryStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  getItem(key: string): string | null {
    return this.m.has(key) ? (this.m.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, String(value));
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
  clear(): void {
    this.m.clear();
  }
  key(index: number): string | null {
    return [...this.m.keys()][index] ?? null;
  }
}

if (!("localStorage" in globalThis)) {
  (globalThis as { localStorage?: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
}

import { beforeEach, describe, expect, it } from "vitest";
import { ACHIEVEMENTS, createInitialState, type AchievementDef } from "../src/core";
import {
  availableWardens,
  DAILY_CROWN_BOUNTY,
  getProfile,
  grantDailyCrowns,
  recordProgress,
  reloadProfile,
  type Profile,
} from "../src/ui/profile";
import {
  buyTheme,
  buyWardenUnlock,
  COIN_CONVERT_MIN,
  COIN_PER_CROWN,
  convertCrownsToCoin,
  setActiveTheme,
  THEMES,
  WARDEN_UNLOCK_COST,
} from "../src/ui/store";

/** Fresh profile via the module's own load/default path. */
function fresh(): Profile {
  localStorage.clear();
  return reloadProfile();
}

/** Crown bounty a def pays — tolerant of defs not carrying `crowns` yet. */
function bountyOf(id: string): number {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  return def ? ((def as AchievementDef & { crowns?: number }).crowns ?? 0) : 0;
}

beforeEach(() => {
  fresh();
});

describe("profile migration defaults", () => {
  it("repairs an old stored profile missing every monetization field", () => {
    localStorage.setItem(
      "wardens_keep_profile_v1",
      JSON.stringify({ achievements: ["longReign"], runsCompleted: 3, runsWon: 1, bestReign: 50 }),
    );
    const p = reloadProfile();
    expect(p.crowns).toBe(0);
    expect(p.crownsGrantedFor).toEqual([]);
    expect(p.ownedThemes).toEqual(["standard"]);
    expect(p.activeTheme).toBe("standard");
    expect(p.purchasedWardens).toEqual([]);
    expect(p.achievements).toEqual(["longReign"]);
  });

  it("resets an active theme that is not owned", () => {
    localStorage.setItem(
      "wardens_keep_profile_v1",
      JSON.stringify({ activeTheme: "midnight", ownedThemes: ["standard"] }),
    );
    expect(reloadProfile().activeTheme).toBe("standard");
  });
});

describe("buyTheme", () => {
  it("buys and applies a theme when crowns suffice", () => {
    const p = getProfile();
    p.crowns = 60;
    const res = buyTheme(p, "midnight");
    expect(res.ok).toBe(true);
    expect(p.crowns).toBe(0);
    expect(p.ownedThemes).toContain("midnight");
    expect(p.activeTheme).toBe("midnight");
  });

  it("rejects when crowns are insufficient", () => {
    const p = getProfile();
    p.crowns = 59;
    const res = buyTheme(p, "winterhold");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(p.crowns).toBe(59);
    expect(p.ownedThemes).not.toContain("winterhold");
  });

  it("rejects a duplicate purchase and an unknown theme", () => {
    const p = getProfile();
    p.crowns = 200;
    expect(buyTheme(p, "midnight").ok).toBe(true);
    const dup = buyTheme(p, "midnight");
    expect(dup.ok).toBe(false);
    expect(p.crowns).toBe(140); // charged exactly once
    expect(buyTheme(p, "gilded").ok).toBe(false);
  });

  it("standard is owned by default and cannot be re-bought", () => {
    const p = getProfile();
    expect(p.ownedThemes).toContain("standard");
    expect(buyTheme(p, "standard").ok).toBe(false);
  });
});

describe("setActiveTheme", () => {
  it("requires ownership", () => {
    const p = getProfile();
    const res = setActiveTheme(p, "midnight");
    expect(res.ok).toBe(false);
    expect(p.activeTheme).toBe("standard");
  });

  it("equips an owned theme and can return to standard", () => {
    const p = getProfile();
    p.crowns = 60;
    buyTheme(p, "midnight");
    expect(setActiveTheme(p, "standard").ok).toBe(true);
    expect(p.activeTheme).toBe("standard");
    expect(setActiveTheme(p, "midnight").ok).toBe(true);
    expect(p.activeTheme).toBe("midnight");
  });

  it("every catalog theme id is accepted once owned", () => {
    const p = getProfile();
    p.crowns = 999;
    for (const t of THEMES) {
      if (t.id !== "standard") buyTheme(p, t.id);
      expect(setActiveTheme(p, t.id).ok).toBe(true);
    }
  });
});

describe("buyWardenUnlock", () => {
  it("unlocks a locked warden and deducts exactly the cost", () => {
    const p = getProfile();
    p.crowns = WARDEN_UNLOCK_COST + 7;
    const res = buyWardenUnlock(p, "veteran");
    expect(res.ok).toBe(true);
    expect(p.crowns).toBe(7);
    expect(p.purchasedWardens).toEqual(["veteran"]);
    expect(availableWardens(p)).toContain("veteran");
  });

  it("rejects a warden already available by deeds", () => {
    const p = getProfile();
    p.crowns = 100;
    p.achievements = ["longReign"]; // unlocks veteran by play
    const res = buyWardenUnlock(p, "veteran");
    expect(res.ok).toBe(false);
    expect(p.crowns).toBe(100);
    expect(p.purchasedWardens).toEqual([]);
  });

  it("rejects the free warden, repeat purchases, and unknown ids", () => {
    const p = getProfile();
    p.crowns = 500;
    expect(buyWardenUnlock(p, "steward").ok).toBe(false); // always available
    expect(buyWardenUnlock(p, "merchant").ok).toBe(true);
    expect(buyWardenUnlock(p, "merchant").ok).toBe(false); // already bought
    expect(p.crowns).toBe(500 - WARDEN_UNLOCK_COST); // charged once
    expect(buyWardenUnlock(p, "archduke").ok).toBe(false);
  });

  it("rejects when crowns are insufficient", () => {
    const p = getProfile();
    p.crowns = WARDEN_UNLOCK_COST - 1;
    expect(buyWardenUnlock(p, "gambler").ok).toBe(false);
    expect(p.crowns).toBe(WARDEN_UNLOCK_COST - 1);
  });
});

describe("convertCrownsToCoin", () => {
  it("converts at the published rate and deducts crowns", () => {
    const p = getProfile();
    p.crowns = 12;
    const res = convertCrownsToCoin(p, 5);
    expect(res.ok).toBe(true);
    expect(res.coin).toBe(5 * COIN_PER_CROWN);
    expect(p.crowns).toBe(7);
  });

  it("enforces the minimum", () => {
    const p = getProfile();
    p.crowns = 100;
    const res = convertCrownsToCoin(p, COIN_CONVERT_MIN - 1);
    expect(res.ok).toBe(false);
    expect(res.coin).toBe(0);
    expect(p.crowns).toBe(100);
  });

  it("enforces the balance and rejects non-integer amounts", () => {
    const p = getProfile();
    p.crowns = 6;
    expect(convertCrownsToCoin(p, 7).ok).toBe(false);
    expect(convertCrownsToCoin(p, 5.5).ok).toBe(false);
    expect(p.crowns).toBe(6);
  });
});

describe("achievement crown grants (recordProgress)", () => {
  it("pays each earned achievement's bounty exactly once", () => {
    const p = getProfile();
    const state = createInitialState(2026);
    state.day = 50; // earns "longReign" (and possibly others per initial state)

    const fresh1 = recordProgress(state);
    expect(fresh1).toContain("longReign");
    expect(p.crownsGrantedFor).toEqual(expect.arrayContaining(p.achievements));
    const expected = p.achievements.reduce((sum, id) => sum + bountyOf(id), 0);
    expect(p.crowns).toBe(expected);

    // Same state again: no new achievements, no second payout, no dup ids.
    const before = p.crowns;
    const fresh2 = recordProgress(state);
    expect(fresh2).toEqual([]);
    expect(p.crowns).toBe(before);
    expect(new Set(p.crownsGrantedFor).size).toBe(p.crownsGrantedFor.length);
  });

  it("never re-pays after a reload (idempotence survives persistence)", () => {
    const state = createInitialState(7);
    state.day = 50;
    recordProgress(state);
    const saved = getProfile().crowns;
    const p2 = reloadProfile(); // re-read from storage, cache dropped
    recordProgress(state);
    expect(p2.crowns).toBe(saved);
  });
});

describe("grantDailyCrowns", () => {
  it("pays the flat bounty once per date", () => {
    expect(grantDailyCrowns("2026-07-04")).toBe(DAILY_CROWN_BOUNTY);
    expect(grantDailyCrowns("2026-07-04")).toBe(0);
    expect(getProfile().crowns).toBe(DAILY_CROWN_BOUNTY);
  });

  it("pays again on a new date and persists the marker", () => {
    grantDailyCrowns("2026-07-04");
    expect(grantDailyCrowns("2026-07-05")).toBe(DAILY_CROWN_BOUNTY);
    expect(getProfile().crowns).toBe(2 * DAILY_CROWN_BOUNTY);
    const p = reloadProfile();
    expect(p.lastDailyCrownDate).toBe("2026-07-05");
    expect(grantDailyCrowns("2026-07-05")).toBe(0);
  });
});
