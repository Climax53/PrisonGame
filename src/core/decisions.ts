// ─────────────────────────────────────────────────────────────────────────────
// Decisions — the pause-and-choose moments
//
// The genre's most-loved mechanic is a hard choice with legible trade-offs. When
// a riot breaks out or a noble offers a bribe, the day pauses and the warden
// picks a response. The *effects* are deferred to the chosen option and applied
// here by applyDecision(), drawing from the seeded RNG so outcomes stay
// deterministic given (seed + choices).
//
// events.ts detects the trigger and calls a build*Decision() factory; the UI
// renders the PendingDecision; applyDecision() resolves it.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import type { Rng } from "./rng";
import { Rng as RngClass } from "./rng";
import { evaluateGameOver, killWeakestPrisoners, pushLog } from "./state";
import type { GameEvent, GameState, PendingDecision, Prisoner } from "./types";
import { clamp } from "./util";

const R = BALANCE.reputation;

function adjustReputation(state: GameState, delta: number): void {
  state.reputation = clamp(state.reputation + delta, R.min, R.max);
}

function ventUnrest(state: GameState, amount: number): void {
  for (const p of state.prisoners) {
    if (p.alive) p.unrest = clamp(p.unrest - amount, 0, 100);
  }
}

// ── Builders (called from events.ts during the daily tick) ───────────────────

/**
 * Build the riot decision. `potentialDeaths` captures how bloody the riot could
 * be if it runs unchecked; each option interprets it differently.
 */
export function buildRiotDecision(
  state: GameState,
  potentialDeaths: number,
  mitigation: number,
): PendingDecision {
  return {
    kind: "riot",
    day: state.day,
    prompt:
      "The cells erupt in riot — shouting, smoke, and the clang of bars. The warders look to you for orders.",
    options: [
      {
        id: "crush",
        label: "Crush it",
        hint: "Swift, bloody order. Deaths, and your name suffers.",
      },
      {
        id: "negotiate",
        label: "Negotiate",
        hint: "Buy off the ringleaders. Costs coin, spares lives.",
      },
      {
        id: "waitItOut",
        label: "Let it burn out",
        hint: "Bar the doors and wait. Fortune decides who lives.",
      },
    ],
    context: { potentialDeaths, mitigation },
  };
}

/** Build the bribe decision from a wealthy inmate. */
export function buildBribeDecision(
  state: GameState,
  briber: Prisoner,
  purse: number,
): PendingDecision {
  return {
    kind: "bribe",
    day: state.day,
    prompt: `${briber.name} presses a heavy purse into your hand — ${purse} coin to look the other way.`,
    options: [
      { id: "accept", label: "Pocket it", hint: `+${purse} coin. Risk of scandal.` },
      { id: "refuse", label: "Refuse", hint: "Incorruptible. Reputation rises." },
      {
        id: "extort",
        label: "Demand double",
        hint: "Greedy gamble — it may pay, or blow up in your face.",
      },
    ],
    context: { briberId: briber.id, briberName: briber.name, purse },
  };
}

// ── Resolution ───────────────────────────────────────────────────────────────

export interface DecisionOutcome {
  ok: boolean;
  error?: string;
  /** Player-facing summary of what happened (for a toast). */
  message?: string;
  tone?: "good" | "bad" | "neutral";
  deaths?: number;
}

/** Resolve the pending decision with the chosen option id. Mutates state. */
export function applyDecision(
  state: GameState,
  optionId: string,
): DecisionOutcome {
  const decision = state.pendingDecision;
  if (!decision) return { ok: false, error: "There is no decision to make." };
  if (!decision.options.some((o) => o.id === optionId)) {
    return { ok: false, error: "That is not a valid choice." };
  }

  const rng: Rng = new RngClass(state.rngState);
  let outcome: DecisionOutcome;

  if (decision.kind === "riot") {
    outcome = resolveRiot(state, rng, optionId, decision);
  } else {
    outcome = resolveBribe(state, rng, optionId, decision);
  }

  // Clear the dead from the roster and persist the RNG cursor.
  state.prisoners = state.prisoners.filter((p) => p.alive);
  state.rngState = rng.state;
  state.reputation = clamp(state.reputation, R.min, R.max);
  state.pendingDecision = undefined;

  // Mirror the outcome into the day's event list so the UI can flash it.
  if (outcome.message) {
    const ev: GameEvent = {
      kind: decision.kind,
      day: state.day,
      message: outcome.message,
      deaths: outcome.deaths ?? 0,
      reputationDelta: 0,
      coinDelta: 0,
    };
    state.lastEvents = [ev, ...state.lastEvents];
  }

  evaluateGameOver(state);
  return outcome;
}

