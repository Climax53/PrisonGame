// Cosmetic identity: warden names, keep names, heraldry. Pure data + seeded
// generators so a "randomize" tap is deterministic-friendly at the UI boundary.

import type { Rng } from "./rng";
import type { Heraldry } from "./types";

export const SIGILS = ["🦁", "🐺", "🦅", "🐍", "🌹", "🔥", "⚔", "🗝"] as const;

/** Banner colours (0xRRGGBB) — kept readable against the parchment UI. */
export const BANNER_COLORS = [
  0xa83232, // blood
  0xd9a441, // gold
  0x6b8e4e, // moss
  0x4d8fe0, // azure
  0x6a5acd, // royal
  0x8a94a0, // steel
  0xd97a2a, // ember
  0x3aa6a0, // verdigris
] as const;

const WARDEN_FIRST = [
  "Aldous", "Berta", "Caradoc", "Dagny", "Emeric", "Freya", "Godwin", "Hesta",
  "Ingmar", "Jorunn", "Kestrel", "Leofric", "Maud", "Nyle", "Ottoline", "Percival",
];
const WARDEN_LAST = [
  "Blackgate", "Coldiron", "Draven", "Fenwick", "Grimshaw", "Hollowell",
  "Ironward", "Mortlake", "Ravenhall", "Stonebrook", "Thorngood", "Vayne",
];

const KEEP_ADJ = [
  "Grey", "Black", "Broken", "Silent", "Iron", "Crooked", "Winter", "Raven",
  "Thorn", "Sorrow", "Wolf", "Ember",
];
const KEEP_NOUN = [
  "hollow Keep", "gate Hold", "stone Gaol", "water Keep", "fell Hold",
  "moor Gaol", "cliff Keep", "march Hold",
];

export function randomWardenName(rng: Rng): string {
  return `${rng.pick(WARDEN_FIRST)} ${rng.pick(WARDEN_LAST)}`;
}

export function randomKeepName(rng: Rng): string {
  return `${rng.pick(KEEP_ADJ)}${rng.pick(KEEP_NOUN)}`;
}

export function randomHeraldry(rng: Rng): Heraldry {
  return {
    color: rng.int(0, BANNER_COLORS.length - 1),
    sigil: rng.pick(SIGILS as unknown as string[]) ?? "🗝",
  };
}
