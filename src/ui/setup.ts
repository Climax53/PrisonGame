// ─────────────────────────────────────────────────────────────────────────────
// New-reign setup — warden select, identity, heraldry, pacing, daily challenge
//
// An overlay (like onboarding) rather than a separate Phaser scene: it reads
// the profile for warden unlocks, lets the player forge an identity, and hands
// a NewGameOptions back to GameScene. The daily challenge fixes warden and
// pacing and derives its seed from the date, so every player faces the same
// run — the deterministic core makes this free.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import {
  BANNER_COLORS,
  Rng,
  SIGILS,
  WARDENS,
  randomKeepName,
  randomWardenName,
  type NewGameOptions,
  type Pacing,
} from "../core";
import { availableWardens, getProfile, markDailyPlayed } from "./profile";
import { artCover, artImage } from "./art";
import { COLORS, FONT, VIEW } from "./theme";
import { makeButton, makePanel } from "./widgets";

/** Deterministic seed for a calendar date (same run for every player). */
export function dailySeed(isoDate: string): number {
  let h = 5381;
  for (let i = 0; i < isoDate.length; i++) {
    h = ((h << 5) + h + isoDate.charCodeAt(i)) | 0;
  }
  return h | 0;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface SetupResult {
  options: NewGameOptions;
  seed: number;
}

export function runSetup(
  scene: Phaser.Scene,
  onStart: (result: SetupResult) => void,
  onCancel?: () => void,
): void {
  const layer = scene.add.container(0, 0).setDepth(860);
  const unlocked = new Set(availableWardens());

  // Rolling identity state (UI-boundary RNG — the core stays pure).
  const uiRng = new Rng((Date.now() ^ 0x51ed) | 0);
  let wardenIdx = 0;
  let wardenName = randomWardenName(uiRng);
  let keepName = randomKeepName(uiRng);
  let sigilIdx = uiRng.int(0, SIGILS.length - 1);
  let colorIdx = uiRng.int(0, BANNER_COLORS.length - 1);
  let pacing: Pacing = "steady";

  const finishWith = (options: NewGameOptions, seed: number) => {
    layer.destroy();
    onStart({ options, seed });
  };

  const render = () => {
    layer.removeAll(true);
    layer.add(
      scene.add
        .rectangle(0, 0, VIEW.width, VIEW.height, COLORS.shadow, 0.96)
        .setOrigin(0, 0)
        .setInteractive(),
    );
    // The key art breathes behind the whole sheet, kept dark enough to read over.
    const kb = artCover(scene, "keyart", 0, 0, VIEW.width, VIEW.height, 0.35);
    if (kb) {
      kb.setAlpha(0.32);
      layer.add(kb);
    }

    // Carved-stone wordmark, or the plain text banner if the art is missing.
    const logo = artImage(scene, "logo", VIEW.width / 2, 46, 360, 130);
    if (logo) {
      layer.add(logo);
    } else {
      layer.add(
        scene.add
          .text(VIEW.width / 2, 40, "⚜  A NEW REIGN", {
            fontFamily: FONT.family,
            fontSize: "30px",
            color: COLORS.goldCss,
          })
          .setOrigin(0.5, 0),
      );
    }

    // ── Warden carousel — the candidate, painted, beside their record ──
    const w = WARDENS[wardenIdx];
    const isUnlocked = unlocked.has(w.id);
    const cardW = VIEW.width - 96;
    const cardH = 300;
    const card = makePanel(scene, 48, 110, cardW, cardH);
    card.add(
      scene.add
        .text(cardW / 2, 14, `${w.glyph}  ${w.name}`, {
          fontFamily: FONT.family,
          fontSize: "26px",
          color: isUnlocked ? COLORS.parchmentCss : COLORS.neutralCss,
        })
        .setOrigin(0.5, 0),
    );
    card.add(
      scene.add
        .text(cardW / 2, 48, w.epithet, {
          fontFamily: FONT.family,
          fontSize: "15px",
          color: COLORS.neutralCss,
          fontStyle: "italic",
        })
        .setOrigin(0.5, 0),
    );
    const portrait = artImage(scene, `warden_${w.id}`, 96, 172, 156, 156);
    let bx = 20;
    if (portrait) {
      if (!isUnlocked) portrait.setTint(0x2a2a2a);
      card.add(portrait);
      bx = 186;
    }
    card.add(
      scene.add.text(bx, 84, isUnlocked ? w.blurb : "🔒 Locked", {
        fontFamily: FONT.family,
        fontSize: "15px",
        color: COLORS.parchmentCss,
        wordWrap: { width: cardW - bx - 20 },
      }),
    );
    const effectLine = isUnlocked
      ? w.effects
      : `Unlock: ${unlockHint(w.unlockedBy)}`;
    card.add(
      scene.add.text(bx, 178, effectLine, {
        fontFamily: FONT.family,
        fontSize: "14px",
        color: isUnlocked ? COLORS.goldCss : COLORS.badCss,
        wordWrap: { width: cardW - bx - 20 },
      }),
    );
    card.add(
      scene.add
        .text(cardW / 2, cardH - 26, `${wardenIdx + 1} / ${WARDENS.length}`, {
          fontFamily: FONT.family,
          fontSize: "13px",
          color: COLORS.neutralCss,
        })
        .setOrigin(0.5, 0),
    );
    layer.add(card);
    layer.add(
      makeButton(scene, {
        x: 8, y: 224, width: 36, height: 72, label: "‹", fontSize: 28,
        onTap: () => {
          wardenIdx = (wardenIdx + WARDENS.length - 1) % WARDENS.length;
          render();
        },
      }),
    );
    layer.add(
      makeButton(scene, {
        x: VIEW.width - 44, y: 224, width: 36, height: 72, label: "›", fontSize: 28,
        onTap: () => {
          wardenIdx = (wardenIdx + 1) % WARDENS.length;
          render();
        },
      }),
    );

    // ── Identity ──
    let y = 428;
    const idPanel = makePanel(scene, 48, y, VIEW.width - 96, 150, "Identity");
    idPanel.add(
      scene.add.text(16, 40, `Warden:  ${wardenName}`, {
        fontFamily: FONT.family, fontSize: "18px", color: COLORS.parchmentCss,
      }),
    );
    idPanel.add(
      scene.add.text(16, 72, `Keep:    ${keepName}`, {
        fontFamily: FONT.family, fontSize: "18px", color: COLORS.parchmentCss,
      }),
    );
    idPanel.add(
      makeButton(scene, {
        x: VIEW.width - 96 - 70, y: 34, width: 56, height: 72, label: "🎲",
        fontSize: 24,
        onTap: () => {
          wardenName = randomWardenName(uiRng);
          keepName = randomKeepName(uiRng);
          render();
        },
      }),
    );
    // Heraldry row: sigils (painted when loaded) then colours.
    SIGILS.forEach((sig, i) => {
      const selected = i === sigilIdx;
      const size = selected ? 38 : 28;
      const img = artImage(scene, `sigil_${i}`, 32 + i * 42, 130, size, size);
      if (img) {
        img.setAlpha(selected ? 1 : 0.45).setInteractive({ useHandCursor: true });
        img.on("pointerup", () => {
          sigilIdx = i;
          render();
        });
        idPanel.add(img);
        return;
      }
      const b = scene.add
        .text(16 + i * 42, 116, sig, {
          fontFamily: FONT.family,
          fontSize: selected ? "28px" : "20px",
        })
        .setAlpha(selected ? 1 : 0.45)
        .setInteractive({ useHandCursor: true });
      b.on("pointerup", () => {
        sigilIdx = i;
        render();
      });
      idPanel.add(b);
    });
    BANNER_COLORS.forEach((c, i) => {
      const selected = i === colorIdx;
      const sw = scene.add
        .rectangle(360 + i * 34, 122, selected ? 26 : 20, selected ? 26 : 20, c)
        .setOrigin(0, 0)
        .setStrokeStyle(2, selected ? COLORS.parchment : COLORS.shadow)
        .setInteractive({ useHandCursor: true });
      sw.on("pointerup", () => {
        colorIdx = i;
        render();
      });
      idPanel.add(sw);
    });
    layer.add(idPanel);

    // ── Pacing ──
    y += 166;
    const pacePanel = makePanel(scene, 48, y, VIEW.width - 96, 96, "The Crown's Whim");
    const paces: Array<[Pacing, string, string]> = [
      ["slow", "🕯 Slow", "a gentler realm"],
      ["steady", "⚖ Steady", "the intended game"],
      ["chaos", "🔥 Chaos", "everything, oftener"],
    ];
    paces.forEach(([id, label, hint], i) => {
      const bw = (VIEW.width - 96 - 48) / 3;
      pacePanel.add(
        makeButton(scene, {
          x: 16 + i * (bw + 8), y: 34, width: bw, height: 40,
          label, fontSize: 15,
          fill: pacing === id ? COLORS.gold : COLORS.panelLight,
          textColor: pacing === id ? COLORS.inkCss : COLORS.parchmentCss,
          onTap: () => {
            pacing = id;
            render();
          },
        }),
      );
      pacePanel.add(
        scene.add
          .text(16 + i * (bw + 8) + bw / 2, 78, hint, {
            fontFamily: FONT.family, fontSize: "11px", color: COLORS.neutralCss,
          })
          .setOrigin(0.5, 0),
      );
    });
    layer.add(pacePanel);

    // ── Actions ──
    y += 118;
    layer.add(
      makeButton(scene, {
        x: 48, y, width: VIEW.width - 96, height: 64,
        label: isUnlocked ? "⚜  Take Command" : "🔒  Locked",
        fontSize: 24,
        fill: isUnlocked ? COLORS.gold : COLORS.panelLight,
        textColor: isUnlocked ? COLORS.inkCss : COLORS.neutralCss,
        enabled: isUnlocked,
        onTap: () =>
          finishWith(
            {
              warden: w.id,
              wardenName,
              keepName,
              heraldry: { color: colorIdx, sigil: SIGILS[sigilIdx] },
              pacing,
            },
            (Date.now() ^ Math.floor(performance.now() * 1e6)) | 0,
          ),
      }),
    );

    y += 76;
    const today = todayIso();
    const dailyDone = getProfile().lastDailyDate === today;
    layer.add(
      makeButton(scene, {
        x: 48, y, width: VIEW.width - 96, height: 52,
        label: dailyDone ? `📅 Daily Challenge — played` : `📅 Daily Challenge — ${today}`,
        fontSize: 17,
        enabled: !dailyDone,
        onTap: () => {
          markDailyPlayed(today);
          finishWith(
            {
              // Fixed loadout so every player faces the same run.
              warden: "steward",
              pacing: "steady",
              wardenName,
              keepName,
              heraldry: { color: colorIdx, sigil: SIGILS[sigilIdx] },
              dailyChallenge: today,
            },
            dailySeed(today),
          );
        },
      }),
    );
    layer.add(
      scene.add
        .text(VIEW.width / 2, y + 58, "Same seed for every warden in the realm. One attempt a day.", {
          fontFamily: FONT.family, fontSize: "12px", color: COLORS.neutralCss,
        })
        .setOrigin(0.5, 0),
    );

    if (onCancel) {
      layer.add(
        makeButton(scene, {
          x: 48, y: y + 84, width: VIEW.width - 96, height: 44,
          label: "Return to the current reign",
          fontSize: 15,
          onTap: () => {
            layer.destroy();
            onCancel();
          },
        }),
      );
    }
  };

  render();
}

function unlockHint(achievementId?: string): string {
  const hints: Record<string, string> = {
    longReign: "rule for 50 days in one reign",
    goldenLedger: "take in 2,000 coin in one reign",
    liberator: "free 15 prisoners in one reign",
    saintly: "reach the standing of Saint",
    feared: "reach the standing of Tyrant",
    mythKeeper: "hold a mythic prisoner",
  };
  return hints[achievementId ?? ""] ?? "keep playing";
}
