// Intake interviews, gendered names, cell placement, and night brawls.

import { describe, expect, it } from "vitest";
import { applyAction } from "../src/core/actions";
import { createPrisoner } from "../src/core/factory";
import { INTERVIEW_QUESTIONS, askQuestion, traitKnown } from "../src/core/interview";
import { FEMALE_NAMES, MALE_NAMES } from "../src/core/names";
import { Rng } from "../src/core/rng";
import { deserialize, serialize } from "../src/core/save";
import { advanceDay, cellConflictChance } from "../src/core/simulation";
import { createInitialState } from "../src/core/state";
import { applyDecision } from "../src/core/decisions";
import type { GameState, Prisoner, Severity, TraitId } from "../src/core/types";

/** Hand-built inmate for targeted scenarios (bypasses the factory). */
function mkPrisoner(
  id: string,
  overrides: Partial<Prisoner> & { severity?: Severity; trait?: TraitId } = {},
): Prisoner {
  return {
    id,
    name: `Inmate ${id}`,
    severity: "petty",
    rarity: "common",
    health: 90,
    unrest: 10,
    sentenceDays: 30,
    daysHeld: 1,
    assignment: "none",
    dailyPayout: 5,
    revealed: [],
    alive: true,
    ...overrides,
  };
}

// ── Gender-consistent names ──────────────────────────────────────────────────

describe("gendered prisoner names", () => {
  it("matches the portrait parity across 200 minted prisoners", () => {
    const s = createInitialState(101);
    const rng = new Rng(4242);
    for (let i = 0; i < 200; i++) {
      const p = createPrisoner(s, rng, "petty");
      // Exactly the parsing the UI uses for the portrait gender.
      const n = parseInt(p.id.split("_")[1] ?? "0", 10) || 0;
      const first = p.name.split(" ")[0];
      if (n % 2 === 0) {
        expect(MALE_NAMES, `id ${p.id} → ${p.name}`).toContain(first);
      } else {
        expect(FEMALE_NAMES, `id ${p.id} → ${p.name}`).toContain(first);
      }
    }
  });

  it("keeps the pools disjoint and big enough", () => {
    expect(MALE_NAMES.length).toBeGreaterThanOrEqual(30);
    expect(FEMALE_NAMES.length).toBeGreaterThanOrEqual(30);
    for (const n of MALE_NAMES) expect(FEMALE_NAMES).not.toContain(n);
  });
});

// ── movePrisoner ─────────────────────────────────────────────────────────────

describe("movePrisoner action", () => {
  it("moves a living prisoner to a free cell and logs it", () => {
    const s = createInitialState(7);
    const p = s.prisoners[0];
    const target = s.cellCapacity - 1;
    const res = applyAction(s, { type: "movePrisoner", prisonerId: p.id, cell: target });
    expect(res.ok).toBe(true);
    expect(p.cell).toBe(target);
    expect(s.log[s.log.length - 1].text).toContain(`moved to cell ${target + 1}`);
  });

  it("rejects occupied cells, out-of-range cells, and missing prisoners", () => {
    const s = createInitialState(7);
    const [a, b] = s.prisoners;
    expect(
      applyAction(s, { type: "movePrisoner", prisonerId: a.id, cell: b.cell! }).ok,
    ).toBe(false);
    expect(applyAction(s, { type: "movePrisoner", prisonerId: a.id, cell: -1 }).ok).toBe(false);
    expect(
      applyAction(s, { type: "movePrisoner", prisonerId: a.id, cell: s.cellCapacity }).ok,
    ).toBe(false);
    expect(applyAction(s, { type: "movePrisoner", prisonerId: "p_999", cell: 2 }).ok).toBe(false);
    a.alive = false;
    expect(applyAction(s, { type: "movePrisoner", prisonerId: a.id, cell: 2 }).ok).toBe(false);
  });

  it("lets a prisoner stay in their own cell (no self-collision)", () => {
    const s = createInitialState(7);
    const p = s.prisoners[0];
    expect(
      applyAction(s, { type: "movePrisoner", prisonerId: p.id, cell: p.cell! }).ok,
    ).toBe(true);
  });
});

// ── Intake interviews ────────────────────────────────────────────────────────

