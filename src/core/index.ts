// Public surface of the simulation core. The rendering layer imports only from
// here, never from individual files — keeping the boundary clean.

export * from "./types";
export { BALANCE } from "./balance";
export { Rng, nextRandom } from "./rng";
export {
  createInitialState,
  pushLog,
  livingPrisoners,
  effectiveGuardSkill,
  averageBrutality,
} from "./state";
export { advanceDay, summarize } from "./simulation";
export { applyAction, costs, type ActionResult } from "./actions";
export { resolveEvents } from "./events";
export {
  createPrisoner,
  createGuard,
  createOffer,
  tierForReputation,
} from "./factory";

// ── Save / load ─────────────────────────────────────────────────────────────
// GameState is plain JSON, so persistence is trivial and version-tagged.

import type { GameState } from "./types";

const SAVE_VERSION = 1;

export interface SaveBlob {
  version: number;
  state: GameState;
}

export function serialize(state: GameState): string {
  const blob: SaveBlob = { version: SAVE_VERSION, state };
  return JSON.stringify(blob);
}

export function deserialize(json: string): GameState | null {
  try {
    const blob = JSON.parse(json) as SaveBlob;
    if (blob.version !== SAVE_VERSION) return null;
    return blob.state;
  } catch {
    return null;
  }
}
