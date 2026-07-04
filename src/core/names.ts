// Flavour name pools for procedurally generated inmates and guards.
// Kept deterministic by always drawing through the seeded Rng.

import { Rng } from "./rng";

const FIRST = [
  "Aldric", "Bram", "Cedric", "Doran", "Edmund", "Falk", "Gunnar", "Hale",
  "Ivo", "Joren", "Kael", "Lothar", "Mott", "Nyle", "Osric", "Pell",
  "Quill", "Rowan", "Sten", "Tobias", "Ulric", "Vance", "Wace", "Yorick",
  "Mara", "Bryn", "Cara", "Della", "Esme", "Fenna", "Greta", "Hilde",
  "Ansel", "Bertram", "Cuthbert", "Dagny", "Eadric", "Fulk", "Godwin", "Hamon",
  "Isolde", "Jocelin", "Kenric", "Leofric", "Maud", "Nest", "Odo", "Piers",
  "Ranulf", "Sibyl", "Thurstan", "Una", "Wulfric", "Ysabel", "Alys", "Baldwin",
  "Clemence", "Drogo", "Emmot", "Gisela", "Hawise", "Ingram",
];

const EPITHET = [
  "the Lame", "the Quiet", "Blackfinger", "Two-Teeth", "the Cur", "Ironjaw",
  "the Pious", "Coldhand", "the Younger", "Ratbane", "the Sly", "Oakheart",
  "the Drunk", "Greythorn", "the Bold", "Mudfoot", "the Cruel", "Saltbeard",
];

/** Names heard only in the warders' mess — steadier stock than the cells. */
const GUARD_FIRST = [
  "Alard", "Bennet", "Colby", "Dunstan", "Everard", "Gervase", "Hubert",
  "Jordan", "Lambert", "Miles", "Norbert", "Osbert", "Reinold", "Simond",
  "Walter",
];

/** Pool the warder corps draws from: the common stock plus their own. */
const GUARD_POOL = [...FIRST, ...GUARD_FIRST];

export function randomPrisonerName(rng: Rng): string {
  const first = rng.pick(FIRST) ?? "Inmate";
  // ~60% of inmates get a colourful epithet.
  if (rng.chance(0.6)) {
    return `${first} ${rng.pick(EPITHET)}`;
  }
  return first;
}

export function randomGuardName(rng: Rng): string {
  const first = rng.pick(GUARD_POOL) ?? "Guard";
  return `Warder ${first}`;
}