describe("intake interviews", () => {
  it("exposes a player-voiced question for every topic", () => {
    for (const topic of ["temper", "skills", "past"] as const) {
      expect(INTERVIEW_QUESTIONS[topic].label.length).toBeGreaterThan(0);
      expect(INTERVIEW_QUESTIONS[topic].question.length).toBeGreaterThan(0);
    }
  });

  it("the temper question reveals the trait by name and blurb", () => {
    const p = mkPrisoner("p_1", { trait: "brawler" });
    const answer = askQuestion(p, "temper");
    expect(answer).toContain("Brawler");
    expect(answer).toContain("Fists first");
    expect(p.revealed).toContain("temper");
  });

  it("a traitless inmate has no notable temperament", () => {
    const p = mkPrisoner("p_1");
    expect(askQuestion(p, "temper")).toContain("No notable temperament");
  });

  it("skills and past answers are derived from the prisoner", () => {
    const eager = mkPrisoner("p_1", { trait: "ironBack", health: 90 });
    expect(askQuestion(eager, "skills")).toMatch(/Eager hands/);
    const frail = mkPrisoner("p_2", { trait: "sickly", health: 30 });
    expect(askQuestion(frail, "skills")).toMatch(/Frail hands/);
    const runner = mkPrisoner("p_3", { trait: "escapeArtist", rarity: "epic" });
    const past = askQuestion(runner, "past");
    expect(past).toContain("watch this one");
    expect(past).toContain("A name known to the roads");
  });

  it("answers at most two topics, then refuses without revealing", () => {
    const p = mkPrisoner("p_1", { trait: "penitent" });
    askQuestion(p, "temper");
    askQuestion(p, "skills");
    const refusal = askQuestion(p, "past");
    expect(refusal).toBe("They've said all they'll say.");
    expect(p.revealed).toEqual(["temper", "skills"]);
    // Already-answered topics still repeat their answer.
    expect(askQuestion(p, "temper")).toContain("Penitent");
  });

  it("traitKnown: fresh false, after temper true, legacy (undefined) true", () => {
    const fresh = mkPrisoner("p_1", { trait: "brawler" });
    expect(traitKnown(fresh)).toBe(false);
    askQuestion(fresh, "temper");
    expect(traitKnown(fresh)).toBe(true);
    const legacy = mkPrisoner("p_2", { trait: "brawler" });
    delete legacy.revealed;
    expect(traitKnown(legacy)).toBe(true);
  });
});

// ── Cell compatibility & night brawls ────────────────────────────────────────

describe("cellConflictChance", () => {
  it("is pure and additive with a 0.5 cap", () => {
    const brawlerA = mkPrisoner("p_1", { trait: "brawler", severity: "violent", unrest: 70 });
    const brawlerB = mkPrisoner("p_2", { trait: "brawler", severity: "petty", unrest: 70 });
    expect(cellConflictChance(brawlerA, brawlerB)).toBe(0.5); // 0.3+0.18+0.1 capped

    const calmA = mkPrisoner("p_3", { trait: "brawler", unrest: 10 });
    const calmB = mkPrisoner("p_4", { trait: "brawler", unrest: 10 });
    expect(cellConflictChance(calmA, calmB)).toBeCloseTo(0.3);

    const hotA = mkPrisoner("p_5", { unrest: 70 });
    const hotB = mkPrisoner("p_6", { unrest: 70 });
    expect(cellConflictChance(hotA, hotB)).toBeCloseTo(0.18);

    const violent = mkPrisoner("p_7", { severity: "violent" });
    const petty = mkPrisoner("p_8", { severity: "petty" });
    expect(cellConflictChance(violent, petty)).toBeCloseTo(0.1);
    expect(cellConflictChance(petty, violent)).toBeCloseTo(0.1);

    const strangerA = mkPrisoner("p_9");
    const strangerB = mkPrisoner("p_10");
    expect(cellConflictChance(strangerA, strangerB)).toBe(0);
  });
});

/** A powder-keg keep: two brawlers side by side, a strong watch, full stores. */
function brawlKeep(seed: number, health: number): GameState {
  const s = createInitialState(1); // fixed build; only the night's dice vary
  s.rngState = seed;
  s.resources.coin = 5000;
  s.resources.food = 500;
  s.resources.firewood = 500;
  s.prisoners = [
    mkPrisoner("p_2", { trait: "brawler", severity: "violent", unrest: 70, health, cell: 0 }),
    mkPrisoner("p_4", { trait: "brawler", severity: "petty", unrest: 70, health, cell: 1 }),
  ];
  for (const g of s.guards) {
    g.skill = 100;
    g.fatigue = 0;
    g.morale = 100;
    g.brutality = 0; // keep the guards' clubs out of the death statistics
  }
  return s;
}

