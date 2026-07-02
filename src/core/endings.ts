// ─────────────────────────────────────────────────────────────────────────────
// Endings — how a reign concludes
//
// Research directive: multiple, personality-reflecting endings drive replay
// (Reigns/BitLife), and the game must never scold — each ending describes the
// reign the player actually ran, in its own voice. Victory = holding Crown
// tier for 30 consecutive days; the flavor of that victory depends on how you
// got there. Losses keep their ids too so the summary screen can theme them.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE } from "./balance";
import type { GameState } from "./types";

export interface Ending {
  id: string;
  title: string;
  text: string;
  won: boolean;
}

const VICTORY_ENDINGS: Array<{ id: string; title: string; text: string; when: (s: GameState) => boolean }> = [
  {
    id: "ironWarden",
    title: "☠ The Iron Warden",
    text: "Thirty days the crown's darkest cells answered to you, and no one dared whisper mutiny. They will not sing songs about you. They will not need to. Your name alone keeps order now.",
    when: (s) => s.morality <= -33,
  },
  {
    id: "shepherd",
    title: "🕊 Shepherd of the Lost",
    text: "Thirty days at the crown's right hand, and not by fear. The freed speak your name in taverns; the magistrate calls it weakness, but even he cannot argue with quiet cells and full ledgers.",
    when: (s) => s.morality >= 33,
  },
  {
    id: "coinCounter",
    title: "🪙 The Coin-Counter",
    text: "Order, mercy — fine words. You kept the crown's prisoners and the crown's gold, and made both multiply. History forgets wardens. It remembers fortunes.",
    when: (s) => s.resources.coin >= 1500,
  },
  {
    id: "crownKeeper",
    title: "👑 Keeper of the Crown",
    text: "Thirty days holding the realm's most dangerous souls without scandal. The crown extends your commission indefinitely — the highest honor a gaoler will ever be offered, and the heaviest.",
    when: () => true, // default victory
  },
];

const LOSS_ENDINGS: Record<string, { title: string; text: string }> = {
  disgraced: {
    title: "⚖ Disgraced",
    text: "Riot, escape, and rumor did their work. The magistrate's men take your keys at the gate, and the town watches you walk out with nothing.",
  },
  bankrupt: {
    title: "📜 Debtor's Walk",
    text: "The creditors' seal goes on the storehouse door. There is a special irony in a gaoler marched to the debtor's cell of his own keep.",
  },
};

/** Choose the victory ending that matches how this reign was actually run. */
export function pickVictoryEnding(state: GameState): Ending {
  const found = VICTORY_ENDINGS.find((e) => e.when(state))!;
  return { id: found.id, title: found.title, text: found.text, won: true };
}

/** Resolve the ending descriptor for a finished game (loss or win). */
export function endingFor(state: GameState): Ending {
  if (state.gameWon) {
    const v = VICTORY_ENDINGS.find((e) => e.id === state.endingId) ?? VICTORY_ENDINGS[3];
    return { id: v.id, title: v.title, text: v.text, won: true };
  }
  const key = state.endingId && LOSS_ENDINGS[state.endingId] ? state.endingId : "disgraced";
  const l = LOSS_ENDINGS[key];
  return { id: key, title: l.title, text: l.text, won: false };
}

/**
 * Called at the end of each day: advance the victory clock and end the run if
 * the crown's trust has been held long enough.
 */
export function checkVictory(state: GameState): void {
  if (state.gameOver) return;
  if (state.tier === "crown") {
    state.crownDays += 1;
    if (state.crownDays >= BALANCE.victory.crownDaysRequired) {
      const ending = pickVictoryEnding(state);
      state.gameOver = true;
      state.gameWon = true;
      state.endingId = ending.id;
      state.gameOverReason = ending.text;
      state.pendingDecision = undefined;
    }
  } else {
    state.crownDays = 0;
  }
}
