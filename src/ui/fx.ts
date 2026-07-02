// ─────────────────────────────────────────────────────────────────────────────
// Juice — the feedback layer
//
// "Juice" is the small, non-functional feedback that makes a game feel alive:
// numbers that pop, bars that ease, the screen that shakes when a riot erupts.
// None of it touches game state — it's pure presentation, and every effect is
// gated on the reduced-motion setting so it can be switched off entirely.
//
// Effects render on a dedicated high-depth layer that survives the scene's
// re-renders, so a floating "+40 coin" isn't wiped when the HUD rebuilds.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { COLORS, FONT } from "./theme";
import { getSettings } from "./settings";

/** Fire a haptic on device; silently a no-op on the web. */
function haptic(kind: "light" | "heavy" | "success" | "error"): void {
  try {
    if (!Capacitor.isNativePlatform()) return;
    if (kind === "light") void Haptics.impact({ style: ImpactStyle.Light });
    else if (kind === "heavy") void Haptics.impact({ style: ImpactStyle.Heavy });
    else if (kind === "success") {
      void Haptics.notification({ type: NotificationType.Success });
    } else void Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* haptics are garnish, never a crash */
  }
}

export class Juice {
  private scene: Phaser.Scene;
  private layer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Above everything except modals.
    this.layer = scene.add.container(0, 0).setDepth(900);
  }

  private get reduced(): boolean {
    return getSettings().reducedMotion;
  }

  /** A number that floats up and fades — e.g. "+40" in gold, "-12" in red. */
  floatNumber(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT.family,
        fontSize: "24px",
        color,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);
    this.layer.add(label);

    if (this.reduced) {
      // Still show it briefly, but don't animate motion.
      this.scene.time.delayedCall(900, () => label.destroy());
      return;
    }
    this.scene.tweens.add({
      targets: label,
      y: y - 60,
      alpha: 0,
      duration: 1100,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  /** Shake the camera. `intensity` ~0.005–0.02. No-op under reduced motion
   * (the haptic still fires — it's feedback, not motion). */
  shake(duration = 300, intensity = 0.01): void {
    haptic("heavy");
    if (this.reduced) return;
    this.scene.cameras.main.shake(duration, intensity);
  }

  /** Flash the screen a colour (e.g. red for a death, gold for reward). */
  flash(color: number, duration = 250): void {
    haptic(color === COLORS.blood ? "error" : "light");
    if (this.reduced) return;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    this.scene.cameras.main.flash(duration, r, g, b, true);
  }

  /**
   * Tween a bar's fill from one ratio to another. Given the fill rectangle and
   * its full pixel width, animates width. Snaps instantly under reduced motion.
   */
  tweenBar(
    fill: Phaser.GameObjects.Rectangle,
    fromRatio: number,
    toRatio: number,
    fullWidth: number,
  ): void {
    const to = Math.max(0, Math.min(1, toRatio)) * fullWidth;
    if (this.reduced || fromRatio === toRatio) {
      fill.width = to;
      return;
    }
    fill.width = Math.max(0, Math.min(1, fromRatio)) * fullWidth;
    this.scene.tweens.add({
      targets: fill,
      width: to,
      duration: 450,
      ease: "Cubic.easeOut",
    });
  }

  /**
   * A full-screen sweep used for the day transition. Runs `onCovered` at the
   * midpoint (screen fully covered) so the caller can swap content unseen.
   */
  dayWipe(dayLabel: string, onCovered: () => void): void {
    if (this.reduced) {
      onCovered();
      return;
    }
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cover = this.scene.add
      .rectangle(0, 0, w, h, COLORS.shadow, 1)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setDepth(950);
    const text = this.scene.add
      .text(w / 2, h / 2, dayLabel, {
        fontFamily: FONT.family,
        fontSize: "40px",
        color: COLORS.goldCss,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(951);
    this.layer.add([cover, text]);

    this.scene.tweens.add({
      targets: [cover, text],
      alpha: 1,
      duration: 220,
      ease: "Quad.easeIn",
      onComplete: () => {
        onCovered();
        this.scene.tweens.add({
          targets: [cover, text],
          alpha: 0,
          delay: 180,
          duration: 260,
          ease: "Quad.easeOut",
          onComplete: () => {
            cover.destroy();
            text.destroy();
          },
        });
      },
    });
  }

  /** A celebratory success haptic (achievements, victory). */
  celebrate(): void {
    haptic("success");
  }

  /** Slide a container in from a horizontal offset (tab change). */
  slideIn(target: Phaser.GameObjects.Container, fromDx = 40): void {
    if (this.reduced) return;
    const finalX = target.x;
    target.x = finalX + fromDx;
    target.alpha = 0;
    this.scene.tweens.add({
      targets: target,
      x: finalX,
      alpha: 1,
      duration: 220,
      ease: "Cubic.easeOut",
    });
  }
}
