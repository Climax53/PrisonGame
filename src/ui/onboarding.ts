// ─────────────────────────────────────────────────────────────────────────────
// First-run onboarding
//
// Research: opaque onboarding is the genre's #2 most-hated trait — but nobody
// wants an unskippable lecture either. This is a five-step, always-skippable
// tooltip tour: dim the screen, ring the relevant region in gold, one short
// panel of text, Next/Skip. State lives in settings (shows exactly once).
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import { COLORS, FONT, VIEW } from "./theme";
import { makeButton } from "./widgets";
import { updateSettings } from "./settings";

interface Step {
  text: string;
  /** Region to highlight (design px). Omit for a centered welcome card. */
  highlight?: { x: number; y: number; w: number; h: number };
}

const STEPS: Step[] = [
  {
    text: "⚜ Welcome, Warden.\n\nThe crown pays you to hold its prisoners — every day, per head. Keep them alive, keep them quiet, and your name will rise from village gaoler to Keeper of the Crown.",
  },
  {
    text: "Your stores. 🪙 Coin pays wages and buys supplies. 🍖 Food and 🪵 firewood are eaten daily — run short and the cells starve or freeze. 🪣 Buckets keep sickness at bay.",
    highlight: { x: 0, y: 50, w: VIEW.width, h: 60 },
  },
  {
    text: "Your conscience and your warnings. The ⚖ bar tracks what kind of warden you're becoming — cruelty and mercy each carry their own price. Below it, tomorrow's dangers: a warning, not a promise.",
    highlight: { x: 12, y: 224, w: VIEW.width - 24, h: 142 },
  },
  {
    text: "📜 Offers: the crown sends prisoners; you choose whom to hold. Rarer inmates pay far more — and are far more trouble. 🔒 Cells shows who sleeps where. ⚒ Market: stores, warders, buildings.",
    highlight: { x: 0, y: 156, w: VIEW.width, h: 58 },
  },
  {
    text: "The sun crosses on its own — coin and labour trickle in each hour until the 9 o'clock bell, when the keep can do no more. Then Retire for the Night: pay, hunger, schemes — and sometimes a choice only you can make.\n\nHold the crown's trust for 30 days at the highest tier to win your place in history.",
    highlight: { x: 16, y: VIEW.height - 84, w: VIEW.width - 32, h: 68 },
  },
];

/** Run the tour. Calls `onDone` after finish or skip. */
export function runOnboarding(scene: Phaser.Scene, onDone: () => void): void {
  const layer = scene.add.container(0, 0).setDepth(850);
  let step = 0;

  const finish = () => {
    updateSettings({ hasOnboarded: true });
    layer.destroy();
    onDone();
  };

  const render = () => {
    layer.removeAll(true);
    const s = STEPS[step];

    // Input-blocking dim.
    layer.add(
      scene.add
        .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.72)
        .setOrigin(0, 0)
        .setInteractive(),
    );

    // Gold ring around the featured region.
    if (s.highlight) {
      const g = scene.add.graphics();
      g.lineStyle(3, COLORS.gold, 1);
      g.strokeRoundedRect(s.highlight.x, s.highlight.y, s.highlight.w, s.highlight.h, 6);
      layer.add(g);
    }

    // Text card — placed clear of the highlight.
    const cardW = VIEW.width - 64;
    const cardH = 240;
    const highlightMidY = s.highlight ? s.highlight.y + s.highlight.h / 2 : VIEW.height / 2;
    const cardY = highlightMidY < VIEW.height / 2 ? VIEW.height - cardH - 140 : 180;
    const card = scene.add
      .rectangle(32, cardY, cardW, cardH, COLORS.panel, 0.97)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.gold, 0.8);
    const text = scene.add.text(48, cardY + 16, s.text, {
      fontFamily: FONT.family,
      fontSize: "18px",
      color: COLORS.parchmentCss,
      wordWrap: { width: cardW - 32 },
      lineSpacing: 4,
    });
    layer.add([card, text]);

    layer.add(
      makeButton(scene, {
        x: 32 + cardW - 150, y: cardY + cardH - 60, width: 134, height: 46,
        label: step === STEPS.length - 1 ? "Begin" : "Next ›",
        fontSize: 19,
        fill: COLORS.gold,
        textColor: COLORS.inkCss,
        onTap: () => {
          step += 1;
          if (step >= STEPS.length) finish();
          else render();
        },
      }),
    );
    layer.add(
      makeButton(scene, {
        x: 48, y: cardY + cardH - 60, width: 100, height: 46,
        label: "Skip",
        fontSize: 17,
        fill: COLORS.panelLight,
        onTap: finish,
      }),
    );
    layer.add(
      scene.add
        .text(VIEW.width / 2, cardY + cardH - 90, `${step + 1} / ${STEPS.length}`, {
          fontFamily: FONT.family,
          fontSize: "13px",
          color: COLORS.neutralCss,
        })
        .setOrigin(0.5, 0),
    );
  };

  render();
}
