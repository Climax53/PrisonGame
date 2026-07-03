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
import { assignCells, livingPrisoners, pushLog } from "./state";
import { wardenMods } from "./wardens";
import type { BuildingId, GameState, PlayerAction } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok: ActionResult = { ok: true };

export function applyAction(state: GameState, action: PlayerAction): ActionResult {
  if (state.gameOver) return fail("The game is over.");
  if (state.pendingDecision) {
    return fail("A crisis demands your answer before anything else.");
  }

  switch (action.type) {
    case "acceptOffer": {
      const offer = state.offers[action.offerIndex];
      if (!offer) return fail("That offer is no longer available.");
      if (livingPrisoners(state) >= state.cellCapacity) {
        return fail("Your cells are full. Build more capacity first.");
      }
      state.prisoners.push(offer.prisoner);
      assignCells(state);
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
      const cost = costs.buyResource(action.resource, action.amount, state);
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
      const hireCost = costs.hireGuard(state);
      if (state.resources.coin < hireCost) {
        return fail("Not enough coin to hire a warder.");
      }
      state.resources.coin -= hireCost;
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

    case "build": {
      const b: BuildingId = action.building;
      if (state.buildings[b]) return fail("That building already stands.");
      const cost = costs.build(b, state);
      if (state.resources.coin < cost) return fail("Not enough coin to build.");
      state.resources.coin -= cost;
      state.buildings[b] = true;
      pushLog(state, `The ${b} is raised for ${cost} coin.`, "good");
      return ok;
    }

    case "setPacing": {
      state.pacing = action.pacing;
      pushLog(state, `The Crown's Whim shifts: ${action.pacing}.`, "neutral");
      return ok;
    }

    case "advanceDay":
      // Ending the day is driven by advanceDay() in simulation.ts, not here.
      // Listed for union-exhaustiveness so new action types can't be forgotten.
      return fail("Call advanceDay() to end the day.");

    case "upgradeCapacity": {
      const cost = costs.upgradeCapacity(state);
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

/** Cost helpers the UI uses to render buttons without duplicating balance
 * math. All prices respect the warden's nature (the Merchant buys cheap). */
export const costs = {
  hireGuard: (state: GameState) =>
    Math.round(BALANCE.guards.hireCost * wardenMods(state).wageMult),
  upgradeCapacity: (state: GameState) =>
    Math.round(
      state.cellCapacity * BALANCE.upgrade.capacityCostPerCell * wardenMods(state).priceMult,
    ),
  buyResource: (
    resource: "food" | "firewood" | "buckets",
    amount: number,
    state?: GameState,
  ) =>
    Math.round(
      BALANCE.prices[resource] * amount * (state ? wardenMods(state).priceMult : 1),
    ),
  build: (building: BuildingId, state: GameState) =>
    Math.round(BALANCE.buildings[building].cost * wardenMods(state).priceMult),
  tierFor: tierForReputation,
};