function resolveRiot(
  state: GameState,
  rng: Rng,
  optionId: string,
  decision: PendingDecision,
): DecisionOutcome {
  const potential = decision.context.potentialDeaths as number;

  for (const g of state.guards) {
    g.fatigue = clamp(g.fatigue + BALANCE.guards.fatiguePerEvent, 0, 100);
  }

  if (optionId === "crush") {
    const deaths = killWeakestPrisoners(state, Math.round(potential), rng).length;
    ventUnrest(state, 35);
    // Bloodshed plus a brutality scandal on top of the per-death hit.
    adjustReputation(state, -(deaths * R.perDeath + 3));
    state.resources.coin -= 5 * deaths;
    const msg =
      deaths > 0
        ? `The warders club the riot down. ${deaths} dead, order restored — but tongues wag.`
        : "The warders club the riot down before blood is spilt.";
    pushLog(state, msg, "bad");
    return { ok: true, message: msg, tone: "bad", deaths };
  }

  if (optionId === "negotiate") {
    const cost = 30 + Math.round(potential) * 10;
    if (state.resources.coin >= cost) {
      state.resources.coin -= cost;
      ventUnrest(state, 25);
      adjustReputation(state, 1);
      const msg = `You buy off the ringleaders for ${cost} coin. No blood, and you look measured.`;
      pushLog(state, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral", deaths: 0 };
    }
    // Can't pay in full — a botched parley costs some lives.
    const deaths = killWeakestPrisoners(state, Math.ceil(potential / 2), rng).length;
    ventUnrest(state, 15);
    adjustReputation(state, -deaths * R.perDeath);
    const msg = `You haven't the coin to satisfy them. The parley fails — ${deaths} die in the chaos.`;
    pushLog(state, msg, "bad");
    return { ok: true, message: msg, tone: "bad", deaths };
  }

  // waitItOut — fortune decides.
  const deaths = killWeakestPrisoners(state, rng.int(0, Math.round(potential) + 1), rng).length;
  ventUnrest(state, 40);
  const damage = rng.int(0, 20);
  state.resources.coin -= damage;
  adjustReputation(state, -deaths * R.perDeath);
  const msg =
    deaths > 0
      ? `You wait it out. The riot spends itself — ${deaths} dead and ${damage} coin in damages.`
      : `You wait it out. By dawn the fury is spent, ${damage} coin in damages, and no one slain.`;
  pushLog(state, msg, deaths > 0 ? "bad" : "neutral");
  return { ok: true, message: msg, tone: deaths > 0 ? "bad" : "neutral", deaths };
}

function resolveBribe(
  state: GameState,
  rng: Rng,
  optionId: string,
  decision: PendingDecision,
): DecisionOutcome {
  const purse = decision.context.purse as number;
  const briberId = decision.context.briberId as string;
  const briber = state.prisoners.find((p) => p.id === briberId && p.alive);

  if (optionId === "accept") {
    state.resources.coin += purse;
    if (briber) briber.unrest = clamp(briber.unrest - 10, 0, 100);
    const scandal = rng.chance(0.3);
    if (scandal) {
      const hit = rng.int(3, 7);
      adjustReputation(state, -hit);
      const msg = `You pocket the ${purse} coin — but word slips out and your name suffers.`;
      pushLog(state, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    const msg = `You quietly pocket ${purse} coin. No one is the wiser.`;
    pushLog(state, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  }

  if (optionId === "refuse") {
    const gain = rng.int(2, 4);
    adjustReputation(state, gain);
    if (briber) briber.unrest = clamp(briber.unrest + 5, 0, 100);
    const msg = "You refuse the purse. An incorruptible warden — the magistrate will hear of it.";
    pushLog(state, msg, "good");
    return { ok: true, message: msg, tone: "good" };
  }

  // extort — demand double.
  if (rng.chance(0.5)) {
    state.resources.coin += purse * 2;
    const hit = rng.int(4, 8);
    adjustReputation(state, -hit);
    const msg = `Cowed, they pay ${purse * 2} coin — but such greed does not stay secret.`;
    pushLog(state, msg, "bad");
    return { ok: true, message: msg, tone: "bad" };
  }
  const hit = rng.int(5, 10);
  adjustReputation(state, -hit);
  // The insulted inmate and their peers seethe.
  for (const p of state.prisoners) {
    if (p.alive && (p.severity === "political" || p.severity === "noble")) {
      p.unrest = clamp(p.unrest + 8, 0, 100);
    }
  }
  const msg = "They refuse your greed and send word to the magistrate. A costly humiliation.";
  pushLog(state, msg, "bad");
  return { ok: true, message: msg, tone: "bad" };
}
