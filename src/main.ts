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
  // Crisp pixel-art scaling.
  pixelArt: true,
  render: { antialias: false, roundPixels: true },
};

const game = new Phaser.Game(config);

// Expose the running game for automated smoke-tests / debugging. Harmless in
// production; lets the headless verifier introspect live scene state.
(window as unknown as { __GAME__?: Phaser.Game }).__GAME__ = game;
