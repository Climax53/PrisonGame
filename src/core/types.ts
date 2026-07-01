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
  alive: boolean;
}

/** A guard on the payroll. */
export interface Guard {
  id: string;
  name: string;
  /** 0–100. Higher skill suppresses unrest and resolves events better. */
  skill: number;
  /** 0–100. Brutality suppresses unrest fast but raises death risk and lowers reputation. */
  brutality: number;
  /** Daily wage in coin. */
  wage: number;
  /** 0–100. Tired guards are less effective. Rises on event days, recovers otherwise. */
  fatigue: number;
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
  | "bribe";

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

export type DecisionKind = "riot" | "bribe";

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

/** The complete serializable game state. Saving = JSON.stringify(state). */
export interface GameState {
  day: number;
  tier: WardenTier;
  /** 0–100. The master progression metric. */
  reputation: number;
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
  | { type: "advanceDay" };
