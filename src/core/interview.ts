// ─────────────────────────────────────────────────────────────────────────────
// Intake interviews — learning who you've locked up
//
// Prisoners arrive with their temperament hidden. The warden may put at most
// TWO questions to each inmate — ever — and each answer reveals one topic
// (recorded on Prisoner.revealed so it saves/loads). Answers are pure text
// derived from the prisoner: no RNG, no state mutation beyond the reveal list,
// so asking the same question twice repeats the same answer.
//
// Old saves: inmates that predate this feature load with revealed=["temper"]
// (see save.ts v6→v7), so nothing the player has already seen gets re-hidden.
// ─────────────────────────────────────────────────────────────────────────────

import { rarityRank } from "./rarity";
import { traitDef } from "./traits";
import type { InterviewTopic, Prisoner } from "./types";

/** The warden's side of the table, keyed by topic. */
export const INTERVIEW_QUESTIONS: Record<
  InterviewTopic,
  { label: string; question: string }
> = {
  temper: {
    label: "Their temper",
    question: "\"What manner of soul am I housing? Speak plainly.\"",
  },
  skills: {
    label: "Their hands",
    question: "\"Can you work? This keep has no room for idle hands.\"",
  },
  past: {
    label: "Their past",
    question: "\"Before the chains — what were you?\"",
  },
};

/** How many topics an inmate will ever answer. */
const MAX_QUESTIONS = 2;

const REFUSAL = "They've said all they'll say.";

/**
 * Put a question to the prisoner. Deterministic: the answer is derived purely
 * from the prisoner's stats, and the topic is appended to `p.revealed`.
 * An inmate answers at most two topics; further questions meet a stone face
 * (already-answered topics repeat their answer freely).
 */
export function askQuestion(p: Prisoner, topic: InterviewTopic): string {
  const revealed = (p.revealed ??= []);
  if (!revealed.includes(topic)) {
    if (revealed.length >= MAX_QUESTIONS) return REFUSAL;
    revealed.push(topic);
  }

  switch (topic) {
    case "temper": {
      const t = traitDef(p.trait);
      return t
        ? `${t.name} — ${t.blurb}`
        : "No notable temperament. As plain a soul as these cells ever hold.";
    }
    case "skills": {
      const laborMult = traitDef(p.trait)?.laborMult ?? 1;
      const hands =
        laborMult > 1
          ? "Eager hands — they'd work like two"
          : laborMult < 1
            ? "Frail hands — don't expect a full day's labour"
            : "Ordinary hands — a fair day's work, no more";
      const body =
        p.health >= 70
          ? "sound of body"
          : p.health >= 40
            ? "worn, but standing"
            : "in a poor way";
      return `${hands}, and ${body}.`;
    }
    case "past": {
      const parts: string[] = [];
      if ((traitDef(p.trait)?.escapeBonus ?? 0) > 0) {
        parts.push("They speak too fondly of open roads — watch this one.");
      }
      if (rarityRank(p.rarity) >= rarityRank("rare")) {
        parts.push("A name known to the roads; taverns tell stories of them.");
      }
      const bySeverity: Record<Prisoner["severity"], string> = {
        petty: "A small crime, poorly hidden — hunger more than malice.",
        violent: "Blood on their hands, and no great sorrow about it.",
        political: "They spoke against the crown, and speak carefully now.",
        noble: "High birth, low fortune — a name worth ransom yet.",
      };
      parts.push(bySeverity[p.severity]);
      return parts.join(" ");
    }
  }
}

/**
 * Whether the inmate's temperament is known to the player. True once the
 * temper question has been asked — and true for inmates whose `revealed` is
 * undefined (pre-interview saves), so old runs never hide what was already
 * shown.
 */
export function traitKnown(p: Prisoner): boolean {
  return p.revealed === undefined || p.revealed.includes("temper");
}
