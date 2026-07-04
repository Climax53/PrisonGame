// ─────────────────────────────────────────────────────────────────────────────
// Art registry — thin helpers over the generated manifest.
//
// Every image the game ships lives in public/art (built by
// scripts/process-art.py from the artist masters in assets/art) and is listed
// in artManifest.ts. All lookups go through hasArt()/artImage(), so a missing
// or failed-to-load file degrades to the emoji/vector placeholders the game
// shipped with — art can never crash the game.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from "phaser";
import { ART } from "./artManifest";
import type { LaborAssignment, Prisoner, Severity } from "../core";

/** Queue every manifest entry on a scene's loader (call from preload()). */
export function queueArt(scene: Phaser.Scene): void {
  scene.load.setPath("art");
  for (const [key, e] of Object.entries(ART)) {
    if (e.frames && e.fw && e.fh) {
      scene.load.spritesheet(key, e.file, { frameWidth: e.fw, frameHeight: e.fh });
    } else {
      scene.load.image(key, e.file);
    }
  }
  scene.load.setPath();
}

/** True when the key is both in the manifest and actually loaded. */
export function hasArt(scene: Phaser.Scene, key: string): boolean {
  return ART[key] !== undefined && scene.textures.exists(key);
}

/**
 * Add an image scaled to FIT inside maxW×maxH (aspect preserved), or null if
 * the texture is unavailable — callers fall back to their placeholder path.
 */
export function artImage(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  originX = 0.5,
  originY = 0.5,
): Phaser.GameObjects.Image | null {
  if (!hasArt(scene, key)) return null;
  const img = scene.add.image(x, y, key).setOrigin(originX, originY);
  img.setScale(Math.min(maxW / img.width, maxH / img.height));
  return img;
}

/**
 * Add an image scaled to COVER a w×h box (aspect preserved, overflow cropped
 * via Phaser's texture crop). Used for postcards, tiles, and backdrops.
 * `focusY` picks which horizontal band survives a vertical crop (0 top…1
 * bottom); keeps the castle, not the sky.
 */
export function artCover(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  focusY = 0.5,
): Phaser.GameObjects.Image | null {
  if (!hasArt(scene, key)) return null;
  const img = scene.add.image(0, 0, key).setOrigin(0, 0);
  const scale = Math.max(w / img.width, h / img.height);
  img.setScale(scale);
  const cropW = w / scale;
  const cropH = h / scale;
  const cropX = (img.width - cropW) / 2;
  const cropY = (img.height - cropH) * focusY;
  img.setCrop(cropX, cropY, cropW, cropH);
  // With a crop, the visible region keeps its place inside the full image, so
  // offset the image so the cropped window lands exactly at (x, y).
  img.setPosition(x - cropX * scale, y - cropY * scale);
  return img;
}

/** Register the sliced VFX + character animations once (idempotent). */
export function ensureAnims(scene: Phaser.Scene): void {
  const defs: Array<[string, number, number]> = [
    // key, frameRate, repeat (-1 loops)
    ["vfx_fire_burst", 14, 0],
    ["vfx_coin_sparkle", 16, 0],
    ["vfx_smoke_puff", 14, 0],
    ["vfx_torch_flame", 8, -1],
  ];
  for (const [key, frameRate, repeat] of defs) {
    const e = ART[key];
    if (!e?.frames || !scene.textures.exists(key) || scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: e.frames - 1 }),
      frameRate,
      repeat,
    });
  }
  // Character walk cycles — frame indices chosen by visual inspection of the
  // sliced body-sheets (guards: 0-1 face the viewer, 4-5 walk away bearing
  // the banner tabard; prisoners: 4-5 shuffle, 13-14 dig).
  const marches: Array<[string, string, number[], number]> = [
    ["guard_walk_down", "sprite_guard", [0, 1], 4],
    ["guard_walk_up", "sprite_guard", [4, 5], 4],
    ["prisoner_shuffle", "sprite_prisoner", [4, 5], 3],
    ["prisoner_dig", "sprite_prisoner", [13, 14], 3],
  ];
  for (const [key, sheet, frames, frameRate] of marches) {
    if (!ART[sheet]?.frames || !scene.textures.exists(sheet) || scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: frames.map((f) => ({ key: sheet, frame: f })),
      frameRate,
      repeat: -1,
    });
  }
}

// ── Domain → art-key mapping ─────────────────────────────────────────────────

/** Prisoner portrait base: severity picks the character, the id hash picks
 * the gender variant — stable for the prisoner's whole stay. */
export function prisonerPortraitKey(p: Prisoner): string {
  const sev: Record<Severity, string> = {
    petty: "petty",
    violent: "violent",
    political: "political",
    noble: "noble",
  };
  const n = parseInt(p.id.split("_")[1] ?? "0", 10) || 0;
  return `base_${sev[p.severity]}_${n % 2 === 0 ? "m" : "f"}`;
}

/** Subtle per-prisoner tint so the 8 portrait bases read less repetitive —
 * six near-white shifts (warm, cool, pale, ruddy…) cycled by id. Real variety
 * (more painted bases) is in the round-3 asset request. */
export function prisonerTint(p: Prisoner): number {
  const shades = [0xffffff, 0xf2e4d2, 0xdfe6f2, 0xe8f0dd, 0xf4dcdc, 0xe6dcf4];
  const n = parseInt(p.id.split("_")[1] ?? "0", 10) || 0;
  return shades[Math.floor(n / 2) % shades.length];
}

export function rarityFrameKey(rarity: string): string {
  return `frame_${rarity}`;
}

export function rarityPipKey(rarity: string): string {
  return `pip_${rarity}`;
}

/** The keep exterior for a tier at a given hour (winter overrides daylight). */
export function keepExteriorKey(
  tier: string,
  hour: number,
  winter: boolean,
): string {
  const phase = hour >= 21 ? "night" : winter ? "winter" : hour >= 17 ? "dusk" : "day";
  return `ext_${tier}_${phase}`;
}

/** Decision-kind → banner art (legends use their portrait instead). */
export function decisionBannerKey(kind: string): string {
  return `banner_${kind}`;
}

export const LABOR_ICON_KEY: Record<LaborAssignment, string> = {
  none: "icon_idle_dash",
  woodcutting: "icon_axe_wood",
  kitchen: "icon_pot_kitchen",
  latrine: "icon_bucket_cart_latrine",
  smithy: "icon_hammer_smithy",
};

/** Modal headline per decision kind (was riot/bribe-only before the art pass). */
export const DECISION_TITLE: Record<string, string> = {
  riot: "⚔  RIOT!",
  bribe: "💰  A Quiet Word",
  plagueDoctor: "🩺  The Plague Doctor",
  ringleader: "⛓  The Ringleader",
  nobleVisit: "👑  A Noble Visit",
  smuggler: "🗡  A Guard Turned Smuggler",
  magistrateOrder: "📜  The Magistrate's Seal",
  starvingVillage: "🍞  The Starving Village",
  duel: "⚔  The Yard Duel",
  informant: "🕯  The Informant",
  legend: "★  A Legend Stirs",
  witchTrial: "🔥  The Witch Trial",
  taxAssessor: "🧾  The Tax Assessor",
  gravedigger: "⚰  The Gravedigger's Offer",
  harvestFestival: "🌾  The Harvest Festival",
  condemnedConfession: "🕯  A Deathbed Confession",
  rivalWarden: "🏰  The Rival Warden",
};
