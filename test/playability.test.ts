// ─────────────────────────────────────────────────────────────────────────────
// Playability harness — machine-plays the whole game
//
// Unit tests prove pieces work; this proves the GAME works. Bot wardens with
// different personalities (prudent, cruel, kind, greedy, passive) play long
// runs across many seeds. We assert the simulation never corrupts (no NaN, no
// negative-impossible values, no stuck states) and that the difficulty curve is
// real: a sensible player survives, a negligent one eventually falls.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { advanceDay } from "../src/core/simulation";
import { applyAction } from "../src/core/actions";
import { applyDecision } from "../src/core/decisions";
import { livingPrisoners } from "../src/core/state";
import type { GameState } from "../src/core/types";

type Bot = (s: GameState) => void;

/** Assert the state is numerically sane. Throws with context if corrupted. */
function assertSane(s: GameState, label: string): void {
  const nums: Array<[string, number]> = [
    ["coin", s.resources.coin],
    ["food", s.resources.food],
    ["firewood", s.resources.firewood],
    ["buckets", s.resources.buckets],
    ["reputation", s.reputation],
    ["morality", s.morality],
    ["day", s.day],
  ];
  for (const [name, v] of nums) {
    if (!Number.isFinite(v)) throw new Error(`${label}: ${name} is ${v} on day ${s.day}`);
  }
  if (s.reputation < 0 || s.reputation > 100) throw new Error(`${label}: reputation ${s.reputation}`);
  if (s.morality < -100 || s.morality > 100) throw new Error(`${label}: morality ${s.morality}`);
  for (const p of s.prisoners) {
    if (!Number.isFinite(p.unrest) || !Number.isFinite(p.health)) {
      throw new Error(`${label}: prisoner ${p.id} corrupt on day ${s.day}`);
    }
  }
  if (livingPrisoners(s) > s.cellCapacity + 2) {
    throw new Error(`${label}: impossible overcrowd ${livingPrisoners(s)}/${s.cellCapacity}`);
  }
}

/** Play one full run. Returns the day reached and how it ended. */
function playRun(
  seed: number,
  bot: Bot,
  decisionPick: (s: GameState) => string,
  maxDays = 200,
): { day: number; won: boolean; lost: boolean } {
  const s = createInitialState(seed);
  for (let i = 0; i < maxDays && !s.gameOver; i++) {
    bot(s);
    advanceDay(s);
    if (s.pendingDecision) {
      const out = applyDecision(s, decisionPick(s));
      expect(out.ok).toBe(true);
    }
    assertSane(s, `seed ${seed}`);
  }
  return { day: s.day, won: !!s.gameWon, lost: s.gameOver && !s.gameWon };
}

// ── Bot personalities ─────────────────────────────────────────────────────────

/** Does literally nothing but end the day. */
const passiveBot: Bot = () => {};

/** Sensible management: keep stocks, staff up, take safe intake, work inmates. */
const prudentBot: Bot = (s) => {
  const living = livingPrisoners(s);
  if (s.resources.food < living * 3 && s.resources.coin > 40) {
    applyAction(s, { type: "buyResource", resource: "food", amount: 10 });
  }
  if (s.resources.firewood < living * 2 && s.resources.coin > 40) {
    applyAction(s, { type: "buyResource", resource: "firewood", amount: 10 });
  }
  if (s.resources.buckets * 2 < living && s.resources.coin > 60) {
    applyAction(s, { type: "buyResource", resource: "buckets", amount: 2 });
  }
  if (s.guards.length < Math.ceil(living / 3) && s.resources.coin > 150) {
    applyAction(s, { type: "hireGuard" });
  }
  // Accept intake while there's comfortable room.
  while (s.offers.length > 0 && livingPrisoners(s) < s.cellCapacity - 1) {
    if (!applyAction(s, { type: "acceptOffer", offerIndex: 0 }).ok) break;
  }
  // Keep the kitchen and woodpile staffed by the healthiest inmates.
  const idle = s.prisoners.filter((p) => p.alive && p.assignment === "none" && p.health > 60);
  for (const [i, p] of idle.entries()) {
    applyAction(s, {
      type: "assignLabor",
      prisonerId: p.id,
      assignment: i % 2 === 0 ? "kitchen" : "woodcutting",
    });
  }
};

