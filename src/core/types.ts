// ─────────────────────────────────────────────────────────────────────────────
// Warden's Keep — core domain types
//
// These types describe the *simulation* state only. Nothing here imports Phaser
// or touches the DOM, which is what lets the entire rule-set be unit-tested in
// plain Node. The rendering layer (src/scenes, src/ui) reads from this state but
// never the other way around.
// ─────────────────────────────────────────────────────────────────────────────

/** How dangerous / valuable a prisoner is. Drives payout, unrest, and intake gating. */
export type Severity = "petty" | "violent" | "political" | "noble";

/**
 * A second axis, orthogonal to crime severity. Rarity is how *notorious* /
 * remarkable an inmate (or guard) is. Rarer inmates pay far more and work a
 * touch harder, but are more volatile and cunning — high-risk, high-reward.
 * Rarer guards are more skilled but command higher wages. Rarity odds improve
 * with the warden's tier, giving a collection/progression hook.
 */
export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

/** Ordered low→high, so index also serves as a numeric rank. */
export const RARITY_ORDER: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

/**
 * A quirk of temperament or body an inmate may arrive with. Declared here (not
 * in traits.ts) because types.ts imports nothing — the definitions table lives
 * in traits.ts. Roughly half of inmates carry no trait at all.
 */
export type TraitId =
  | "sickly"
  | "brawler"
  | "silverTongue"
  | "escapeArtist"
  | "penitent"
  | "ironBack";

/** Where a conscripted prisoner is assigned to labor. `none` = idle in cell. */
export type LaborAssignment =
  | "none"
  | "woodcutting" // produces firewood
  | "kitchen" // produces food
  | "latrine" // produces sanitation (empties buckets)
  | "smithy"; // produces money

/** A single inmate. */
export interface Prisoner {
  id: string;
  name: string;
  severity: Severity;
  /** Notoriety tier — see Rarity. Affects payout, labour, unrest, escape. */
  rarity: Rarity;
  /** Optional quirk (see traits.ts). Affects payout, unrest, health, labour, escape. */
  trait?: TraitId;
  /** 0–100. At 0 the prisoner dies. */
  health: number;
  /** 0–100. High unrest fuels riots and escape attempts. */
  unrest: number;
  /** Days remaining on sentence. At 0 they are released (frees a cell, small rep gain). */
  sentenceDays: number;
  daysHeld: number;
  assignment: LaborAssignment;
  /** Coin the government pays per day to hold this inmate (locked at intake). */
  dailyPayout: number;
  /** Which numbered cell houses this inmate (0-based; undefined = unassigned). */
  cell?: number;
  /** Set when this inmate is a named legend with a story arc (legends.ts). */
  legendId?: string;
  /** Next arc step awaiting its trigger (index into the legend's steps). */
  legendStep?: number;
  alive: boolean;
}

/** A guard on the payroll. */
export interface Guard {
  id: string;
  name: string;
  /** Notoriety tier — rarer warders roll higher skill but cost more in wages. */
  rarity: Rarity;
  /** 0–100. Higher skill suppresses unrest and resolves events better. */
  skill: number;
  /** 0–100. Brutality suppresses unrest fast but raises death risk and lowers reputation. */
  brutality: number;
  /** Daily wage in coin. */
  wage: number;
  /** 0–100. Tired guards are less effective. Rises on event days, recovers otherwise. */
  fatigue: number;
  /**
   * 0–100. The officer's contentment: driven by pay, food, quarters, and
   * entertainment. Low morale saps effectiveness; miserable warders walk out.
   */
  morale: number;
}

/** Consumable / stored resources. */
export interface Resources {
  coin: number;
  food: number;
  firewood: number;
  /** Sanitation buckets. Too few inmates per bucket → disease. */
  buckets: number;
}

/** The four reputation-gated reputation tiers governing prisoner intake. */
export type WardenTier = "village" | "town" | "city" | "crown";

