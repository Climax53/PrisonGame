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
export { resolveEvents, type EventResolution } from "./events";
export {
  applyDecision,
  buildRiotDecision,
  buildBribeDecision,
  type DecisionOutcome,
} from "./decisions";
export {
  createPrisoner,
  createGuard,
  createOffer,
  tierForReputation,
} from "./factory";
export {
  rarityRank,
  rollRarity,
  prisonerRarityMods,
  guardRarityMods,
} from "./rarity";
export {
  moralityStanding,
  moralityFactor,
  adjustMorality,
} from "./morality";
export {
  assessDangers,
  dangerLevel,
  riotChance,
  fireChance,
  diseaseChance,
  escapeChance,
  type DangerReport,
} from "./danger";

export {
  serialize,
  deserialize,
  SAVE_VERSION,
  type SaveBlob,
} from "./save";
