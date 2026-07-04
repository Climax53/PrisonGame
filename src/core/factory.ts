// Factories that mint prisoners, guards, and intake offers. All randomness flows
// through the seeded Rng and ids come from a monotonic counter, so nothing here
// touches Math.random — keeping the whole core replayable.

import { BALANCE } from "./balance";
import { randomGuardName, randomPrisonerName } from "./names";
import { guardRarityMods, prisonerRarityMods, rollRarity } from "./rarity";
import { TRAIT_IDS, traitDef } from "./traits";
import { wardenMods } from "./wardens";
import type { Rng } from "./rng";
import type {
  GameState,
  Guard,
  IntakeOffer,
  Prisoner,
  Severity,
  TraitId,
  WardenTier,
} from "./types";

/** Mint a unique id and bump the counter on state. */
export function mintId(state: GameState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}_${state.idCounter}`;
}

export function createPrisoner(
  state: GameState,
  rng: Rng,
  severity: Severity,
): Prisoner {
  const [minS, maxS] = BALANCE.sentence[severity];
  const w = wardenMods(state);
  // Mint the id FIRST: the UI picks the portrait's gender from id parity
  // (src/ui/art.ts prisonerPortraitKey), so the name pool must follow the same
  // parsing — even id → male, odd id → female.
  const id = mintId(state, "p");
  const male = (parseInt(id.split("_")[1] ?? "0", 10) || 0) % 2 === 0;
  const rarity = rollRarity(rng, state.tier, w.rarityTierShift);
  const mods = prisonerRarityMods(rarity);
  // Trait roll, immediately after rarity (draw order is load-bearing for
  // determinism): one chance() draw decides traitless (45%); if not, one pick()
  // draw selects uniformly from TRAIT_IDS.
  const trait: TraitId | undefined = rng.chance(0.45) ? undefined : rng.pick(TRAIT_IDS);
  // Reputation scales payout from 80% (rep 0) to 130% (rep 100); rarity then
  // multiplies it — a rare inmate is worth far more to the crown. The warden's
  // reputation for dealmaking (or lack of it) applies last, then the trait
  // (a Silver-Tongue talks the crown into a fatter stipend).
  const repScale = 0.8 + (state.reputation / 100) * 0.5;
  return {
    id,
    name: randomPrisonerName(rng, male),
    severity,
    rarity,
    trait,
    health: rng.int(70, 100),
    unrest: rng.int(5, 25),
    sentenceDays: rng.int(minS, maxS),
    daysHeld: 0,
    assignment: "none",
    // Fresh inmates arrive as strangers — the interview reveals them.
    revealed: [],
    dailyPayout: Math.round(
      BALANCE.payout[severity] * repScale * mods.payoutMult * w.intakePayMult *
        (traitDef(trait)?.payoutMult ?? 1),
    ),
    alive: true,
  };
}

export function createGuard(state: GameState, rng: Rng): Guard {
  const w = wardenMods(state);
  const rarity = rollRarity(rng, state.tier, w.rarityTierShift);
  const mods = guardRarityMods(rarity);
  return {
    id: mintId(state, "g"),
    name: randomGuardName(rng),
    rarity,
    skill: rng.int(mods.skill[0], mods.skill[1]),
    brutality: rng.int(mods.brutality[0], mods.brutality[1]),
    wage: Math.max(1, Math.round(BALANCE.guards.baseWage * mods.wageMult * w.wageMult)),
    fatigue: 0,
    morale: BALANCE.guardNeeds.moraleStart,
  };
}

/** Determine the current tier purely from reputation. */
export function tierForReputation(reputation: number): WardenTier {
  const t = BALANCE.tiers;
  if (reputation >= t.crown) return "crown";
  if (reputation >= t.city) return "city";
  if (reputation >= t.town) return "town";
  return "village";
}

/** Build a government intake offer for a given severity. */
export function createOffer(
  state: GameState,
  rng: Rng,
  severity: Severity,
): IntakeOffer {
  const prisoner = createPrisoner(state, rng, severity);
  const dailyPayout = prisoner.dailyPayout;
  return {
    prisoner,
    dailyPayout,
    acceptBounty: Math.round(
      dailyPayout * BALANCE.intake.bountyMultiplier * wardenMods(state).bountyMult,
    ),
  };
}
