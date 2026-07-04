// ─────────────────────────────────────────────────────────────────────────────
// Prisoner traits — quirks of temperament and body
//
// A second flavour axis beside rarity: roughly half of inmates arrive with a
// trait that bends their numbers in one legible direction. Traits are locked at
// intake (rolled in factory.ts), applied daily by simulation.ts, and feed the
// escape forecast in danger.ts — so what the trait blurb promises is exactly
// what the simulation does.
// ─────────────────────────────────────────────────────────────────────────────

import type { TraitId } from "./types";

export interface TraitDef {
  id: TraitId;
  name: string;
  /** One-line flavour shown on the inmate card. */
  blurb: string;
  /** Multiplies the government's daily payout (locked at intake). */
  payoutMult: number;
  /** Added to the inmate's unrest every night (may be negative). */
  unrestPerDay: number;
  /** Added to the inmate's health every night (may be negative). */
  healthPerDay: number;
  /** Multiplies conscripted-labour output. */
  laborMult: number;
  /** Flat addition to the keep-level escape chance per such inmate held. */
  escapeBonus: number;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  sickly: {
    id: "sickly",
    name: "Gaol-Lunged",
    blurb: "The damp has settled in their chest. They fade a little every night.",
    payoutMult: 1.0,
    unrestPerDay: 0,
    healthPerDay: -2,
    laborMult: 0.85,
    escapeBonus: 0,
  },
  brawler: {
    id: "brawler",
    name: "Brawler",
    blurb: "Fists first, questions never. Strong at the bench, poison in the yard.",
    payoutMult: 1.05,
    unrestPerDay: 2,
    healthPerDay: 0,
    laborMult: 1.1,
    escapeBonus: 0,
  },
  silverTongue: {
    id: "silverTongue",
    name: "Silver-Tongue",
    blurb: "Talks the cells calm and the magistrate generous. Worth every coin.",
    payoutMult: 1.25,
    unrestPerDay: -1,
    healthPerDay: 0,
    laborMult: 1.0,
    escapeBonus: 0,
  },
  escapeArtist: {
    id: "escapeArtist",
    name: "Escape Artist",
    blurb: "No lock has held them yet. The crown pays dearly for you to try.",
    payoutMult: 1.35,
    unrestPerDay: 0,
    healthPerDay: 0,
    laborMult: 1.0,
    escapeBonus: 0.015,
  },
  penitent: {
    id: "penitent",
    name: "Penitent",
    blurb: "Prays at dawn, weeps at dusk. A quiet cell — and a thin payout.",
    payoutMult: 0.9,
    unrestPerDay: -2,
    healthPerDay: 0,
    laborMult: 1.0,
    escapeBonus: 0,
  },
  ironBack: {
    id: "ironBack",
    name: "Iron-Backed",
    blurb: "Works like two men and never complains — the body pays the toll.",
    payoutMult: 1.0,
    unrestPerDay: 0,
    healthPerDay: -1,
    laborMult: 1.35,
    escapeBonus: 0,
  },
};

/** Stable roll order for the intake trait draw (see factory.createPrisoner). */
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** Look up a trait definition; undefined for traitless inmates. */
export function traitDef(id?: TraitId): TraitDef | undefined {
  return id ? TRAITS[id] : undefined;
}
