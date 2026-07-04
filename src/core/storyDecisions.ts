// ─────────────────────────────────────────────────────────────────────────────
// Story decisions — the widened deck of pause-and-choose moments
//
// Beyond riots and bribes, the keep now throws situational dilemmas: a plague
// doctor at the gate, a caught ringleader, the magistrate's ugly orders. Each
// card declares WHEN it can appear (eligibility), WHAT the warden may do
// (options with honest hints — never opaque), and HOW each choice resolves
// (deterministic via the seeded RNG, with morality/reputation/coin couplings).
//
// Data-driven registry: events.ts asks pickStoryDecision() for at most one
// eligible card per day; decisions.ts routes resolution back here.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import { opportunityScale, riotChance } from "./danger";
import { adjustMorality, repGainMultiplier } from "./morality";
import type { Rng } from "./rng";
import { livingPrisoners, pushLog } from "./state";
import type { DecisionKind, GameState, PendingDecision, Prisoner } from "./types";
import { clamp, round1 } from "./util";

export interface StoryOutcome {
  ok: boolean;
  message?: string;
  tone?: "good" | "bad" | "neutral";
  deaths?: number;
}

interface StoryCard {
  kind: DecisionKind;
  /** May this card appear today? */
  eligible(state: GameState): boolean;
  /** Build the pending decision (may draw RNG for amounts/targets). */
  build(state: GameState, rng: Rng): PendingDecision;
  /** Resolve the chosen option. */
  resolve(state: GameState, rng: Rng, optionId: string, d: PendingDecision): StoryOutcome;
}

const rep = (state: GameState, delta: number) => {
  state.reputation = clamp(
    state.reputation + (delta > 0 ? delta * repGainMultiplier(state) : delta),
    BALANCE.reputation.min,
    BALANCE.reputation.max,
  );
};

const mostUnrestful = (state: GameState): Prisoner | undefined =>
  state.prisoners.filter((p) => p.alive).sort((a, b) => b.unrest - a.unrest)[0];

// ── The deck ─────────────────────────────────────────────────────────────────

