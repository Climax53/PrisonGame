// Entry point. Configures Phaser to scale a fixed portrait design resolution to
// fit any phone screen, then launches the single game scene. All game logic
// lives under src/core; this file only wires up the engine.

import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { COLORS, VIEW } from "./ui/theme";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: COLORS.bgCss,
  width: VIEW.width,
  height: VIEW.height,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
  // The commissioned art is painterly "high-bit" pixel work delivered at
  // 1024px masters and downscaled — linear filtering keeps it smooth at any
  // phone DPI (nearest-neighbour would shimmer on non-integer scales).
  render: { antialias: true, roundPixels: true },
};

// Boot only after the bundled medieval fonts are ready, so no text object
// ever renders in a fallback face and then "pops". A short timeout guards
// against a stalled font load ever blocking the game.
const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load('28px "PirataOne"'),
    document.fonts.load('20px "MedievalSharp"'),
  ]),
  new Promise((resolve) => setTimeout(resolve, 2500)),
]);

void fontsReady.then(() => {
  const game = new Phaser.Game(config);
  // Expose the running game for automated smoke-tests / debugging. Harmless in
  // production; lets the headless verifier introspect live scene state.
  (window as unknown as { __GAME__?: Phaser.Game }).__GAME__ = game;
});
