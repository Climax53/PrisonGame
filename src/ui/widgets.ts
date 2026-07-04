// Reusable Phaser UI widgets: tappable buttons, stat bars, and labelled panels.
// These wrap the low-level Phaser primitives so scenes read declaratively and
// the touch-target sizing (important on phones) lives in one place.

import Phaser from "phaser";
import { COLORS, FONT } from "./theme";

/** Minimum comfortable touch target in design pixels (~44pt on device). */
export const MIN_TOUCH = 64;

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  height?: number;
  label: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: number;
  textColor?: string;
  enabled?: boolean;
  onTap: () => void;
}

/** A rounded, tappable button. Returns a container you can destroy/reposition. */
export function makeButton(
  scene: Phaser.Scene,
  opts: ButtonOptions,
): Phaser.GameObjects.Container {
  const height = opts.height ?? MIN_TOUCH;
  const enabled = opts.enabled ?? true;
  const fill = opts.fill ?? COLORS.panelLight;

  const bg = scene.add
    .rectangle(0, 0, opts.width, height, fill)
    .setStrokeStyle(2, COLORS.gold, enabled ? 0.9 : 0.25)
    .setOrigin(0, 0);
  bg.setAlpha(enabled ? 1 : 0.45);

  const text = scene.add
    .text(opts.width / 2, height / 2, opts.label, {
      // Buttons speak in the medieval face; callers can override for stat text.
      fontFamily: opts.fontFamily ?? FONT.medieval,
      fontSize: `${opts.fontSize ?? 26}px`,
      color: opts.textColor ?? COLORS.parchmentCss,
      align: "center",
      wordWrap: { width: opts.width - 16 },
    })
    .setOrigin(0.5, 0.5);

  const container = scene.add.container(opts.x, opts.y, [bg, text]);
  container.setSize(opts.width, height);

  if (enabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerover", () => bg.setFillStyle(COLORS.gold, 0.25));
    bg.on("pointerout", () => bg.setFillStyle(fill));
    bg.on("pointerdown", () => bg.setScale(0.97));
    bg.on("pointerup", () => {
      bg.setScale(1);
      opts.onTap();
    });
  }
  return container;
}

/** A small labelled value chip used in the top status bar. */
export function makeStatChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  icon: string,
  value: string,
  color: string = COLORS.parchmentCss,
): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, width, 56, COLORS.panel)
    .setStrokeStyle(1, COLORS.gold, 0.5)
    .setOrigin(0, 0);
  const text = scene.add
    .text(width / 2, 28, `${icon} ${value}`, {
      fontFamily: FONT.family,
      fontSize: "20px",
      color,
    })
    .setOrigin(0.5, 0.5);
  return scene.add.container(x, y, [bg, text]);
}

/** A horizontal progress bar (health, unrest, reputation). */
export function makeBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  ratio: number,
  color: number,
): Phaser.GameObjects.Container {
  const clamped = Math.max(0, Math.min(1, ratio));
  const fullWidth = width - 2;
  const track = scene.add
    .rectangle(0, 0, width, height, COLORS.shadow)
    .setOrigin(0, 0);
  const fillBar = scene.add
    .rectangle(1, 1, Math.max(0, fullWidth * clamped), height - 2, color)
    .setOrigin(0, 0);
  const container = scene.add.container(x, y, [track, fillBar]);
  // Expose the fill rect + its full width so callers can animate the bar.
  container.setData("fill", fillBar);
  container.setData("fullWidth", fullWidth);
  return container;
}

/** A titled panel background. */
export function makePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  title?: string,
): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, width, height, COLORS.panel, 0.92)
    .setStrokeStyle(2, COLORS.gold, 0.6)
    .setOrigin(0, 0);
  const parts: Phaser.GameObjects.GameObject[] = [bg];
  if (title) {
    parts.push(
      scene.add.text(14, 6, title, {
        // Panel titles carry the big medieval display face.
        fontFamily: FONT.display,
        fontSize: "30px",
        color: COLORS.goldCss,
      }),
    );
  }
  return scene.add.container(x, y, parts);
}
