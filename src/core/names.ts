// Flavour name pools for procedurally generated inmates and guards.
// Kept deterministic by always drawing through the seeded Rng.
//
// Prisoner first names are split by gender because the UI picks a portrait
// from id parity (even id → male art, odd id → female art, see
// src/ui/art.ts prisonerPortraitKey). factory.createPrisoner derives the same
// parity from the freshly minted id and passes it here, so the name always
// matches the face.

import { Rng } from "./rng";

export const MALE_NAMES = [
  "Aldric", "Bram", "Cedric", "Doran", "Edmund", "Falk", "Gunnar", "Hale",
  "Ivo", "Joren", "Kael", "Lothar", "Mott", "Nyle", "Osric", "Pell",
  "Quill", "Rowan", "Sten", "Tobias", "Ulric", "Vance", "Wace", "Yorick",
  "Ansel", "Bertram", "Cuthbert", "Eadric", "Fulk", "Godwin", "Hamon",
  "Jocelin", "Kenric", "Leofric", "Odo", "Piers", "Ranulf", "Thurstan",
  "Wulfric", "Baldwin", "Drogo", "Ingram",
];

export const FEMALE_NAMES = [
  "Mara", "Bryn", "Cara", "Della", "Esme", "Fenna", "Greta", "Hilde",
  "Dagny", "Isolde", "Maud", "Nest", "Sibyl", "Una", "Ysabel", "Alys",
  "Clemence", "Emmot", "Gisela", "Hawise", "Agnes", "Beatrix", "Cecily",
  "Edith", "Frida", "Gwen", "Ida", "Joan", "Linnet", "Margery", "Nell",
  "Orla", "Petra", "Rohese", "Tilda", "Winifred",
];

const EPITHET = [
  "the Lame", "the Quiet", "Blackfinger", "Two-Teeth", "the Cur", "Ironjaw",
  "the Pious", "Coldhand", "the Younger", "Ratbane", "the Sly", "Oakheart",
  "the Drunk", "Greythorn", "the Bold", "Mudfoot", "the Cruel", "Saltbeard",
];

/** Names heard only in the guards' mess — steadier stock than the cells. */
const GUARD_FIRST = [
  "Alard", "Bennet", "Colby", "Dunstan", "Everard", "Gervase", "Hubert",
  "Jordan", "Lambert", "Miles", "Norbert", "Osbert", "Reinold", "Simond",
  "Walter",
];

/**
 * Pool the guard corps draws from: the male stock plus their own. Guards have
 * no gendered portraits yet, so they keep a single pool; split it the same way
 * as the prisoners if guard portraits ever land.
 */
const GUARD_POOL = [...MALE_NAMES, ...GUARD_FIRST];

/** Draw an inmate name from the pool matching their portrait gender. */
export function randomPrisonerName(rng: Rng, male: boolean): string {
  const first = rng.pick(male ? MALE_NAMES : FEMALE_NAMES) ?? "Inmate";
  // ~60% of inmates get a colourful epithet.
  if (rng.chance(0.6)) {
    return `${first} ${rng.pick(EPITHET)}`;
  }
  return first;
}

export function randomGuardName(rng: Rng): string {
  const first = rng.pick(GUARD_POOL) ?? "Guard";
  return `Guard ${first}`;
}
