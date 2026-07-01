// ─────────────────────────────────────────────────────────────────────────────
// Player actions
//
// Everything the player can do *between* day-ticks routes through applyAction().
// Each action validates against the current state and returns a small result so
// the UI can surface failures (not enough coin, no free cell, etc.) without the
// core ever throwing.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import { createGuard, tierForReputation } from "./factory";
import { Rng } from "./rng";
import { livingPrisoners, pushLog } from "./state";
import type { GameState, PlayerAction } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok: ActionResult = { ok: true };

export function applyAction(state: GameState, action: PlayerAction): ActionResult {
  if (state.gameOver) return fail("The game is over.");

  switch (action.type) {
    case "acceptOffer": {
      const offer = state.offers[action.offerIndex];
      if (!offer) return fail("That offer is no longer available.");
      if (livingPrisoners(state) >= state.cellCapacity) {
        return fail("Your cells are full. Build more capacity first.");
      }
      state.prisoners.push(offer.prisoner);
      state.resources.coin += offer.acceptBounty;
      state.offers.splice(action.offerIndex, 1);
      pushLog(
        state,
        `Accepted ${offer.prisoner.name} (${offer.prisoner.severity}). +${offer.acceptBounty} coin bounty.`,
        "good",
      );
      return ok;
    }

    case "declineOffer": {
      const offer = state.offers[action.offerIndex];
      if (!offer) return fail("That offer is no longer available.");
      state.offers.splice(action.offerIndex, 1);
      pushLog(state, `Declined ${offer.prisoner.name}.`, "neutral");
      return ok;
    }

    case "assignLabor": {
      const prisoner = state.prisoners.find((p) => p.id === action.prisonerId);
      if (!prisoner || !prisoner.alive) return fail("No such prisoner.");
      prisoner.assignment = action.assignment;
      return ok;
    }

    case "buyResource": {
      if (action.resource === "coin") return fail("You cannot buy coin.");
      if (action.amount <= 0) return fail("Amount must be positive.");
      const unit = BALANCE.prices[action.resource];
      const cost = unit * action.amount;
      if (state.resources.coin < cost) return fail("Not enough coin.");
      state.resources.coin -= cost;
      state.resources[action.resource] += action.amount;
      pushLog(
        state,
        `Bought ${action.amount} ${action.resource} for ${cost} coin.`,
        "neutral",
      );
      return ok;
    }

    case "hireGuard": {
      if (state.resources.coin < BALANCE.guards.hireCost) {
        return fail("Not enough coin to hire a warder.");
      }
      state.resources.coin -= BALANCE.guards.hireCost;
      const rng = new Rng(state.rngState);
      const guard = createGuard(state, rng);
      state.rngState = rng.state;
      state.guards.push(guard);
      pushLog(state, `Hired ${guard.name} (skill ${guard.skill}).`, "good");
      return ok;
    }

    case "fireGuard": {
      const idx = state.guards.findIndex((g) => g.id === action.guardId);
      if (idx < 0) return fail("No such guard.");
      const [removed] = state.guards.splice(idx, 1);
      pushLog(state, `Dismissed ${removed.name}.`, "neutral");
      return ok;
    }

    case "advanceDay":
      // Ending the day is driven by advanceDay() in simulation.ts, not here.
      // Listed for union-exhaustiveness so new action types can't be forgotten.
      return fail("Call advanceDay() to end the day.");

    case "upgradeCapacity": {
      const cost = state.cellCapacity * BALANCE.upgrade.capacityCostPerCell;
      if (state.resources.coin < cost) return fail("Not enough coin to expand.");
      state.resources.coin -= cost;
      state.cellCapacity += BALANCE.upgrade.capacityStep;
      pushLog(
        state,
        `Expanded the keep to ${state.cellCapacity} cells for ${cost} coin.`,
        "good",
      );
      return ok;
    }

    default: {
      // Exhaustiveness guard: if a new action type is added, TS flags this.
      const _never: never = action;
      return fail(`Unknown action: ${JSON.stringify(_never)}`);
    }
  }
}

/** Cost helpers the UI uses to render buttons without duplicating balance math. */
export const costs = {
  hireGuard: () => BALANCE.guards.hireCost,
  upgradeCapacity: (state: GameState) =>
    state.cellCapacity * BALANCE.upgrade.capacityCostPerCell,
  buyResource: (resource: "food" | "firewood" | "buckets", amount: number) =>
    BALANCE.prices[resource] * amount,
  tierFor: tierForReputation,
};
