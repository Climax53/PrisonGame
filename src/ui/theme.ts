// Central palette and type scale. Keeping colours in one place means the whole
// game can be re-skinned (or themed for night/day) from here. Colours are stored
// both as CSS strings (for DOM/stroke styles) and as 0xRRGGBB ints (for Phaser
// fills).

export const COLORS = {
  // Parchment / stone medieval palette.
  bg: 0x1a1410,
  bgCss: "#1a1410",
  panel: 0x2b2118,
  panelLight: 0x3a2d20,
  parchment: 0xe8d8b0,
  parchmentCss: "#e8d8b0",
  ink: 0x2b2118,
  inkCss: "#2b2118",
  gold: 0xd9a441,
  goldCss: "#d9a441",
  blood: 0xa83232,
  bloodCss: "#a83232",
  moss: 0x6b8e4e,
  mossCss: "#6b8e4e",
  steel: 0x8a94a0,
  steelCss: "#8a94a0",
  shadow: 0x0d0a07,

  // Severity colours for prisoner tiles.
  severity: {
    petty: 0x8a94a0, // steel grey
    violent: 0xa83232, // blood red
    political: 0x6a5acd, // royal purple-blue
    noble: 0xd9a441, // gold
  } as Record<string, number>,

  good: 0x6b8e4e,
  goodCss: "#6b8e4e",
  bad: 0xa83232,
  badCss: "#a83232",
  neutral: 0xc9b88f,
  neutralCss: "#c9b88f",
};

export const FONT = {
  family: 'ui-monospace, "Courier New", monospace',
  // A pixel-ish monospace gives the retro feel without bundling a font file.
};

/** Logical design resolution. The game scales to fit any phone via Phaser FIT. */
export const VIEW = {
  width: 720,
  height: 1280,
};