const plagueDoctor: StoryCard = {
  kind: "plagueDoctor",
  eligible: (s) =>
    s.prisoners.some((p) => p.alive && p.health < 55) && s.resources.coin >= 20,
  build: (s, rng) => {
    const fee = rng.int(25, 60);
    return {
      kind: "plagueDoctor",
      day: s.day,
      prompt:
        "A masked plague doctor raps at the gate, jars of foul tinctures clinking. For a fee, they will treat your sickest inmates. Their methods are… unproven.",
      options: [
        { id: "pay", label: `Pay ${fee} coin`, hint: "Likely heals the sick. Small chance the cure is worse." },
        { id: "haggle", label: "Offer half", hint: "They may take insult — or take the deal." },
        { id: "refuse", label: "Turn them away", hint: "No cost. The sick stay sick." },
      ],
      context: { fee },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const fee = d.context.fee as number;
    const sick = s.prisoners.filter((p) => p.alive && p.health < 55);
    const treat = (successChance: number, paid: number): StoryOutcome => {
      s.resources.coin -= paid;
      if (rng.chance(successChance)) {
        for (const p of sick) p.health = clamp(p.health + rng.int(20, 35), 0, 100);
        const msg = `The doctor's tinctures work — ${sick.length} inmates recover strength.`;
        pushLog(s, msg, "good");
        return { ok: true, message: msg, tone: "good" };
      }
      let deaths = 0;
      for (const p of sick) {
        p.health = clamp(p.health - rng.int(10, 25), 0, 100);
        if (p.health <= 0) {
          p.alive = false;
          deaths++;
        }
      }
      s.stats.totalDeaths += deaths;
      if (deaths > 0) rep(s, -deaths * BALANCE.reputation.perDeath);
      const msg = deaths
        ? `Quackery! The "cure" kills ${deaths} of the sick.`
        : "The tinctures do nothing but turn stomachs.";
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad", deaths };
    };

    if (optionId === "pay") return treat(0.75, Math.min(fee, Math.max(0, s.resources.coin)));
    if (optionId === "haggle") {
      if (rng.chance(0.5)) return treat(0.75, Math.min(Math.floor(fee / 2), Math.max(0, s.resources.coin)));
      const msg = "Insulted, the doctor departs in a swirl of camphor and contempt.";
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    const msg = "You turn the plague doctor away. The coughing from the cells continues.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const ringleader: StoryCard = {
  kind: "ringleader",
  eligible: (s) => {
    const top = mostUnrestful(s);
    return !!top && top.unrest > 65 && livingPrisoners(s) >= 2;
  },
  build: (s, rng) => {
    const target = mostUnrestful(s)!;
    void rng;
    return {
      kind: "ringleader",
      day: s.day,
      prompt: `The warders drag ${target.name} before you — caught whispering mutiny through the bars. The cells hold their breath.`,
      options: [
        { id: "execute", label: "The gallows", hint: "Fear silences the cells. A death on your name." },
        { id: "solitary", label: "The dark cell", hint: "Break their spirit, harm their health. No blood." },
        { id: "pardon", label: "Pardon them", hint: "Mercy — the cells may love or exploit it." },
      ],
      context: { targetId: target.id, targetName: target.name },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const target = s.prisoners.find((p) => p.id === d.context.targetId && p.alive);
    if (!target) {
      const msg = "The ringleader is already gone from the keep.";
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "execute") {
      target.alive = false;
      s.stats.totalDeaths += 1;
      adjustMorality(s, -BALANCE.morality.perCrush);
      rep(s, -BALANCE.reputation.perDeath);
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest - 20, 0, 100);
      }
      const msg = `${target.name} hangs at dawn. The cells fall silent — for now.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad", deaths: 1 };
    }
    if (optionId === "solitary") {
      target.unrest = clamp(target.unrest - 40, 0, 100);
      target.health = clamp(target.health - rng.int(15, 30), 1, 100);
      adjustMorality(s, -2);
      const msg = `${target.name} is walled into the dark cell. Their defiance fades with the light.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    // pardon
    adjustMorality(s, 3);
    if (rng.chance(0.5)) {
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest - 12, 0, 100);
      }
      rep(s, 2);
      const msg = `You pardon ${target.name}. Word of mercy softens the whole cell block.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    target.unrest = clamp(target.unrest + 10, 0, 100);
    const msg = `You pardon ${target.name} — and the cells read it as weakness.`;
    pushLog(s, msg, "bad");
    return { ok: true, message: msg, tone: "bad" };
  },
};

const nobleVisit: StoryCard = {
  kind: "nobleVisit",
  eligible: (s) =>
    s.prisoners.some((p) => p.alive && (p.severity === "noble" || p.severity === "political")),
  build: (s, rng) => {
    const inmate = s.prisoners.find(
      (p) => p.alive && (p.severity === "noble" || p.severity === "political"),
    )!;
    const toll = rng.int(20, 45);
    return {
      kind: "nobleVisit",
      day: s.day,
      prompt: `A veiled lady arrives with an escort, begging to visit ${inmate.name}. The law is silent; the choice is yours.`,
      options: [
        { id: "allow", label: "Allow the visit", hint: "A calmer, grateful inmate. Costs nothing." },
        { id: "charge", label: `Charge ${toll} coin`, hint: "Coin for compassion. Slightly grubby." },
        { id: "deny", label: "Turn her away", hint: "By the book. The inmate will seethe." },
      ],
      context: { inmateId: inmate.id, inmateName: inmate.name, toll },
    };
  },
  resolve: (s, rng, optionId, d) => {
    void rng;
    const inmate = s.prisoners.find((p) => p.id === d.context.inmateId && p.alive);
    const toll = d.context.toll as number;
    if (!inmate) {
      const msg = "The visitor finds her kin already gone from the keep.";
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "allow") {
      inmate.unrest = clamp(inmate.unrest - 25, 0, 100);
      adjustMorality(s, 2);
      const msg = `${inmate.name} weeps at the visit and grows calm. Small kindnesses echo.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    if (optionId === "charge") {
      s.resources.coin += toll;
      s.stats.totalCoinEarned += toll;
      inmate.unrest = clamp(inmate.unrest - 15, 0, 100);
      adjustMorality(s, -1);
      const msg = `You pocket ${toll} coin for the visit. Compassion, at a price.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    inmate.unrest = clamp(inmate.unrest + 20, 0, 100);
    adjustMorality(s, -2);
    const msg = `The lady is turned away. ${inmate.name} watches from the bars, and hates.`;
    pushLog(s, msg, "bad");
    return { ok: true, message: msg, tone: "bad" };
  },
};

const smuggler: StoryCard = {
  kind: "smuggler",
  eligible: (s) => s.guards.length >= 1,
  build: (s, rng) => {
    const guard = s.guards[rng.int(0, s.guards.length - 1)];
    return {
      kind: "smuggler",
      day: s.day,
      prompt: `${guard.name} is caught smuggling wine and letters to the inmates for coin. The other warders await your judgment.`,
      options: [
        { id: "dismiss", label: "Dismiss them", hint: "Clean hands, one fewer warder." },
        { id: "flog", label: "Flog & keep them", hint: "Cruel discipline. The corps learns fear." },
        { id: "blackmail", label: "Take a cut", hint: "The smuggling continues — profitably. Risky." },
      ],
      context: { guardId: guard.id, guardName: guard.name },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const idx = s.guards.findIndex((g) => g.id === d.context.guardId);
    const name = d.context.guardName as string;
    if (idx < 0) {
      const msg = `${name} is no longer on the payroll.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "dismiss") {
      s.guards.splice(idx, 1);
      rep(s, 2);
      const msg = `${name} is stripped of their badge at the gate. The corps takes note.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "flog") {
      const g = s.guards[idx];
      g.fatigue = clamp(g.fatigue + 30, 0, 100);
      g.brutality = clamp(g.brutality + 10, 0, 100);
      adjustMorality(s, -4);
      const msg = `${name} is flogged before the assembled warders. Lesson delivered — in the cruelest tongue.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    // blackmail
    const cut = rng.int(15, 40);
    s.resources.coin += cut;
    s.stats.totalCoinEarned += cut;
    adjustMorality(s, -BALANCE.morality.perBribeAccept);
    if (rng.chance(0.25)) {
      rep(s, -rng.int(3, 6));
      const msg = `You take a ${cut}-coin cut of the smuggling — and the whole town somehow knows by Friday.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    const msg = `You take a quiet ${cut}-coin cut. The wine keeps flowing.`;
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const magistrateOrder: StoryCard = {
  kind: "magistrateOrder",
  eligible: (s) => s.prisoners.some((p) => p.alive && p.severity === "political"),
  build: (s, rng) => {
    void rng;
    const target = s.prisoners.find((p) => p.alive && p.severity === "political")!;
    return {
      kind: "magistrateOrder",
      day: s.day,
      prompt: `A sealed letter from the magistrate: ${target.name} is to receive "special treatment" — cold cell, half rations, no visitors — until they talk.`,
      options: [
        { id: "comply", label: "Comply", hint: "The crown smiles. The inmate suffers." },
        { id: "refuse", label: "Refuse", hint: "Conscience over favor. The crown remembers." },
        { id: "pretend", label: "Pretend to comply", hint: "Deceive the magistrate. If caught, it costs dearly." },
      ],
      context: { targetId: target.id, targetName: target.name },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const target = s.prisoners.find((p) => p.id === d.context.targetId && p.alive);
    const name = d.context.targetName as string;
    if (!target) {
      const msg = `${name} is beyond the magistrate's reach now.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "comply") {
      target.health = clamp(target.health - rng.int(15, 25), 1, 100);
      target.unrest = clamp(target.unrest + 15, 0, 100);
      adjustMorality(s, -5);
      rep(s, 4);
      const msg = `${name} is broken by inches, per the crown's instructions. The magistrate is pleased.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    if (optionId === "refuse") {
      adjustMorality(s, 5);
      rep(s, -4);
      const msg = "You burn the letter. Some orders should cost the one who gives them.";
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    // pretend
    if (rng.chance(0.6)) {
      adjustMorality(s, 3);
      rep(s, 2);
      const msg = `You file glowing reports of ${name}'s "treatment" while their rations stay whole. The lie holds.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    rep(s, -8);
    const msg = "An informer betrays your deception to the magistrate. The crown's trust bleeds.";
    pushLog(s, msg, "bad");
    return { ok: true, message: msg, tone: "bad" };
  },
};

const starvingVillage: StoryCard = {
  kind: "starvingVillage",
  eligible: (s) => s.resources.food >= 20,
  build: (s, rng) => {
    void rng;
    const share = Math.min(15, Math.floor(s.resources.food / 2));
    return {
      kind: "starvingVillage",
      day: s.day,
      prompt:
        "A deputation of gaunt villagers stands at the gate. The harvest failed; they beg a share of the keep's stores.",
      options: [
        { id: "share", label: `Give ${share} food`, hint: "The town will love you. Your stores shrink." },
        { id: "sell", label: "Sell at double price", hint: "Profit from hunger. They will remember." },
        { id: "refuse", label: "Bar the gate", hint: "The stores are for the keep. Cold, but prudent." },
      ],
      context: { share },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const share = d.context.share as number;
    if (optionId === "share") {
      s.resources.food = round1(Math.max(0, s.resources.food - share));
      adjustMorality(s, 4);
      rep(s, rng.int(3, 6));
      const msg = `You open the stores. ${share} food feeds the village — and your name is blessed in two parishes.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    if (optionId === "sell") {
      const price = share * BALANCE.prices.food * 2;
      s.resources.food = round1(Math.max(0, s.resources.food - share));
      s.resources.coin += price;
      s.stats.totalCoinEarned += price;
      adjustMorality(s, -4);
      rep(s, -2);
      const msg = `You sell ${share} food at famine prices — ${price} coin, and a village's quiet hatred.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    adjustMorality(s, -2);
    const msg = "The gate stays barred. The villagers trudge home hungry.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const duel: StoryCard = {
  kind: "duel",
  eligible: (s) => livingPrisoners(s) >= 2,
  build: (s, rng) => {
    void rng;
    const living = s.prisoners.filter((p) => p.alive);
    const [a, b] = living;
    return {
      kind: "duel",
      day: s.day,
      prompt: `${a.name} and ${b.name} demand to settle a blood feud in the yard — fists, before witnesses. The cells are ravenous for it.`,
      options: [
        { id: "allow", label: "Let them fight", hint: "Vents the cells' fury. Someone gets hurt." },
        { id: "forbid", label: "Forbid it", hint: "Order upheld; the feud festers." },
        { id: "wager", label: "Take wagers on it", hint: "The fight happens — and you profit from it." },
      ],
      context: { aId: a.id, bId: b.id, aName: a.name, bName: b.name },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const a = s.prisoners.find((p) => p.id === d.context.aId && p.alive);
    const b = s.prisoners.find((p) => p.id === d.context.bId && p.alive);
    if (!a || !b) {
      const msg = "The feud ends before it begins — one of the pair is gone.";
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    const runFight = (): { loser: Prisoner; msg: string } => {
      const loser = rng.chance(0.5) ? a : b;
      loser.health = clamp(loser.health - rng.int(20, 40), 1, 100);
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest - 8, 0, 100);
      }
      return {
        loser,
        msg: `${a.name} and ${b.name} bloody each other in the yard; ${loser.name} is carried off. The cells exhale.`,
      };
    };
    if (optionId === "allow") {
      adjustMorality(s, -2);
      const { msg } = runFight();
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "wager") {
      adjustMorality(s, -4);
      const take = rng.int(10, 30);
      s.resources.coin += take;
      s.stats.totalCoinEarned += take;
      const { msg } = runFight();
      const full = `${msg} Your cut of the wagers: ${take} coin.`;
      pushLog(s, full, "neutral");
      return { ok: true, message: full, tone: "neutral" };
    }
    // forbid
    a.unrest = clamp(a.unrest + 10, 0, 100);
    b.unrest = clamp(b.unrest + 10, 0, 100);
    adjustMorality(s, 1);
    const msg = "You forbid the duel. The feud goes back to simmering through the bars.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const informant: StoryCard = {
  kind: "informant",
  eligible: (s) => riotChance(s) > 0.15 && s.resources.coin >= 15,
  build: (s, rng) => {
    const fee = rng.int(15, 35);
    return {
      kind: "informant",
      day: s.day,
      prompt:
        "A twitchy inmate sidles up to the bars: for a little coin, they'll name the men stoking tomorrow's trouble.",
      options: [
        { id: "pay", label: `Pay ${fee} coin`, hint: "Names mean the warders can smother the plot." },
        { id: "threaten", label: "Threaten it out of them", hint: "Free — if fear works. It may backfire." },
        { id: "ignore", label: "Ignore the weasel", hint: "Maybe it's nothing. Maybe it isn't." },
      ],
      context: { fee },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const fee = d.context.fee as number;
    const smother = (note: string, tone: "good" | "neutral"): StoryOutcome => {
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest - 18, 0, 100);
      }
      pushLog(s, note, tone);
      return { ok: true, message: note, tone };
    };
    if (optionId === "pay") {
      s.resources.coin -= Math.min(fee, Math.max(0, s.resources.coin));
      return smother("Names in hand, the warders quietly separate the plotters. The pressure eases.", "good");
    }
    if (optionId === "threaten") {
      adjustMorality(s, -2);
      if (rng.chance(0.5)) {
        return smother("The informant spills everything at the first raised fist. Plot smothered.", "neutral");
      }
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest + 8, 0, 100);
      }
      const msg = "The informant clams up — and word of the rough handling spreads. The cells darken.";
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    const msg = "You wave the informant off. Whatever they knew stays in the dark.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const witchTrial: StoryCard = {
  kind: "witchTrial",
  eligible: (s) => s.prisoners.some((p) => p.alive && p.severity === "political"),
  build: (s, rng) => {
    const target = s.prisoners.find((p) => p.alive && p.severity === "political")!;
    const fee = rng.int(25, 50);
    return {
      kind: "witchTrial",
      day: s.day,
      prompt: `A torch-lit mob gathers at the gate, howling that ${target.name} is a witch and demanding the pyre. The warders bar the door and wait on your word.`,
      options: [
        { id: "handOver", label: "Hand them over", hint: "The mob loves you for it. A murder on your soul." },
        { id: "defy", label: "Defy the mob", hint: "Conscience kept; the town sours and the cells stir." },
        { id: "magistrate", label: `Demand a trial (${fee} coin)`, hint: "The law decides. Costs coin, settles nothing else." },
      ],
      context: { targetId: target.id, targetName: target.name, fee },
    };
  },
  resolve: (s, rng, optionId, d) => {
    void rng;
    const target = s.prisoners.find((p) => p.id === d.context.targetId && p.alive);
    const name = d.context.targetName as string;
    const fee = d.context.fee as number;
    if (!target) {
      const msg = `The mob finds ${name} already gone from the keep, and drifts home muttering.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "handOver") {
      target.alive = false;
      s.stats.totalDeaths += 1;
      adjustMorality(s, -8);
      rep(s, 4);
      const msg = `You open the gate. ${name} burns at the crossroads while the town cheers your name.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad", deaths: 1 };
    }
    if (optionId === "defy") {
      adjustMorality(s, 5);
      rep(s, -4);
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest + 8, 0, 100);
      }
      const msg = "You face the torches from the wall and refuse. The mob curses your name; the cells seethe at the long night of shouting.";
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    // magistrate
    s.resources.coin -= Math.min(fee, Math.max(0, s.resources.coin));
    const msg = `You buy the magistrate's court a seat at the matter — ${fee} coin in "fees." The mob disperses to await a verdict that will take months.`;
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const taxAssessor: StoryCard = {
  kind: "taxAssessor",
  eligible: (s) => s.resources.coin > 250,
  build: (s, rng) => {
    const bribe = rng.int(30, 60);
    return {
      kind: "taxAssessor",
      day: s.day,
      prompt:
        "A crown tax assessor arrives unannounced, ink-stained and unsmiling, and asks to see the keep's ledgers. All of them.",
      options: [
        { id: "openBooks", label: "Open the books", hint: "Lose 8% of your coin. Honesty is noticed." },
        { id: "bribe", label: `Slip them ${bribe} coin`, hint: "Cheaper than taxes — unless you're caught." },
        { id: "hide", label: "Hide coin in the walls", hint: "A coin toss: keep it all, or lose more and look worse." },
      ],
      context: { bribe },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const bribe = d.context.bribe as number;
    if (optionId === "openBooks") {
      const due = Math.round(Math.max(0, s.resources.coin) * 0.08);
      s.resources.coin -= due;
      rep(s, 3);
      const msg = `The assessor combs every page and levies ${due} coin. Your candor travels back to court.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    if (optionId === "bribe") {
      s.resources.coin -= Math.min(bribe, Math.max(0, s.resources.coin));
      adjustMorality(s, -3);
      if (rng.chance(0.35)) {
        rep(s, -8);
        const msg = `The assessor pockets your ${bribe} coin — then reports the attempt anyway. The crown's trust craters.`;
        pushLog(s, msg, "bad");
        return { ok: true, message: msg, tone: "bad" };
      }
      const msg = `${bribe} coin vanishes into the assessor's satchel, and the ledgers pass unread.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    // hide
    if (rng.chance(0.5)) {
      const msg = "The assessor taps the walls, finds nothing, and departs. Your coin sleeps safe behind the third stone.";
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    const lost = Math.round(Math.max(0, s.resources.coin) * 0.15);
    s.resources.coin -= lost;
    rep(s, -5);
    const msg = `A loose stone betrays you — the assessor seizes ${lost} coin and writes a long, unkind report.`;
    pushLog(s, msg, "bad");
    return { ok: true, message: msg, tone: "bad" };
  },
};

const gravedigger: StoryCard = {
  kind: "gravedigger",
  eligible: (s) => s.stats.totalDeaths >= 1,
  build: (s, rng) => {
    const offer = rng.int(40, 80);
    return {
      kind: "gravedigger",
      day: s.day,
      prompt:
        "A gravedigger with black fingernails and a friendly manner offers coin for the keep's \"unclaimed\" dead. He does not say who's buying, and you do not ask.",
      options: [
        { id: "sell", label: `Take ${offer} coin`, hint: "The dead pay one last time. Your soul keeps the ledger." },
        { id: "refuse", label: "Refuse him", hint: "The dead rest whole. A small mercy, cheaply kept." },
        { id: "donate", label: "Donate to the infirmary school", hint: "The surgeons learn; the crown approves. Still a little grim." },
      ],
      context: { offer },
    };
  },
  resolve: (s, rng, optionId, d) => {
    void rng;
    const offer = d.context.offer as number;
    if (optionId === "sell") {
      s.resources.coin += offer;
      s.stats.totalCoinEarned += offer;
      adjustMorality(s, -6);
      const msg = `The cart leaves heavier by night, and your purse by ${offer} coin. Some sales are not spoken of at chapel.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    if (optionId === "refuse") {
      adjustMorality(s, 2);
      const msg = "You send the gravedigger off empty-handed. The dead keep what little is still theirs.";
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    // donate
    rep(s, 3);
    adjustMorality(s, -1);
    const msg = "The unclaimed dead go to the infirmary school under seal. The surgeons send thanks; the crown notes your civic spirit.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const harvestFestival: StoryCard = {
  kind: "harvestFestival",
  eligible: (s) => s.day >= 10 && s.morality > -40,
  build: (s, rng) => {
    void rng;
    return {
      kind: "harvestFestival",
      day: s.day,
      prompt:
        "The village holds its harvest festival, and — wonder of wonders — the keep is invited. Fiddles carry over the wall; the cells press to the bars to listen.",
      options: [
        { id: "attend", label: "March them down, guarded", hint: "A rare joy calms every cell. One might slip the line." },
        { id: "gift", label: "Send a gift of food", hint: "Costs 20 food. The village toasts your name." },
        { id: "decline", label: "Decline politely", hint: "The keep stays a keep. Nothing ventured." },
      ],
      context: {},
    };
  },
  resolve: (s, rng, optionId, d) => {
    void d;
    if (optionId === "attend") {
      for (const p of s.prisoners) {
        if (p.alive) p.unrest = clamp(p.unrest - 15, 0, 100);
      }
      const living = s.prisoners.filter((p) => p.alive);
      if (living.length > 0 && rng.chance(0.2)) {
        const runner = living.sort((a, b) => b.unrest - a.unrest)[0];
        runner.alive = false;
        s.stats.totalEscapes += 1;
        rep(s, -BALANCE.reputation.perEscape);
        const msg = `The inmates dance in the square like free men — and ${runner.name} makes it true, vanishing between the bonfires.`;
        pushLog(s, msg, "bad");
        return { ok: true, message: msg, tone: "bad" };
      }
      const msg = "The inmates dance, badly and joyfully, ringed by warders. Every soul returns — lighter than it left.";
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    if (optionId === "gift") {
      s.resources.food = round1(Math.max(0, s.resources.food - 20));
      rep(s, 3);
      const msg = "A cart of the keep's food rolls down to the festival. The village drinks your health till the fires burn low.";
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    // decline
    const msg = "You send polite regrets. The fiddles play on without the keep.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const condemnedConfession: StoryCard = {
  kind: "condemnedConfession",
  eligible: (s) => s.prisoners.some((p) => p.alive && p.health < 30),
  build: (s, rng) => {
    const dying = s.prisoners
      .filter((p) => p.alive && p.health < 30)
      .sort((a, b) => a.health - b.health)[0];
    const price = rng.int(60, 100);
    return {
      kind: "condemnedConfession",
      day: s.day,
      prompt: `${dying.name} is dying, and knows it. Through cracked lips they confess to a crime the magistrate never solved — and beg to die at home, under their own roof.`,
      options: [
        { id: "record", label: "Record it; send them home", hint: "A cell freed, a debt of mercy paid. The town approves." },
        { id: "sellIt", label: "Sell the confession", hint: "The magistrate pays well for closed cases. The dying stay put." },
        { id: "ignore", label: "Ignore it", hint: "Fever talk. Nothing changes." },
      ],
      context: { targetId: dying.id, targetName: dying.name, price },
    };
  },
  resolve: (s, rng, optionId, d) => {
    void rng;
    const target = s.prisoners.find((p) => p.id === d.context.targetId && p.alive);
    const name = d.context.targetName as string;
    const price = d.context.price as number;
    if (!target) {
      const msg = `${name} is past confessing now.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "record") {
      target.alive = false; // leaves the keep, carried home
      s.stats.totalReleased += 1;
      adjustMorality(s, 5);
      rep(s, 2);
      const msg = `You take down every word, seal it, and let ${name} go home to die in a bed. The clerks grumble; the town does not.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    if (optionId === "sellIt") {
      s.resources.coin += price;
      s.stats.totalCoinEarned += price;
      adjustMorality(s, -4);
      const msg = `The magistrate pays ${price} coin for a solved case and a tidy file. ${name} coughs on in the cells.`;
      pushLog(s, msg, "bad");
      return { ok: true, message: msg, tone: "bad" };
    }
    // ignore
    const msg = "You let the fever talk drift out the bars with the night air.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

const rivalWarden: StoryCard = {
  kind: "rivalWarden",
  eligible: (s) => s.day >= 8 && s.prisoners.some((p) => p.alive),
  build: (s, rng) => {
    void rng;
    const prize = s.prisoners
      .filter((p) => p.alive)
      .sort((a, b) => b.dailyPayout - a.dailyPayout)[0];
    const price = prize.dailyPayout * 8;
    return {
      kind: "rivalWarden",
      day: s.day,
      prompt: `The warden of a rival keep sends a silk-gloved envoy: they will pay ${price} coin, cash, for ${prize.name} — your most profitable charge — transferred quietly to their cells.`,
      options: [
        { id: "sell", label: `Sell for ${price} coin`, hint: "Coin today, income gone tomorrow. Looks mercenary." },
        { id: "refuse", label: "Refuse publicly", hint: "Loyal to your charge — the crown likes a steady hand." },
        { id: "counter", label: "Demand double", hint: "Greedy gamble: a fortune, or the envoy walks insulted." },
      ],
      context: { targetId: prize.id, targetName: prize.name, price },
    };
  },
  resolve: (s, rng, optionId, d) => {
    const target = s.prisoners.find((p) => p.id === d.context.targetId && p.alive);
    const name = d.context.targetName as string;
    const price = d.context.price as number;
    if (!target) {
      const msg = `The envoy finds ${name} no longer in your keeping, and withdraws the offer.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "sell") {
      target.alive = false; // carted off to the rival's cells
      s.resources.coin += price;
      s.stats.totalCoinEarned += price;
      rep(s, -2);
      const msg = `${name} leaves in a barred coach and ${price} coin arrives by the same road. The magistrate hears you deal in charges like cattle.`;
      pushLog(s, msg, "neutral");
      return { ok: true, message: msg, tone: "neutral" };
    }
    if (optionId === "refuse") {
      rep(s, 2);
      const msg = "You refuse at the gate, loudly enough for the town to hear. A warden who cannot be bought keeps the crown's charges.";
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    // counter — demand double
    if (rng.chance(0.3)) {
      const doubled = price * 2;
      target.alive = false;
      s.resources.coin += doubled;
      s.stats.totalCoinEarned += doubled;
      const msg = `The envoy blinks, then pays: ${doubled} coin for ${name}. Somewhere, a rival warden is being shouted at.`;
      pushLog(s, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    rep(s, -1);
    const msg = "The envoy snaps their ledger shut at your greed and departs. The deal — and a little goodwill — collapses.";
    pushLog(s, msg, "neutral");
    return { ok: true, message: msg, tone: "neutral" };
  },
};

// ── Registry & entry points ──────────────────────────────────────────────────

const DECK: StoryCard[] = [
  plagueDoctor,
  ringleader,
  nobleVisit,
  smuggler,
  magistrateOrder,
  starvingVillage,
  duel,
  informant,
  witchTrial,
  taxAssessor,
  gravedigger,
  harvestFestival,
  condemnedConfession,
  rivalWarden,
];

export const STORY_KINDS: DecisionKind[] = DECK.map((c) => c.kind);

/**
 * Roll for at most one story decision today. Called by resolveEvents when no
 * riot/bribe already claimed the day. Deterministic given the RNG cursor.
 */
export function pickStoryDecision(state: GameState, rng: Rng): PendingDecision | undefined {
  const chance = Math.min(1, BALANCE.events.storyDecision.baseChance * opportunityScale(state));
  if (!rng.chance(chance)) return undefined;
  const eligible = DECK.filter((c) => c.eligible(state));
  if (eligible.length === 0) return undefined;
  const card = eligible[rng.int(0, eligible.length - 1)];
  return card.build(state, rng);
}

/** Resolve a story decision. Returns undefined if the kind isn't a story card. */
export function resolveStoryDecision(
  state: GameState,
  rng: Rng,
  optionId: string,
  decision: PendingDecision,
): StoryOutcome | undefined {
  const card = DECK.find((c) => c.kind === decision.kind);
  if (!card) return undefined;
  return card.resolve(state, rng, optionId, decision);
}