/** A pending intake offer from the government the warden may accept or decline. */
export interface IntakeOffer {
  prisoner: Prisoner;
  /** Coin the government pays *per day* to hold this prisoner. */
  dailyPayout: number;
  /** One-time signing bounty for accepting. */
  acceptBounty: number;
}

/** Categories of random events that can fire on a day. */
export type EventKind =
  | "riot"
  | "fire"
  | "disease"
  | "escape"
  | "inspection"
  | "bribe"
  | "winter" // harsh cold snap — firewood need doubles for a few days
  | "amnesty" // royal decree frees the petty criminals
  | "bard" // a famous bard sings of your keep — for better or worse
  | "ratPlague" // vermin in the stores
  | "friar" // a wandering friar tends the sick — or preaches rebellion
  | "audit" // the crown skims "administration" off a fat purse
  | "shivFound" // a cell search turns up a blade
  // Story decisions (pause-and-choose), see storyDecisions.ts:
  | "plagueDoctor"
  | "ringleader"
  | "nobleVisit"
  | "smuggler"
  | "magistrateOrder"
  | "starvingVillage"
  | "duel"
  | "informant"
  | "witchTrial"
  | "taxAssessor"
  | "gravedigger"
  | "harvestFestival"
  | "condemnedConfession"
  | "rivalWarden"
  // Named-legend arc beats (legends.ts):
  | "legend";

/** A resolved event, recorded for the player log and outcome math. */
export interface GameEvent {
  kind: EventKind;
  day: number;
  /** Human-readable summary shown in the log. */
  message: string;
  /** Net effect already applied to state when this was produced. */
  deaths: number;
  reputationDelta: number;
  coinDelta: number;
}

/** A single line in the player-facing event log. */
export interface LogEntry {
  day: number;
  text: string;
  tone: "good" | "bad" | "neutral";
}

// ── Decisions ────────────────────────────────────────────────────────────────
// Some events are too consequential to auto-resolve. They pause the day and ask
// the warden to choose. This is the genre's most-loved mechanic: meaningful,
// legible trade-offs. Effects are deferred to the chosen option and applied by
// applyDecision(), keeping everything deterministic.

export type DecisionKind =
  | "riot"
  | "bribe"
  | "plagueDoctor"
  | "ringleader"
  | "nobleVisit"
  | "smuggler"
  | "magistrateOrder"
  | "starvingVillage"
  | "duel"
  | "informant"
  | "witchTrial"
  | "taxAssessor"
  | "gravedigger"
  | "harvestFestival"
  | "condemnedConfession"
  | "rivalWarden"
  | "legend"; // a named inmate's story-arc beat (see legends.ts)

/** The playable warden classes. `steward` is the always-unlocked default. */
export type WardenClass =
  | "steward"
  | "veteran"
  | "confessor"
  | "butcher"
  | "merchant"
  | "reformer"
  | "gambler";

/** Event-pacing modes — the "Crown's Whim". Changeable mid-run, no penalty. */
export type Pacing = "slow" | "steady" | "chaos";

/** Purchasable keep buildings, each a permanent strategic dial. */
export type BuildingId =
  | "infirmary"
  | "chapel"
  | "gallows"
  | "walls"
  | "barracks" // quarters for the warder corps
  | "tavern"; // off-duty entertainment for the warders

/** Cosmetic identity shown on the HUD, endings, and the share card. */
export interface Heraldry {
  /** Index into the banner-colour palette. */
  color: number;
  /** Sigil glyph (from the fixed sigil set). */
  sigil: string;
}

/** One selectable response to a pending decision. */
export interface DecisionOption {
  id: string;
  label: string;
  /** Short, honest hint at the trade-off shown under the button. */
  hint: string;
}

/** A situation awaiting the warden's choice. Plain data so it saves/loads. */
export interface PendingDecision {
  kind: DecisionKind;
  day: number;
  /** The situation text shown at the top of the modal. */
  prompt: string;
  options: DecisionOption[];
  /** Data needed to resolve the outcome (ids, amounts). Plain values only. */
  context: Record<string, number | string>;
}

