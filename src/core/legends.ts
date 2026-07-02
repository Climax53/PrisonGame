// ─────────────────────────────────────────────────────────────────────────────
// Legends — named inmates with story arcs
//
// Research directive #2: named characters with histories are the genre's #1
// emotional driver. When a legendary/mythic political/noble offer is rolled,
// it may arrive as a LEGEND: a named character whose stay unfolds as a chain
// of decision beats triggered by days held. Each legend appears at most once
// per run. Beats reuse the decision-modal machinery (kind: "legend").
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import { adjustMorality } from "./morality";
import type { Rng } from "./rng";
import { killWeakestPrisoners, pushLog } from "./state";
import type { GameState, PendingDecision, Prisoner } from "./types";
import { clamp } from "./util";

export interface LegendBeatOutcome {
  ok: boolean;
  message?: string;
  tone?: "good" | "bad" | "neutral";
  deaths?: number;
}

interface LegendBeat {
  /** Fires when the legend has been held this many days. */
  onDayHeld: number;
  build(state: GameState, p: Prisoner): PendingDecision;
  resolve(state: GameState, rng: Rng, optionId: string, p: Prisoner): LegendBeatOutcome;
}

export interface LegendDef {
  id: string;
  name: string;
  /** Severity the legend arrives under. */
  severity: "political" | "noble";
  beats: LegendBeat[];
}

const rep = (s: GameState, d: number) => {
  s.reputation = clamp(s.reputation + d, BALANCE.reputation.min, BALANCE.reputation.max);
};

// ── The Deposed Prince (mythic-grade trouble) ────────────────────────────────

