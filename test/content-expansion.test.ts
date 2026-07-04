// ─────────────────────────────────────────────────────────────────────────────
// Content expansion — prisoner traits, the widened story deck, the minor auto
// events, tiered intake, and the v6 save schema.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/state";
import { createPrisoner, createGuard } from "../src/core/factory";
import { advanceDay, projectDay } from "../src/core/simulation";
import { resolveEvents } from "../src/core/events";
import { applyDecision } from "../src/core/decisions";
import { pickStoryDecision } from "../src/core/storyDecisions";
import { escapeChance } from "../src/core/danger";
import { prisonerRarityMods } from "../src/core/rarity";
import { TRAITS, TRAIT_IDS, traitDef } from "../src/core/traits";
import { wardenMods } from "../src/core/wardens";
import { serialize, deserialize, SAVE_VERSION } from "../src/core/save";
import { BALANCE } from "../src/core/balance";
import { Rng } from "../src/core/rng";
import type { GameState, PendingDecision, TraitId } from "../src/core/types";

// ── Traits ───────────────────────────────────────────────────────────────────

describe("prisoner traits", () => {
  it("defines all six traits with the designed numbers", () => {
    expect(TRAIT_IDS.sort()).toEqual(
      ["brawler", "escapeArtist", "ironBack", "penitent", "sickly", "silverTongue"].sort(),
    );
    const expected: Record<TraitId, [number, number, number, number, number]> = {
      // [payoutMult, unrestPerDay, healthPerDay, laborMult, escapeBonus]
      sickly: [1.0, 0, -2, 0.85, 0],
      brawler: [1.05, 2, 0, 1.1, 0],
      silverTongue: [1.25, -1, 0, 1.0, 0],
      escapeArtist: [1.35, 0, 0, 1.0, 0.015],
      penitent: [0.9, -2, 0, 1.0, 0],
      ironBack: [1.0, 0, -1, 1.35, 0],
    };
    for (const [id, [pay, unrest, health, labor, esc]] of Object.entries(expected)) {
      const t = TRAITS[id as TraitId];
      expect(t.id).toBe(id);
      expect(t.name.length).toBeGreaterThan(2);
      expect(t.blurb.length).toBeGreaterThan(10);
      expect(t.payoutMult).toBe(pay);
      expect(t.unrestPerDay).toBe(unrest);
      expect(t.healthPerDay).toBe(health);
      expect(t.laborMult).toBe(labor);
      expect(t.escapeBonus).toBe(esc);
    }
    expect(traitDef(undefined)).toBeUndefined();
    expect(traitDef("sickly")).toBe(TRAITS.sickly);
  });

  it("applies the trait payout multiplier at intake", () => {
    // Sweep freshly minted prisoners until a Silver-Tongue appears, then check
    // the locked payout against the exact intake formula.
    const s = createInitialState(17);
    const rng = new Rng(s.rngState);
    let checked = 0;
    for (let i = 0; i < 400 && checked < 3; i++) {
      const p = createPrisoner(s, rng, "petty");
      if (p.trait !== "silverTongue") continue;
      const repScale = 0.8 + (s.reputation / 100) * 0.5;
      const expected = Math.round(
        BALANCE.payout.petty *
          repScale *
          prisonerRarityMods(p.rarity).payoutMult *
          wardenMods(s).intakePayMult *
          TRAITS.silverTongue.payoutMult,
      );
      expect(p.dailyPayout).toBe(expected);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("rolls a trait for roughly half of intake (45% none)", () => {
    const s = createInitialState(23);
    const rng = new Rng(s.rngState);
    let traitless = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      if (createPrisoner(s, rng, "petty").trait === undefined) traitless++;
    }
    expect(traitless / n).toBeGreaterThan(0.35);
    expect(traitless / n).toBeLessThan(0.55);
  });

  it("Iron-Backed labour shows up in projectDay at exactly ×1.35", () => {
    const build = (trait?: TraitId): GameState => {
      const s = createInitialState(5);
      s.guards = []; // no wage noise
      s.prisoners = s.prisoners.slice(0, 1);
      const p = s.prisoners[0];
      p.rarity = "common";
      p.health = 100;
      p.assignment = "smithy";
      p.dailyPayout = 0; // isolate production from income
      p.trait = trait;
      return s;
    };
    const plain = projectDay(build(undefined));
    const iron = projectDay(build("ironBack"));
    expect(plain.coin).toBe(BALANCE.labor.smithy.yield);
    expect(iron.coin).toBe(Math.round(BALANCE.labor.smithy.yield * TRAITS.ironBack.laborMult));
  });

  it("each Escape Artist adds a flat +0.015 to the escape forecast", () => {
    const s = createInitialState(9);
    // The starters roll their own traits — clear them for a clean baseline.
    for (const p of s.prisoners) p.trait = undefined;
    const base = escapeChance(s);
    s.prisoners[0].trait = "escapeArtist";
    expect(escapeChance(s)).toBeCloseTo(base + 0.015, 6);
    s.prisoners[1].trait = "escapeArtist";
    expect(escapeChance(s)).toBeCloseTo(base + 0.03, 6);
  });

  it("the Gaol-Lunged lose 2 health overnight versus an identical twin", () => {
    const build = (trait?: TraitId): GameState => {
      const s = createInitialState(31);
      s.resources.food = 500;
      s.resources.firewood = 500;
      s.resources.coin = 500;
      for (const p of s.prisoners) {
        p.unrest = 0;
        p.health = 50;
      }
      s.prisoners[0].trait = trait;
      return s;
    };
    const sickly = build("sickly");
    const plain = build(undefined);
    const id = sickly.prisoners[0].id;
    advanceDay(sickly);
    advanceDay(plain);
    const a = sickly.prisoners.find((p) => p.id === id)!;
    const b = plain.prisoners.find((p) => p.id === id)!;
    expect(a.health).toBe(b.health + TRAITS.sickly.healthPerDay);
  });
});

// ── The six new story cards ──────────────────────────────────────────────────

/** A state where every card in the widened deck is eligible. */
function expandedState(seed: number): GameState {
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
  s.prisoners[s.prisoners.length - 1].health = 20; // condemnedConfession
  s.stats.totalDeaths = 1; // gravedigger
  s.day = 12; // harvestFestival / rivalWarden
  s.resources.food = 60;
  s.resources.coin = 300; // taxAssessor
  s.rngState = rng.state;
  return s;
}

const NEW_KINDS = [
  "witchTrial",
  "taxAssessor",
  "gravedigger",
  "harvestFestival",
  "condemnedConfession",
  "rivalWarden",
] as const;

/** Sweep seeds until each wanted kind has been drawn once; keep state+card. */
function collectCards(): Map<string, { s: GameState; d: PendingDecision }> {
  const found = new Map<string, { s: GameState; d: PendingDecision }>();
  for (let seed = 0; seed < 20000 && found.size < NEW_KINDS.length; seed++) {
    const s = expandedState(seed);
    const rng = new Rng(seed * 31 + 7);
    const d = pickStoryDecision(s, rng);
    if (!d || found.has(d.kind)) continue;
    if ((NEW_KINDS as readonly string[]).includes(d.kind)) found.set(d.kind, { s, d });
  }
  return found;
}

describe("the six new story cards", () => {
  const cards = collectCards();

  it("all six can be drawn from an eligible state", () => {
    expect([...cards.keys()].sort()).toEqual([...NEW_KINDS].sort());
  });

  it("every option of every new card resolves without corrupting state", () => {
    for (const [kind, { s, d }] of cards) {
      for (const opt of d.options) {
        const clone = structuredClone(s);
        clone.pendingDecision = structuredClone(d);
        const out = applyDecision(clone, opt.id);
        expect(out.ok, `${kind}/${opt.id}`).toBe(true);
        expect(Number.isFinite(clone.resources.coin)).toBe(true);
        expect(Number.isFinite(clone.morality)).toBe(true);
        expect(Number.isFinite(clone.reputation)).toBe(true);
        expect(clone.pendingDecision).toBeUndefined();
        expect(clone.stats.decisionsMade).toBe(1);
      }
    }
  });

  it("witchTrial: handing the inmate to the mob kills them and stains the soul", () => {
    const { s, d } = cards.get("witchTrial")!;
    const clone = structuredClone(s);
    clone.pendingDecision = structuredClone(d);
    const deaths = clone.stats.totalDeaths;
    const morality = clone.morality;
    applyDecision(clone, "handOver");
    expect(clone.stats.totalDeaths).toBe(deaths + 1);
    expect(clone.morality).toBeLessThan(morality);
    expect(clone.prisoners.some((p) => p.id === d.context.targetId)).toBe(false);
  });

  it("taxAssessor: opening the books costs 8% of the purse and earns favor", () => {
    const { s, d } = cards.get("taxAssessor")!;
    const clone = structuredClone(s);
    clone.pendingDecision = structuredClone(d);
    const coin = clone.resources.coin;
    const rep = clone.reputation;
    applyDecision(clone, "openBooks");
    expect(clone.resources.coin).toBe(coin - Math.round(coin * 0.08));
    expect(clone.reputation).toBeGreaterThan(rep);
  });

  it("gravedigger: selling the dead pays 40–80 coin and costs morality", () => {
    const { s, d } = cards.get("gravedigger")!;
    const offer = d.context.offer as number;
    expect(offer).toBeGreaterThanOrEqual(40);
    expect(offer).toBeLessThanOrEqual(80);
    const clone = structuredClone(s);
    clone.pendingDecision = structuredClone(d);
    const coin = clone.resources.coin;
    const morality = clone.morality;
    applyDecision(clone, "sell");
    expect(clone.resources.coin).toBe(coin + offer);
    expect(clone.morality).toBeLessThan(morality);
  });

  it("harvestFestival: the food gift drains 20 food and lifts reputation", () => {
    const { s, d } = cards.get("harvestFestival")!;
    const clone = structuredClone(s);
    clone.pendingDecision = structuredClone(d);
    const food = clone.resources.food;
    const rep = clone.reputation;
    applyDecision(clone, "gift");
    expect(clone.resources.food).toBeCloseTo(Math.max(0, food - 20), 1);
    expect(clone.reputation).toBeGreaterThan(rep);
  });

  it("condemnedConfession: recording it frees the dying inmate as a release", () => {
    const { s, d } = cards.get("condemnedConfession")!;
    const clone = structuredClone(s);
    clone.pendingDecision = structuredClone(d);
    const released = clone.stats.totalReleased;
    const morality = clone.morality;
    applyDecision(clone, "record");
    expect(clone.stats.totalReleased).toBe(released + 1);
    expect(clone.morality).toBeGreaterThan(morality);
    expect(clone.prisoners.some((p) => p.id === d.context.targetId)).toBe(false);
  });

  it("rivalWarden: selling fetches 8× the inmate's daily payout", () => {
    const { s, d } = cards.get("rivalWarden")!;
    const target = s.prisoners.find((p) => p.id === d.context.targetId)!;
    expect(d.context.price).toBe(target.dailyPayout * 8);
    const clone = structuredClone(s);
    clone.pendingDecision = structuredClone(d);
    const coin = clone.resources.coin;
    applyDecision(clone, "sell");
    expect(clone.resources.coin).toBe(coin + (d.context.price as number));
    expect(clone.prisoners.some((p) => p.id === d.context.targetId)).toBe(false);
  });
});

// ── The three new auto events ────────────────────────────────────────────────

describe("new minor auto events", () => {
  it("the wandering friar visits — healing the cells or stirring them up", () => {
    let sawFriar = false;
    for (let seed = 0; seed < 3000 && !sawFriar; seed++) {
      const s = createInitialState(seed);
      for (const p of s.prisoners) {
        p.unrest = 20;
        p.health = 60;
      }
      const rng = new Rng(s.rngState);
      const { events } = resolveEvents(s, rng);
      const ev = events.find((e) => e.kind === "friar");
      if (!ev) continue;
      sawFriar = true;
      // Either variant must have moved somebody's numbers.
      const touched = s.prisoners.some((p) => p.health !== 60 || p.unrest !== 20);
      expect(touched).toBe(true);
    }
    expect(sawFriar).toBe(true);
  });

  it("the crown audit skims 5% of a fat purse and credits clean books", () => {
    let sawAudit = false;
    for (let seed = 0; seed < 4000 && !sawAudit; seed++) {
      const s = createInitialState(seed);
      s.resources.coin = 1000;
      for (const p of s.prisoners) p.unrest = 0;
      const rng = new Rng(s.rngState);
      const { events } = resolveEvents(s, rng);
      const ev = events.find((e) => e.kind === "audit");
      if (!ev) continue;
      sawAudit = true;
      expect(ev.coinDelta).toBeLessThan(0);
      expect(ev.reputationDelta).toBe(1);
      expect(s.resources.coin).toBeLessThan(1000 + 100); // skim landed (other events may add a little)
    }
    expect(sawAudit).toBe(true);
  });

  it("a shiv search deflates the most restless inmate", () => {
    let sawShiv = false;
    for (let seed = 0; seed < 4000 && !sawShiv; seed++) {
      const s = createInitialState(seed);
      s.resources.coin = 50; // too poor for the audit branch
      s.prisoners[0].unrest = 45; // restless but under the riot threshold
      s.prisoners[1].unrest = 10;
      const rng = new Rng(s.rngState);
      const { events } = resolveEvents(s, rng);
      const ev = events.find((e) => e.kind === "shivFound");
      if (!ev) continue;
      sawShiv = true;
      expect(ev.reputationDelta).toBe(0.5);
      expect(ev.message).toContain(s.prisoners[0].name);
      expect(s.prisoners[0].unrest).toBeLessThan(45);
    }
    expect(sawShiv).toBe(true);
  });
});

// ── Tiered intake ────────────────────────────────────────────────────────────

describe("intake scales with tier", () => {
  it("a village keep sees 3 offers a day", () => {
    const s = createInitialState(3);
    advanceDay(s);
    expect(s.tier).toBe("village");
    expect(s.offers.length).toBe(BALANCE.intake.offersByTier.village);
    expect(s.offers.length).toBe(3);
  });

  it("a crown keep sees 5 offers a day", () => {
    const s = createInitialState(3);
    s.reputation = 95;
    s.resources.food = 500;
    s.resources.firewood = 500;
    advanceDay(s);
    expect(s.tier).toBe("crown");
    expect(s.offers.length).toBe(BALANCE.intake.offersByTier.crown);
    expect(s.offers.length).toBe(5);
  });
});

// ── Save v6 ──────────────────────────────────────────────────────────────────

describe("save v6 migration", () => {
  it("SAVE_VERSION is 7", () => {
    expect(SAVE_VERSION).toBe(7);
  });

  it("a v5 save (no traits anywhere) migrates, loads, and plays a day", () => {
    const s = createInitialState(13);
    const blob = JSON.parse(serialize(s));
    blob.version = 5;
    for (const p of blob.state.prisoners) delete p.trait;
    for (const o of blob.state.offers ?? []) delete o.prisoner.trait;
    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.prisoners.every((p) => p.trait === undefined)).toBe(true);
    advanceDay(restored);
    if (restored.pendingDecision) {
      applyDecision(restored, restored.pendingDecision.options[0].id);
    }
    expect(Number.isFinite(restored.resources.coin)).toBe(true);
    expect(restored.day).toBe(2);
  });

  it("repair drops garbage trait values instead of loading them", () => {
    const s = createInitialState(13);
    const blob = JSON.parse(serialize(s));
    blob.state.prisoners[0].trait = "dragonborn";
    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.prisoners[0].trait).toBeUndefined();
  });

  it("a current save round-trips with traits intact", () => {
    const s = createInitialState(13);
    s.prisoners[0].trait = "brawler";
    const restored = deserialize(serialize(s))!;
    expect(restored.prisoners[0].trait).toBe("brawler");
  });
});
