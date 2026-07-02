import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { createPrisoner, createGuard } from "../src/core/factory";
import { Rng } from "../src/core/rng";
import { advanceDay } from "../src/core/simulation";
import { applyDecision } from "../src/core/decisions";
import { pickStoryDecision, STORY_KINDS } from "../src/core/storyDecisions";
import { checkVictory, endingFor, pickVictoryEnding } from "../src/core/endings";
import { BALANCE } from "../src/core/balance";
import { serialize, deserialize } from "../src/core/save";
import type { GameState } from "../src/core/types";

/** A state where every story card is eligible. */
function richState(seed: number): GameState {
  const s = createInitialState(seed);
  const rng = new Rng(s.rngState);
  s.prisoners.push(createPrisoner(s, rng, "noble"));
  s.prisoners.push(createPrisoner(s, rng, "political"));
  s.prisoners.push(createPrisoner(s, rng, "violent"));
  s.guards.push(createGuard(s, rng));
  for (const p of s.prisoners) {
    p.unrest = 70;
    p.health = 40;
  }
  s.resources.food = 60;
  s.resources.coin = 300;
  s.rngState = rng.state;
  return s;
}

describe("story decisions", () => {
  it("the deck offers 8 distinct kinds", () => {
    expect(new Set(STORY_KINDS).size).toBe(8);
  });

  it("every card can fire and every option resolves without corruption", () => {
    const seen = new Set<string>();
    // Sweep seeds until each kind has fired at least once; resolve EVERY option
    // of each fired card on cloned states.
    for (let seed = 0; seed < 4000 && seen.size < 8; seed++) {
      const s = richState(seed);
      const rng = new Rng(seed * 31 + 7);
      const d = pickStoryDecision(s, rng);
      if (!d || seen.has(d.kind)) continue;
      seen.add(d.kind);
      for (const opt of d.options) {
        const clone = structuredClone(s);
        clone.pendingDecision = structuredClone(d);
        const out = applyDecision(clone, opt.id);
        expect(out.ok, `${d.kind}/${opt.id}`).toBe(true);
        expect(Number.isFinite(clone.resources.coin)).toBe(true);
        expect(Number.isFinite(clone.morality)).toBe(true);
        expect(clone.pendingDecision).toBeUndefined();
        expect(clone.stats.decisionsMade).toBe(1);
      }
    }
    expect([...seen].sort()).toEqual([...STORY_KINDS].sort());
  });

  it("cards respect eligibility (no noble visit without a noble)", () => {
    const s = createInitialState(1); // two petty starters only
    s.guards = [];
    s.resources.food = 5;
    s.resources.coin = 5;
    for (const p of s.prisoners) {
      p.unrest = 0;
      p.health = 100;
    }
    // Only 'duel' (2 living prisoners) can be eligible here.
    for (let i = 0; i < 500; i++) {
      const rng = new Rng(i);
      const d = pickStoryDecision(s, rng);
      if (d) expect(d.kind).toBe("duel");
    }
  });

  it("resolution is deterministic given the same seed and choice", () => {
    const build = () => {
      const s = richState(42);
      const rng = new Rng(s.rngState);
      s.pendingDecision = pickStoryDecisionForced(s, rng);
      return s;
    };
    const a = build();
    const b = build();
    if (a.pendingDecision && b.pendingDecision) {
      applyDecision(a, a.pendingDecision.options[1].id);
      applyDecision(b, b.pendingDecision.options[1].id);
      expect(a).toEqual(b);
    }
  });
});

/** Force a pick by retrying the base chance until a card fires. */
function pickStoryDecisionForced(s: GameState, rng: Rng) {
  for (let i = 0; i < 200; i++) {
    const d = pickStoryDecision(s, rng);
    if (d) return d;
  }
  return undefined;
}

describe("victory & endings", () => {
  it("holding crown tier for the required days wins the run", () => {
    const s = createInitialState(5);
    s.reputation = 90;
    s.tier = "crown";
    s.crownDays = BALANCE.victory.crownDaysRequired - 1;
    checkVictory(s);
    expect(s.gameOver).toBe(true);
    expect(s.gameWon).toBe(true);
    expect(s.endingId).toBeTruthy();
    expect(s.pendingDecision).toBeUndefined();
  });

  it("dropping below crown resets the victory clock", () => {
    const s = createInitialState(5);
    s.tier = "city";
    s.crownDays = 20;
    checkVictory(s);
    expect(s.crownDays).toBe(0);
    expect(s.gameOver).toBe(false);
  });

  it("the victory flavor reflects the reign: tyrant, saint, merchant, default", () => {
    const s = createInitialState(5);
    s.morality = -80;
    expect(pickVictoryEnding(s).id).toBe("ironWarden");
    s.morality = 80;
    expect(pickVictoryEnding(s).id).toBe("shepherd");
    s.morality = 0;
    s.resources.coin = 2000;
    expect(pickVictoryEnding(s).id).toBe("coinCounter");
    s.resources.coin = 100;
    expect(pickVictoryEnding(s).id).toBe("crownKeeper");
  });

  it("loss endings carry themed ids and endingFor resolves them", () => {
    const s = createInitialState(5);
    s.reputation = 3;
    advanceDayUntilOver(s);
    expect(s.endingId).toBe("disgraced");
    const e = endingFor(s);
    expect(e.won).toBe(false);
    expect(e.title).toMatch(/Disgraced/);
  });

  it("a won game's ending survives save/load", () => {
    const s = createInitialState(5);
    s.reputation = 90;
    s.tier = "crown";
    s.crownDays = BALANCE.victory.crownDaysRequired - 1;
    checkVictory(s);
    const restored = deserialize(serialize(s))!;
    expect(restored.gameWon).toBe(true);
    expect(endingFor(restored).won).toBe(true);
  });
});

