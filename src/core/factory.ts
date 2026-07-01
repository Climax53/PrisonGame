// Factories that mint prisoners, guards, and intake offers. All randomness flows
// through the seeded Rng and ids come from a monotonic counter, so nothing here
// touches Math.random — keeping the whole core replayable.

import { BALANCE } from "./balance";
import { randomGuardName, randomPrisonerName } from "./names";
import type { Rng } from "./rng";
import type {
  GameState,
  Guard,
  IntakeOffer,
  Prisoner,
  Severity,
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
  // Reputation scales payout from 80% (rep 0) to 130% (rep 100).
  const repScale = 0.8 + (state.reputation / 100) * 0.5;
  return {
    id: mintId(state, "p"),
    name: randomPrisonerName(rng),
    severity,
    health: rng.int(70, 100),
    unrest: rng.int(5, 25),
    sentenceDays: rng.int(minS, maxS),
    daysHeld: 0,
    assignment: "none",
    dailyPayout: Math.round(BALANCE.payout[severity] * repScale),
    alive: true,
  };
}

export function createGuard(state: GameState, rng: Rng): Guard {
  return {
    id: mintId(state, "g"),
    name: randomGuardName(rng),
    skill: rng.int(30, 70),
    brutality: rng.int(20, 60),
    wage: BALANCE.guards.baseWage,
    fatigue: 0,
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
    acceptBounty: Math.round(dailyPayout * BALANCE.intake.bountyMultiplier),
  };
}