/** Accepts everything, spends nothing — chasing coin into ruin. */
const greedyBot: Bot = (s) => {
  while (s.offers.length > 0) {
    if (!applyAction(s, { type: "acceptOffer", offerIndex: 0 }).ok) break;
  }
  for (const p of s.prisoners) {
    if (p.alive && p.assignment === "none") {
      applyAction(s, { type: "assignLabor", prisonerId: p.id, assignment: "smithy" });
    }
  }
};

/** Pick a preferred option when present, else the first option on the card —
 * story decisions have their own option ids, so pickers must never assume. */
const pickOption = (s: GameState, preferred: Record<string, string>): string => {
  const d = s.pendingDecision!;
  const want = preferred[d.kind];
  if (want && d.options.some((o) => o.id === want)) return want;
  return d.options[0].id;
};

const crushRiots = (s: GameState) =>
  pickOption(s, { riot: "crush", bribe: "extort" });
const talkRiots = (s: GameState) =>
  pickOption(s, { riot: "negotiate", bribe: "refuse" });

// ── The suite ────────────────────────────────────────────────────────────────

describe("machine-played full runs never corrupt", () => {
  it("prudent warden, 20 seeds × up to 200 days", () => {
    for (let seed = 1; seed <= 20; seed++) playRun(seed, prudentBot, talkRiots);
  });

  it("cruel warden (crush/extort), 15 seeds", () => {
    for (let seed = 1; seed <= 15; seed++) playRun(seed * 7, prudentBot, crushRiots);
  });

  it("greedy warden (accept-all, no upkeep), 15 seeds", () => {
    for (let seed = 1; seed <= 15; seed++) playRun(seed * 13, greedyBot, crushRiots);
  });

  it("passive warden (no actions at all), 15 seeds", () => {
    for (let seed = 1; seed <= 15; seed++) playRun(seed * 31, passiveBot, talkRiots);
  });
});

describe("difficulty curve is real", () => {
  it("a prudent warden usually thrives (wins the run or reigns 100+ days)", () => {
    let thrived = 0;
    const runs = 12;
    for (let seed = 1; seed <= runs; seed++) {
      const r = playRun(seed * 3, prudentBot, talkRiots, 100);
      if (r.won || r.day >= 100) thrived++;
    }
    // Sensible play must be viable — most runs win or are still reigning at 100.
    expect(thrived).toBeGreaterThanOrEqual(Math.ceil(runs * 0.6));
  });

  it("victory is genuinely reachable: prudent play wins within 200 days in most seeds", () => {
    let victories = 0;
    const runs = 10;
    for (let seed = 1; seed <= runs; seed++) {
      if (playRun(seed * 11, prudentBot, talkRiots, 200).won) victories++;
    }
    expect(victories).toBeGreaterThanOrEqual(Math.ceil(runs * 0.5));
  });

  it("greedy neglect eventually loses (the game has teeth)", () => {
    let losses = 0;
    const runs = 12;
    for (let seed = 1; seed <= runs; seed++) {
      const s = createInitialState(seed * 17);
      for (let i = 0; i < 200 && !s.gameOver; i++) {
        greedyBot(s);
        advanceDay(s);
        if (s.pendingDecision) applyDecision(s, crushRiots(s));
      }
      if (s.gameOver) losses++;
    }
    // Mismanagement must be punished in a majority of runs.
    expect(losses).toBeGreaterThanOrEqual(Math.ceil(runs * 0.5));
  });

  it("progression is reachable: a prudent warden can climb past village tier", () => {
    let climbed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createInitialState(seed * 5);
      for (let i = 0; i < 150 && !s.gameOver; i++) {
        prudentBot(s);
        advanceDay(s);
        if (s.pendingDecision) applyDecision(s, talkRiots(s));
      }
      if (s.tier !== "village") climbed++;
    }
    expect(climbed).toBeGreaterThanOrEqual(6);
  });
});
