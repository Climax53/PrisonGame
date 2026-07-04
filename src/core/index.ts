// Public surface of the simulation core. The rendering layer imports only from
// here, never from individual files — keeping the boundary clean.

export * from "./types";
export { BALANCE } from "./balance";
export { Rng, nextRandom } from "./rng";
export {
  createInitialState,
  emptyStats,
  assignCells,
  pushLog,
  livingPrisoners,
  effectiveGuardSkill,
  averageBrutality,
} from "./state";
export {
  advanceDay,
  advanceHour,
  retire,
  projectDay,
  guardQuarters,
  summarize,
} from "./simulation";
export { applyAction, costs, type ActionResult } from "./actions";
export { resolveEvents, type EventResolution } from "./events";
export {
  applyDecision,
  buildRiotDecision,
  buildBribeDecision,
  type DecisionOutcome,
} from "./decisions";
export {
  pickStoryDecision,
  resolveStoryDecision,
  STORY_KINDS,
} from "./storyDecisions";
export { endingFor, pickVictoryEnding, checkVictory, type Ending } from "./endings";
export { WARDENS, wardenDef, wardenMods, type WardenDef, type WardenMods } from "./wardens";
export {
  ACHIEVEMENTS,
  evaluateAchievements,
  unlockedWardens,
  type AchievementDef,
} from "./achievements";
export {
  LEGENDS,
  legendDef,
  maybeBrandLegend,
  dueLegendBeat,
  resolveLegendBeat,
} from "./legends";
export {
  SIGILS,
  BANNER_COLORS,
  randomWardenName,
  randomKeepName,
  randomHeraldry,
} from "./identity";
export { dangerScale, opportunityScale } from "./danger";
export { type NewGameOptions } from "./state";
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
export { TRAITS, TRAIT_IDS, traitDef, type TraitDef } from "./traits";
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