function advanceDayUntilOver(s: GameState): void {
  // Starve and freeze the keep so collapse is certain, not seed-lucky.
  for (let i = 0; i < 60 && !s.gameOver; i++) {
    s.resources.food = 0;
    s.resources.firewood = 0;
    advanceDay(s);
    if (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
  }
}

describe("new auto events", () => {
  it("harsh winter doubles firewood consumption while active", () => {
    const a = createInitialState(7);
    const b = createInitialState(7);
    b.winterDaysLeft = 3;
    // Kill randomness influence: rich stores, calm cells, no guards' wage noise.
    for (const st of [a, b]) {
      st.resources.food = 500;
      st.resources.firewood = 500;
      st.resources.coin = 500;
      for (const p of st.prisoners) p.unrest = 0;
    }
    const livingA = a.prisoners.filter((p) => p.alive).length;
    advanceDay(a);
    advanceDay(b);
    const burnedA = 500 - a.resources.firewood;
    const burnedB = 500 - b.resources.firewood;
    // Winter must burn at least the extra base need more (labour may add wood,
    // but both states share the same seed so production is identical).
    expect(burnedB - burnedA).toBeCloseTo(livingA * BALANCE.upkeep.firewoodPerPrisoner, 1);
    expect(b.winterDaysLeft).toBe(2); // thaws daily
  });

  it("royal amnesty frees all petty prisoners and counts them released", () => {
    // Sweep seeds for the amnesty event.
    for (let seed = 0; seed < 800; seed++) {
      const s = createInitialState(seed);
      s.resources.food = 500;
      s.resources.firewood = 500;
      for (const p of s.prisoners) p.unrest = 0;
      const petty = s.prisoners.filter((p) => p.alive && p.severity === "petty").length;
      if (petty === 0) continue;
      advanceDay(s);
      const amnesty = s.lastEvents.find((e) => e.kind === "amnesty");
      if (amnesty) {
        expect(s.prisoners.filter((p) => p.alive && p.severity === "petty")).toHaveLength(0);
        expect(s.stats.totalReleased).toBeGreaterThanOrEqual(petty);
        return;
      }
    }
    throw new Error("amnesty never fired in 800 seeds");
  });

  it("the bard rewards calm keeps and punishes squalid ones", () => {
    let sawGood = false;
    let sawBad = false;
    for (let seed = 0; seed < 1500 && !(sawGood && sawBad); seed++) {
      const calm = createInitialState(seed);
      calm.resources.food = 500;
      calm.resources.firewood = 500;
      for (const p of calm.prisoners) p.unrest = 0;
      advanceDay(calm);
      const ev = calm.lastEvents.find((e) => e.kind === "bard");
      if (ev && ev.reputationDelta > 0) sawGood = true;

      const squalid = createInitialState(seed + 9000);
      squalid.resources.food = 500;
      squalid.resources.firewood = 500;
      for (const p of squalid.prisoners) p.unrest = 95;
      advanceDay(squalid);
      const ev2 = squalid.lastEvents.find((e) => e.kind === "bard");
      if (ev2 && ev2.reputationDelta < 0) sawBad = true;
    }
    expect(sawGood).toBe(true);
    expect(sawBad).toBe(true);
  });

  it("rat plague spoils food", () => {
    for (let seed = 0; seed < 800; seed++) {
      const s = createInitialState(seed);
      s.resources.food = 100;
      s.resources.firewood = 500;
      for (const p of s.prisoners) p.unrest = 0;
      advanceDay(s);
      const ev = s.lastEvents.find((e) => e.kind === "ratPlague");
      if (ev) {
        expect(s.resources.food).toBeLessThan(100);
        return;
      }
    }
    throw new Error("rat plague never fired in 800 seeds");
  });
});

describe("save v3 migration", () => {
  it("a v2 save (no stats/crownDays/winter) migrates and plays", () => {
    const s = createInitialState(11);
    const blob = JSON.parse(serialize(s));
    blob.version = 2;
    delete blob.state.stats;
    delete blob.state.crownDays;
    delete blob.state.winterDaysLeft;
    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.stats.totalDeaths).toBe(0);
    expect(restored.crownDays).toBe(0);
    advanceDay(restored);
    expect(Number.isFinite(restored.resources.coin)).toBe(true);
  });
});
