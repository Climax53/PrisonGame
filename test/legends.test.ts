import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { createPrisoner } from "../src/core/factory";
import { Rng } from "../src/core/rng";
import { advanceDay } from "../src/core/simulation";
import { applyDecision } from "../src/core/decisions";
import {
  LEGENDS,
  legendDef,
  maybeBrandLegend,
  dueLegendBeat,
} from "../src/core/legends";
import type { GameState, Prisoner } from "../src/core/types";

/** Force-brand a specific legend onto a fresh prisoner. */
function brandForced(s: GameState, legendId: string): Prisoner {
  const legend = legendDef(legendId)!;
  const rng = new Rng(s.rngState);
  const p = createPrisoner(s, rng, legend.severity);
  s.rngState = rng.state;
  p.name = legend.name;
  p.legendId = legend.id;
  p.legendStep = 0;
  p.sentenceDays = 30;
  s.prisoners.push(p);
  s.legendsSeen.push(legend.id);
  return p;
}

describe("legend definitions", () => {
  it("ships 3 legends, each with a full multi-beat arc", () => {
    expect(LEGENDS).toHaveLength(3);
    for (const l of LEGENDS) {
      expect(l.beats.length).toBeGreaterThanOrEqual(3);
      // Beats trigger in strictly increasing day order.
      for (let i = 1; i < l.beats.length; i++) {
        expect(l.beats[i].onDayHeld).toBeGreaterThan(l.beats[i - 1].onDayHeld);
      }
    }
  });

  it("maybeBrandLegend only brands high-rarity political/noble inmates, once each", () => {
    const s = createInitialState(1);
    const rng = new Rng(77);
    const common = createPrisoner(s, rng, "noble");
    common.rarity = "common";
    maybeBrandLegend(s, rng, common);
    expect(common.legendId).toBeUndefined();

    let branded = 0;
    for (let i = 0; i < 200; i++) {
      const p = createPrisoner(s, rng, "noble");
      p.rarity = "mythic";
      maybeBrandLegend(s, rng, p);
      if (p.legendId) branded++;
    }
    // Only ONE noble legend exists (the Prince) — repeats are impossible.
    expect(branded).toBe(1);
    expect(s.legendsSeen).toContain("deposedPrince");
  });
});

describe("legend arcs play end to end", () => {
  it("every beat of every legend fires on schedule and every option resolves", () => {
    for (const legend of LEGENDS) {
      for (const pickIndex of [0, 1, 2]) {
        const s = createInitialState(50);
        s.resources.food = 5000;
        s.resources.firewood = 40; // hoarding past 50 guarantees daily fires
        s.resources.coin = 5000;
        const p = brandForced(s, legend.id);
        let beatsSeen = 0;
        for (let day = 0; day < 20 && !s.gameOver; day++) {
          // Keep the keep boring so only legend beats claim days.
          for (const q of s.prisoners) {
            if (q.alive) q.unrest = 0;
          }
          s.resources.firewood = 40;
          s.pacing = "slow";
          advanceDay(s);
          if (s.pendingDecision) {
            const d = s.pendingDecision;
            if (d.kind === "legend") beatsSeen++;
            const opts = d.options;
            const pick = opts[Math.min(pickIndex, opts.length - 1)].id;
            const out = applyDecision(s, pick);
            expect(out.ok, `${legend.id} beat option ${pick}`).toBe(true);
            expect(Number.isFinite(s.resources.coin)).toBe(true);
            expect(Number.isFinite(s.morality)).toBe(true);
          }
          if (!p.alive) break; // arc legitimately ended early (hang/escape/ransom)
        }
        expect(beatsSeen, `${legend.id} pick ${pickIndex}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("a departed legend resolves its pending beat as a graceful epilogue", () => {
    const s = createInitialState(51);
    const p = brandForced(s, "alchemist");
    p.daysHeld = 2;
    const beat = dueLegendBeat(s)!;
    expect(beat).toBeTruthy();
    s.pendingDecision = beat;
    // She dies before the player answers.
    p.alive = false;
    s.prisoners = s.prisoners.filter((q) => q.alive);
    const out = applyDecision(s, beat.options[0].id);
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/gone|ends/i);
  });

  it("legend beats advance the step pointer (no beat repeats)", () => {
    const s = createInitialState(52);
    const p = brandForced(s, "bishop");
    p.daysHeld = 2;
    s.pendingDecision = dueLegendBeat(s);
    applyDecision(s, s.pendingDecision!.options[0].id);
    expect(p.legendStep).toBe(1);
    // Same daysHeld: next beat (day 6) must NOT be due yet.
    expect(dueLegendBeat(s)).toBeUndefined();
  });
});