/** Lifetime statistics of the current run, for endings and the reign summary. */
export interface RunStats {
  totalDeaths: number;
  totalEscapes: number;
  totalReleased: number;
  /** Coin taken in from all sources (income, bounties, bribes). */
  totalCoinEarned: number;
  riotsFaced: number;
  decisionsMade: number;
  /** Highest rarity rank ever held in the cells (index into RARITY_ORDER). */
  bestRarityRank: number;
  peakReputation: number;
}

/** The complete serializable game state. Saving = JSON.stringify(state). */
export interface GameState {
  day: number;
  /**
   * The clock, in whole hours. The active day runs dayStartHour..dayEndHour
   * (see BALANCE.time); income and labour accrue hourly while it advances.
   * At dayEndHour the keep locks until the warden retires for the night.
   */
  hour: number;
  tier: WardenTier;
  /** 0–100. The master progression metric. */
  reputation: number;
  /**
   * −100 (Tyrant) … 0 (Fair) … +100 (Saint). The warden's moral standing,
   * shaped over time by how they treat inmates. Cruelty fears the cells into
   * order but makes cornered riots deadlier and the crown call you a butcher;
   * kindness lifts reputation and calms riots but breeds disrespect, slacking,
   * and escapes.
   */
  morality: number;
  resources: Resources;
  prisoners: Prisoner[];
  guards: Guard[];
  /** Max simultaneous prisoners (upgradeable). */
  cellCapacity: number;
  /** Pending offers the player can accept/decline before advancing the day. */
  offers: IntakeOffer[];
  log: LogEntry[];
  /** Events resolved on the most recent day (for UI highlight). */
  lastEvents: GameEvent[];
  /** A choice awaiting the warden. Blocks ending the next day until resolved. */
  pendingDecision?: PendingDecision;
  /** Seeded RNG cursor — kept in state so saves are fully deterministic. */
  rngState: number;
  /** True once a loss condition is reached. */
  gameOver: boolean;
  gameOverReason?: string;
  /** True when the run ended in victory (gameOver is also set). */
  gameWon?: boolean;
  /** Which ending was reached (see endings.ts), set alongside gameOver. */
  endingId?: string;
  /** Consecutive days holding Crown tier; 30 wins the run. */
  crownDays: number;
  /** Days of harsh winter remaining (firewood need is doubled while > 0). */
  winterDaysLeft: number;
  /** Lifetime run statistics for endings and the reign summary. */
  stats: RunStats;
  /** Which warden class rules this run. */
  warden: WardenClass;
  /** Player-chosen names + heraldry (cosmetic identity). */
  wardenName: string;
  keepName: string;
  heraldry: Heraldry;
  /** Event-pacing mode (the Crown's Whim). */
  pacing: Pacing;
  /** Keep buildings constructed this run. */
  buildings: Record<BuildingId, boolean>;
  /** Legend ids already introduced this run (no repeats). */
  legendsSeen: string[];
  /** Set when this run is a daily challenge (the ISO date it belongs to). */
  dailyChallenge?: string;
  /** Monotonic counter used to mint unique ids without Math.random. */
  idCounter: number;
}

/** Actions the player can take during a day, before advancing. */
export type PlayerAction =
  | { type: "acceptOffer"; offerIndex: number }
  | { type: "declineOffer"; offerIndex: number }
  | { type: "assignLabor"; prisonerId: string; assignment: LaborAssignment }
  | { type: "buyResource"; resource: keyof Resources; amount: number }
  | { type: "hireGuard" }
  | { type: "fireGuard"; guardId: string }
  | { type: "upgradeCapacity" }
  | { type: "build"; building: BuildingId }
  | { type: "setPacing"; pacing: Pacing }
  | { type: "advanceDay" };
