// ─────────────────────────────────────────────────────────────────────────────
// First-time user experience — the first five minutes decide day-1 retention.
//
// Two beats (see docs/research/UI_DENSITY_DIRECTIVES.md):
//   1. The LETTER OF APPOINTMENT — an immediate "win": the magistrate's
//      painted letter names the player and pays a signing bonus.
//   2. THE FIRST DECREES — a learn-by-doing checklist. Each real action the
//      tutorial asks for pays coin when the player performs it in the actual
//      UI (no fake tutorial sandbox). Skippable, one-time, settings-persisted.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import type { GameState } from "../core";
import { artImage } from "./art";
import { getSettings, updateSettings } from "./settings";
import { COLORS, FONT, VIEW } from "./theme";
import { makeButton, makePanel } from "./widgets";

export type DecreeStep =
  | "acceptPrisoner"
  | "assignLabour"
  | "buyProvisions"
  | "skipToEvening"
  | "retire";

export const DECREE_ORDER: DecreeStep[] = [
  "acceptPrisoner",
  "assignLabour",
  "buyProvisions",
  "skipToEvening",
  "retire",
];

export const DECREE_TEXT: Record<DecreeStep, string> = {
  acceptPrisoner: "Accept a prisoner (Offers)",
  assignLabour: "Put an inmate to work",
  buyProvisions: "Buy provisions (Market)",
  skipToEvening: "Skip to evening",
  retire: "Retire for the night",
};

export const DECREE_REWARD = 15; // coin per step
export const DECREE_FINAL_BONUS = 50; // on completing the lot

interface FtueState {
  done: boolean;
  steps: Partial<Record<DecreeStep, boolean>>;
}

function readFtue(): FtueState {
  return (getSettings().ftue as FtueState | undefined) ?? { done: false, steps: {} };
}

function writeFtue(f: FtueState): void {
  updateSettings({ ftue: f });
}

export function ftueActive(): boolean {
  return !readFtue().done;
}

/** Mark a decree step done. Returns the coin reward earned (0 if repeat or
 * the checklist is finished) — the scene credits it and refreshes the strip. */
export function markDecree(step: DecreeStep): number {
  const f = readFtue();
  if (f.done || f.steps[step]) return 0;
  f.steps[step] = true;
  let reward = DECREE_REWARD;
  if (DECREE_ORDER.every((s) => f.steps[s])) {
    f.done = true;
    reward += DECREE_FINAL_BONUS;
  }
  writeFtue(f);
  return reward;
}

export function dismissDecrees(): void {
  const f = readFtue();
  f.done = true;
  writeFtue(f);
}

/** The compact progress strip shown while decrees remain. Returns the strip
 * container (caller adds it to the content layer) or null when finished. */
export function buildDecreeStrip(
  scene: Phaser.Scene,
  y: number,
  onDismiss: () => void,
): Phaser.GameObjects.Container | null {
  const f = readFtue();
  if (f.done) return null;
  const w = VIEW.width - 32;
  const doneCount = DECREE_ORDER.filter((s) => f.steps[s]).length;
  const next = DECREE_ORDER.find((s) => !f.steps[s])!;
  const strip = makePanel(scene, 16, y, w, 44);
  strip.add(
    scene.add.text(12, 7, "📜", { fontFamily: FONT.family, fontSize: "20px" }),
  );
  strip.add(
    scene.add.text(44, 5, `First Decrees ${doneCount}/${DECREE_ORDER.length}:`, {
      fontFamily: FONT.medieval,
      fontSize: "17px",
      color: COLORS.goldCss,
    }),
  );
  strip.add(
    scene.add.text(256, 10, `${DECREE_TEXT[next]}  (+${DECREE_REWARD}🪙)`, {
      fontFamily: FONT.family,
      fontSize: "15px",
      color: COLORS.parchmentCss,
    }),
  );
  strip.add(
    makeButton(scene, {
      x: w - 38, y: 7, width: 30, height: 30, label: "✕", fontSize: 14,
      fill: COLORS.panelLight,
      onTap: () => {
        dismissDecrees();
        onDismiss();
      },
    }),
  );
  return strip;
}

/** The Letter of Appointment — shown once at the start of every new reign.
 * Pays a signing bonus into the run when sealed. */
export function showAppointmentLetter(
  scene: Phaser.Scene,
  state: GameState,
  onDone: () => void,
): void {
  const layer = scene.add.container(0, 0).setDepth(845);
  layer.add(
    scene.add
      .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.88)
      .setOrigin(0, 0)
      .setInteractive(),
  );
  const w = VIEW.width - 88;
  const h = 640;
  const py = (VIEW.height - h) / 2;
  const panel = makePanel(scene, 44, py, w, h);
  panel.add(
    scene.add
      .text(w / 2, 20, "By Order of the Crown", {
        fontFamily: FONT.display,
        fontSize: "34px",
        color: COLORS.goldCss,
      })
      .setOrigin(0.5, 0),
  );
  const mag = artImage(scene, "cast_magistrate", w / 2, 200, 220, 220);
  if (mag) panel.add(mag);
  panel.add(
    scene.add
      .text(
        w / 2,
        330,
        `Let it be known that ${state.wardenName}\nis appointed Warden of ${state.keepName}.\n\nHold the Crown's prisoners. Keep its peace.\nCollect its coin. Answer for its dead.\n\nThe magistrate watches with interest —\nand encloses a signing bonus of 40 coin.`,
        {
          fontFamily: FONT.family,
          fontSize: "17px",
          color: COLORS.parchmentCss,
          align: "center",
          lineSpacing: 5,
        },
      )
      .setOrigin(0.5, 0),
  );
  panel.add(
    makeButton(scene, {
      x: 24, y: h - 76, width: w - 48, height: 58,
      label: "⚜  Break the Seal  (+40 🪙)",
      fontSize: 22,
      fill: COLORS.gold,
      textColor: COLORS.inkCss,
      onTap: () => {
        state.resources.coin += 40;
        layer.destroy();
        onDone();
      },
    }),
  );
  layer.add(panel);
}
