// ─────────────────────────────────────────────────────────────────────────────
// Store — pure catalog data and purchase logic for the in-game shop.
//
// NO Phaser imports, no DOM: every function takes the profile object, mutates
// it, and reports {ok, error?}. Callers commit the change through profile.ts's
// persistProfile(). Real-money purchases never happen here — Crown packs are
// display data only; the payments adapter (payments.ts) owns that boundary.
//
// Design contract (docs/MONETIZATION.md): Crowns are EARNABLE by play, every
// warden stays earnable by deeds, themes are pure cosmetics, and coin
// conversion is a convenience in a single-player sim — never a requirement.
// ─────────────────────────────────────────────────────────────────────────────

import { WARDENS } from "../core";
import { availableWardens, type Profile } from "./profile";

// ── Keep themes (cosmetic re-dressings of the postcard + palette accent) ────

export interface KeepTheme {
  id: "standard" | "midnight" | "winterhold";
  name: string;
  blurb: string;
  costCrowns: number;
  /** Forces the postcard time-of-day phase, null = live clock. */
  phaseOverride: "night" | "winter" | null;
  accentColor: number;
}

export const THEMES: KeepTheme[] = [
  {
    id: "standard",
    name: "The Keep",
    blurb: "Your keep as the seasons and the sun find it — the honest stone.",
    costCrowns: 0,
    phaseOverride: null,
    accentColor: 0xd9a441,
  },
  {
    id: "midnight",
    name: "Midnight Keep",
    blurb: "An eternal torchlit night — stars over the battlements, embers in every sconce.",
    costCrowns: 60,
    phaseOverride: "night",
    accentColor: 0x6a5acd,
  },
  {
    id: "winterhold",
    name: "Winterhold",
    blurb: "The keep under endless snowfall — frosted walls, pale light, quiet drifts.",
    costCrowns: 60,
    phaseOverride: "winter",
    accentColor: 0x9fc4e0,
  },
];

// ── Crown packs — DISPLAY DATA ONLY ─────────────────────────────────────────
// Purchasing routes through payments.purchaseCrownPack(), which is a stub
// until a real storefront ships. Nothing in the app charges money.

export interface CrownPack {
  id: string;
  label: string;
  crowns: number;
  priceUsd: string;
}

export const CROWN_PACKS: CrownPack[] = [
  { id: "pouch", label: "Pouch of Crowns", crowns: 50, priceUsd: "$1.99" },
  { id: "chest", label: "Chest of Crowns", crowns: 140, priceUsd: "$4.99" },
  { id: "vault", label: "Royal Vault", crowns: 320, priceUsd: "$9.99" },
];

// ── Pricing knobs ───────────────────────────────────────────────────────────

/** Crown cost of instantly unlocking a warden class. This is a SHORTCUT:
 *  every warden remains earnable by deeds (achievements) forever — the store
 *  refuses to sell you one you could already play. */
export const WARDEN_UNLOCK_COST = 40; // crowns

/** Run-coin granted per crown melted down. */
export const COIN_PER_CROWN = 20;
/** Smallest crown amount convertible in one go. */
export const COIN_CONVERT_MIN = 5; // crowns

// ── Purchase logic (pure: mutate profile, caller persists) ─────────────────

export interface StoreResult {
  ok: boolean;
  error?: string;
}

function themeById(themeId: string): KeepTheme | undefined {
  return THEMES.find((t) => t.id === themeId);
}

/** Buy a keep theme with crowns; on success it is owned AND applied. */
export function buyTheme(profile: Profile, themeId: string): StoreResult {
  const theme = themeById(themeId);
  if (!theme) return { ok: false, error: "No such theme." };
  if (profile.ownedThemes.includes(theme.id)) {
    return { ok: false, error: `${theme.name} is already yours.` };
  }
  if (profile.crowns < theme.costCrowns) {
    return { ok: false, error: `Not enough crowns — ${theme.name} costs ${theme.costCrowns}.` };
  }
  profile.crowns -= theme.costCrowns;
  profile.ownedThemes = [...profile.ownedThemes, theme.id];
  profile.activeTheme = theme.id;
  return { ok: true };
}

/** Equip an owned theme. */
export function setActiveTheme(profile: Profile, themeId: string): StoreResult {
  const theme = themeById(themeId);
  if (!theme) return { ok: false, error: "No such theme." };
  if (!profile.ownedThemes.includes(theme.id)) {
    return { ok: false, error: `${theme.name} is not yours yet.` };
  }
  profile.activeTheme = theme.id;
  return { ok: true };
}

/** Instantly unlock a warden class for WARDEN_UNLOCK_COST crowns. Refused if
 *  the warden is already available — earned by deeds or previously bought —
 *  so a player can never pay for something they already have. */
export function buyWardenUnlock(profile: Profile, wardenId: string): StoreResult {
  const def = WARDENS.find((w) => w.id === wardenId);
  if (!def) return { ok: false, error: "No such warden." };
  if (availableWardens(profile).includes(wardenId)) {
    return { ok: false, error: `${def.name} already serves you.` };
  }
  if (profile.crowns < WARDEN_UNLOCK_COST) {
    return { ok: false, error: `Not enough crowns — a warden's writ costs ${WARDEN_UNLOCK_COST}.` };
  }
  profile.crowns -= WARDEN_UNLOCK_COST;
  profile.purchasedWardens = [...profile.purchasedWardens, wardenId];
  return { ok: true };
}

/** Melt crowns into run coin. Deducts from the profile and returns the coin
 *  amount for the CALLER to add to the live run state (this module never
 *  touches GameState). Minimum COIN_CONVERT_MIN crowns per conversion. */
export function convertCrownsToCoin(
  profile: Profile,
  crowns: number,
): StoreResult & { coin: number } {
  if (!Number.isInteger(crowns) || crowns < COIN_CONVERT_MIN) {
    return { ok: false, coin: 0, error: `Melt at least ${COIN_CONVERT_MIN} crowns at a time.` };
  }
  if (profile.crowns < crowns) {
    return { ok: false, coin: 0, error: "Not enough crowns." };
  }
  profile.crowns -= crowns;
  return { ok: true, coin: crowns * COIN_PER_CROWN };
}