const deposedPrince: LegendDef = {
  id: "deposedPrince",
  name: "Prince Alaric the Deposed",
  severity: "noble",
  beats: [
    {
      onDayHeld: 2,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `A cloaked rider brings a chest and a whisper: Prince Alaric's loyalists offer 300 coin for his quiet release. The crown would call it treason.`,
        options: [
          { id: "sell", label: "Take the ransom", hint: "+300 coin. Treason, if it's ever proven." },
          { id: "refuse", label: "Refuse", hint: "The crown's trust is worth more than gold." },
          { id: "report", label: "Report the plot", hint: "The magistrate rewards vigilance." },
        ],
        context: { legendId: "deposedPrince", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        if (opt === "sell") {
          p.alive = false; // spirited away
          s.stats.totalReleased += 1;
          s.resources.coin += 300;
          s.stats.totalCoinEarned += 300;
          adjustMorality(s, -4);
          if (rng.chance(0.35)) {
            rep(s, -15);
            const m = "Alaric vanishes by night. Within a week, a ballad names YOUR gate as the door treason walked through.";
            pushLog(s, m, "bad");
            return { ok: true, message: m, tone: "bad" };
          }
          rep(s, -4);
          const m = "Alaric vanishes by night with his loyalists' gold in your strongbox. The escape is blamed on bad locks.";
          pushLog(s, m, "neutral");
          return { ok: true, message: m, tone: "neutral" };
        }
        if (opt === "report") {
          rep(s, 6);
          p.unrest = clamp(p.unrest + 20, 0, 100);
          const m = "The magistrate's riders scatter the loyalists. Your vigilance is noted at court — and Alaric knows who told.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        p.unrest = clamp(p.unrest + 8, 0, 100);
        const m = "You turn the rider away without a word. The chest — and the temptation — ride off into the dark.";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
    {
      onDayHeld: 6,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `A warder finds a rope of knotted linens and a copied key in Prince Alaric's cell. The escape is set for tonight.`,
        options: [
          { id: "foil", label: "Spring the trap", hint: "Catch him in the act — hard on him, safe for you." },
          { id: "watch", label: "Double the watch quietly", hint: "Deter it without a scene." },
          { id: "letRun", label: "Look away tonight", hint: "Whatever his freedom buys, it won't be your problem. Or will it?" },
        ],
        context: { legendId: "deposedPrince", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        if (opt === "foil") {
          p.health = clamp(p.health - rng.int(10, 20), 1, 100);
          p.unrest = clamp(p.unrest - 25, 0, 100);
          rep(s, 4);
          const m = "The warders take Alaric at the wall's foot, rope in hand. Broken pride keeps a man quieter than chains.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        if (opt === "watch") {
          for (const g of s.guards) g.fatigue = clamp(g.fatigue + 15, 0, 100);
          p.unrest = clamp(p.unrest - 10, 0, 100);
          const m = "Twice the lanterns, twice the boots. The night passes without incident — and without sleep.";
          pushLog(s, m, "neutral");
          return { ok: true, message: m, tone: "neutral" };
        }
        // letRun
        adjustMorality(s, 2);
        if (rng.chance(0.5)) {
          p.alive = false;
          s.stats.totalEscapes += 1;
          rep(s, -12);
          const m = "By dawn, Alaric's cell holds only a folded blanket and a polite note. The magistrate is apoplectic.";
          pushLog(s, m, "bad");
          return { ok: true, message: m, tone: "bad" };
        }
        p.unrest = clamp(p.unrest - 15, 0, 100);
        const m = "You look away — but the copied key snaps in the lock. Alaric returns to his cot, oddly grateful for the gesture.";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
    {
      onDayHeld: 12,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `A royal writ, sealed in black wax: "The prisoner Alaric is to hang before the week ends. See it done." The prince reads your face through the bars.`,
        options: [
          { id: "hang", label: "Carry out the writ", hint: "The crown's will. A prince's blood on your hands." },
          { id: "refuse", label: "Refuse the writ", hint: "Conscience before crowns. There will be a price." },
          { id: "ransom", label: "Sell him to his loyalists", hint: "+500 coin, and the writ can hang instead." },
        ],
        context: { legendId: "deposedPrince", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        void rng;
        if (opt === "hang") {
          p.alive = false;
          s.stats.totalDeaths += 1;
          adjustMorality(s, -8);
          rep(s, 8);
          const m = "Prince Alaric hangs at dawn, and the crown sleeps easier. The ballads will not be kind to either of you.";
          pushLog(s, m, "bad");
          return { ok: true, message: m, tone: "bad", deaths: 1 };
        }
        if (opt === "refuse") {
          adjustMorality(s, 6);
          rep(s, -8);
          const m = "You return the writ unsigned. Somewhere at court, your name is moved to a different list.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        // ransom
        p.alive = false;
        s.stats.totalReleased += 1;
        s.resources.coin += 500;
        s.stats.totalCoinEarned += 500;
        adjustMorality(s, -5);
        rep(s, -10);
        const m = "Gold changes hands in the dark; an empty noose swings in the morning. You are richer, and watched.";
        pushLog(s, m, "bad");
        return { ok: true, message: m, tone: "bad" };
      },
    },
  ],
};

// ── The Alchemist ────────────────────────────────────────────────────────────

const alchemist: LegendDef = {
  id: "alchemist",
  name: "Mirabel the Alchemist",
  severity: "political",
  beats: [
    {
      onDayHeld: 2,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `Mirabel the Alchemist presses a list through the bars: "Sulfur, nettles, a copper pot. Let me work, warden, and your sick will stand by Sunday."`,
        options: [
          { id: "allow", label: "Give her a workbench", hint: "Free healing — from a convicted poisoner." },
          { id: "deny", label: "Absolutely not", hint: "No fires in the cells. Prudent. Dull." },
        ],
        context: { legendId: "alchemist", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        if (opt === "allow") {
          for (const q of s.prisoners) {
            if (q.alive) q.health = clamp(q.health + rng.int(8, 15), 0, 100);
          }
          p.unrest = clamp(p.unrest - 15, 0, 100);
          adjustMorality(s, 2);
          const m = "Mirabel's draughts smell of tar and taste worse — and by Sunday, the coughing cells are quiet.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        p.unrest = clamp(p.unrest + 10, 0, 100);
        const m = "Mirabel shrugs and goes back to scratching formulae on her wall. The sick keep coughing.";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
    {
      onDayHeld: 6,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `A BANG from the cells — Mirabel stands in a ring of soot, delighted. "Progress!" The warders are less delighted.`,
        options: [
          { id: "confiscate", label: "Confiscate everything", hint: "Safety first. She will sulk magnificently." },
          { id: "tolerate", label: "Let her continue — supervised", hint: "Genius is worth some scorch marks. Probably." },
        ],
        context: { legendId: "alchemist", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        if (opt === "confiscate") {
          p.unrest = clamp(p.unrest + 20, 0, 100);
          const m = "The copper pot is carried off under guard. Mirabel's glare could etch glass.";
          pushLog(s, m, "neutral");
          return { ok: true, message: m, tone: "neutral" };
        }
        if (rng.chance(0.25)) {
          const victims = killWeakestPrisoners(s, 1, rng);
          const deaths = victims.length;
          s.resources.firewood = Math.max(0, s.resources.firewood - 10);
          rep(s, -deaths * BALANCE.reputation.perDeath);
          const m = deaths
            ? "The second bang is bigger. The infirmary gains a patient; the keep loses one. Alchemy is not a spectator sport."
            : "The second bang is bigger, but only pride is injured.";
          pushLog(s, m, "bad");
          return { ok: true, message: m, tone: "bad", deaths };
        }
        s.resources.coin += 60;
        s.stats.totalCoinEarned += 60;
        const m = "Supervised and smug, Mirabel transmutes scrap into 60 coin's worth of dye and solder. The crown need not know how.";
        pushLog(s, m, "good");
        return { ok: true, message: m, tone: "good" };
      },
    },
    {
      onDayHeld: 10,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `Mirabel offers a parting gift before her sentence ends: "The formula for my restorative. Yours — if you burn my court records so I may start again."`,
        options: [
          { id: "burn", label: "Burn the records", hint: "A permanent infirmary boon. A crime, technically." },
          { id: "refuse", label: "Keep the records", hint: "The law is the law, even for genius." },
        ],
        context: { legendId: "alchemist", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        void rng;
        if (opt === "burn") {
          s.buildings.infirmary = true; // her formula IS an infirmary
          adjustMorality(s, -3);
          p.unrest = 0;
          const m = "Ash in the brazier, a formula in your desk. The keep gains an infirmary's worth of medicine — and a secret.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        rep(s, 3);
        const m = "You decline, gently. Mirabel nods as if confirming an experiment's result: 'Honest. How limiting.'";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
  ],
};

// ── The Bishop ───────────────────────────────────────────────────────────────

const bishop: LegendDef = {
  id: "bishop",
  name: "Bishop Odo of the Broken Cross",
  severity: "political",
  beats: [
    {
      onDayHeld: 2,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `Bishop Odo asks leave to hold a morning service in the yard. Half the cells already hum his hymns through the walls.`,
        options: [
          { id: "allow", label: "Permit the service", hint: "Calms the cells. The crown dislikes his sermons." },
          { id: "forbid", label: "Forbid it", hint: "No congregations behind bars. The hymns continue anyway." },
        ],
        context: { legendId: "bishop", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        void rng;
        if (opt === "allow") {
          for (const q of s.prisoners) {
            if (q.alive) q.unrest = clamp(q.unrest - 15, 0, 100);
          }
          adjustMorality(s, 3);
          rep(s, -2);
          const m = "The yard fills with rough voices finding harmony. Even the warders stand easier — though word will reach court.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        p.unrest = clamp(p.unrest + 10, 0, 100);
        const m = "Forbidden the yard, Odo preaches to the wall. The wall, reportedly, is moved.";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
    {
      onDayHeld: 6,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `The magistrate's letter is brief: "The bishop's tongue is a blade. Remove it — or him." They mean the noose.`,
        options: [
          { id: "comply", label: "Hang the bishop", hint: "The crown's favor, bought with holy blood." },
          { id: "refuse", label: "Refuse", hint: "You'll answer for it. Some things are worth answering for." },
          { id: "exile", label: "Arrange an 'escape'", hint: "No blood, no bishop — and no explanation that holds." },
        ],
        context: { legendId: "bishop", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        void rng;
        if (opt === "comply") {
          p.alive = false;
          s.stats.totalDeaths += 1;
          adjustMorality(s, -10);
          rep(s, 6);
          for (const q of s.prisoners) {
            if (q.alive) q.unrest = clamp(q.unrest + 15, 0, 100);
          }
          const m = "Bishop Odo blesses his own executioner. The cells go very quiet — the quiet before something.";
          pushLog(s, m, "bad");
          return { ok: true, message: m, tone: "bad", deaths: 1 };
        }
        if (opt === "refuse") {
          adjustMorality(s, 6);
          rep(s, -6);
          const m = "You write one word beneath the magistrate's seal: 'No.' Copies of your answer circulate in three counties.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        // exile
        p.alive = false;
        s.stats.totalReleased += 1;
        adjustMorality(s, 3);
        rep(s, -8);
        const m = "A cart of salted fish leaves at dawn, one barrel breathing. Odo's sermons resume — infuriatingly — abroad.";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
    {
      onDayHeld: 11,
      build: (s, p) => ({
        kind: "legend",
        day: s.day,
        prompt: `His sentence near its end, Bishop Odo offers to consecrate the keep's yard: "Whatever you are, warden, this place could stand a blessing."`,
        options: [
          { id: "accept", label: "Accept the blessing", hint: "The cells take heart. The crown rolls its eyes." },
          { id: "decline", label: "Decline politely", hint: "A keep runs on locks, not liturgy." },
        ],
        context: { legendId: "bishop", targetId: p.id },
      }),
      resolve: (s, rng, opt, p) => {
        void rng;
        void p;
        if (opt === "accept") {
          s.buildings.chapel = true; // the consecrated yard serves as one
          adjustMorality(s, 3);
          const m = "Incense in the yard, quiet in the cells. The consecrated ground serves the keep as a chapel from this day.";
          pushLog(s, m, "good");
          return { ok: true, message: m, tone: "good" };
        }
        const m = "Odo smiles, unoffended. 'The offer stands, warden. Blessings keep.'";
        pushLog(s, m, "neutral");
        return { ok: true, message: m, tone: "neutral" };
      },
    },
  ],
};

// ── Registry & engine hooks ──────────────────────────────────────────────────

export const LEGENDS: LegendDef[] = [deposedPrince, alchemist, bishop];

export function legendDef(id: string): LegendDef | undefined {
  return LEGENDS.find((l) => l.id === id);
}

/**
 * Try to brand a freshly generated high-rarity prisoner as a legend. Called
 * from the offer factory. Mutates the prisoner (name, legend fields) and
 * records the legend as seen.
 */
export function maybeBrandLegend(state: GameState, rng: Rng, p: Prisoner): void {
  if (p.rarity !== "legendary" && p.rarity !== "mythic") return;
  if (p.severity !== "political" && p.severity !== "noble") return;
  if (!rng.chance(BALANCE.legends.offerChance)) return;
  const available = LEGENDS.filter(
    (l) => l.severity === p.severity && !state.legendsSeen.includes(l.id),
  );
  const legend = available[0];
  if (!legend) return;
  p.name = legend.name;
  p.legendId = legend.id;
  p.legendStep = 0;
  p.sentenceDays = Math.max(p.sentenceDays, 14); // room for the full arc
  state.legendsSeen.push(legend.id);
}

/**
 * Check held legends for a story beat due today. Returns at most one pending
 * decision. Called from the daily tick when no other decision claimed the day.
 */
export function dueLegendBeat(state: GameState): PendingDecision | undefined {
  for (const p of state.prisoners) {
    if (!p.alive || !p.legendId || p.legendStep === undefined) continue;
    const legend = legendDef(p.legendId);
    if (!legend) continue;
    const beat = legend.beats[p.legendStep];
    if (beat && p.daysHeld >= beat.onDayHeld) {
      return beat.build(state, p);
    }
  }
  return undefined;
}

/** Resolve a legend beat decision; advances the inmate's arc pointer. */
export function resolveLegendBeat(
  state: GameState,
  rng: Rng,
  optionId: string,
  decision: PendingDecision,
): LegendBeatOutcome | undefined {
  const legendId = decision.context.legendId as string;
  const targetId = decision.context.targetId as string;
  const legend = legendDef(legendId);
  if (!legend) return undefined;
  const p = state.prisoners.find((q) => q.id === targetId);
  if (!p || !p.alive || p.legendStep === undefined) {
    const m = `${legend.name} is gone from the keep; the tale ends unfinished.`;
    pushLog(state, m, "neutral");
    return { ok: true, message: m, tone: "neutral" };
  }
  const beat = legend.beats[p.legendStep];
  if (!beat) return { ok: false };
  const outcome = beat.resolve(state, rng, optionId, p);
  p.legendStep += 1;
  return outcome;
}