describe("night brawls", () => {
  it("adjacent brawlers fight, bleed, and across seeds someone dies — inmate and guard alike", () => {
    let fights = 0;
    let brokenUp = 0;
    let healthDrops = 0;
    let prisonerDeaths = 0;
    let guardDeaths = 0;

    for (let seed = 0; seed < 600; seed++) {
      const s = brawlKeep(seed, 15);
      const guardsBefore = s.guards.length;
      advanceDay(s);
      const logText = s.log.map((l) => l.text).join("\n");
      const fought = logText.includes("A fight breaks out between");
      const pulled = logText.includes("apart before the worst of it");
      if (fought) fights++;
      if (pulled) brokenUp++;
      if (fought || pulled) {
        if (s.prisoners.some((p) => p.alive && p.health < 15)) healthDrops++;
        if (logText.includes("dies in the cells")) prisonerDeaths++;
      }
      if (logText.includes("is killed breaking up the fight")) {
        guardDeaths++;
        expect(s.guards.length).toBeLessThan(guardsBefore);
      }
    }

    expect(fights).toBeGreaterThan(0);
    expect(brokenUp).toBeGreaterThan(0); // the watch does step in sometimes
    expect(healthDrops).toBeGreaterThan(0); // combatants visibly lose health
    expect(prisonerDeaths).toBeGreaterThan(0); // brawls can kill an inmate
    expect(guardDeaths).toBeGreaterThan(0); // and, rarely, a guard
  });

  it("non-adjacent prisoners never brawl", () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = brawlKeep(seed, 90);
      // Same powder-keg pair, but a knight's-move apart: cells 0 and 3 share
      // neither a row (0↔1) nor a column (0↔2).
      s.prisoners[1].cell = 3;
      advanceDay(s);
      const logText = s.log.map((l) => l.text).join("\n");
      expect(logText).not.toContain("A fight breaks out between");
      expect(logText).not.toContain("apart before the worst of it");
    }
  });
});

// ── Save v7 migration ────────────────────────────────────────────────────────

describe("save v7 migration", () => {
  it("marks pre-interview prisoners (and offers) as temper-known, then plays a day", () => {
    const s = createInitialState(31);
    advanceDay(s); // generates offers so the migration has both lists to touch
    if (s.pendingDecision) applyDecision(s, s.pendingDecision.options[0].id);
    const blob = JSON.parse(serialize(s));
    blob.version = 6;
    for (const p of blob.state.prisoners) delete p.revealed;
    for (const o of blob.state.offers ?? []) delete o.prisoner.revealed;

    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.prisoners.every((p) => traitKnown(p))).toBe(true);
    expect(restored.prisoners.every((p) => p.revealed?.includes("temper"))).toBe(true);
    expect(restored.offers.every((o) => o.prisoner.revealed?.includes("temper"))).toBe(true);

    const day = restored.day;
    advanceDay(restored);
    if (restored.pendingDecision) {
      applyDecision(restored, restored.pendingDecision.options[0].id);
    }
    expect(restored.day).toBe(day + 1);
    expect(Number.isFinite(restored.resources.coin)).toBe(true);
  });

  it("repair tolerates garbage revealed values", () => {
    const s = createInitialState(31);
    const blob = JSON.parse(serialize(s));
    blob.state.prisoners[0].revealed = "everything";
    blob.state.prisoners[1].revealed = ["temper", "nonsense", "temper"];
    const restored = deserialize(JSON.stringify(blob))!;
    expect(restored).not.toBeNull();
    expect(restored.prisoners[0].revealed).toEqual(["temper"]);
    expect(restored.prisoners[1].revealed).toEqual(["temper"]);
  });

  it("fresh prisoners start unrevealed and stay so through a round-trip", () => {
    const s = createInitialState(31);
    expect(s.prisoners.every((p) => p.revealed?.length === 0)).toBe(true);
    expect(s.prisoners.every((p) => !traitKnown(p))).toBe(true);
    const restored = deserialize(serialize(s))!;
    expect(restored.prisoners.every((p) => p.revealed?.length === 0)).toBe(true);
  });
});
