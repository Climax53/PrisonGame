// The player PROFILE — progress that outlives individual runs: achievements
// earned (which also unlock warden classes), daily-challenge history, and the
// Crown purse (premium currency — earnable by deeds, see docs/MONETIZATION.md).
// Persisted like saves: localStorage always, mirrored to native Preferences on
// device so it survives WebView storage eviction.

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  unlockedWardens,
  type AchievementDef,
  type GameState,
} from "../core";

const KEY = "wardens_keep_profile_v1";

/** Crowns paid for completing a daily challenge (once per calendar date). */
export const DAILY_CROWN_BOUNTY = 15;

export interface Profile {
  /** Achievement ids earned across all runs. */
  achievements: string[];
  /** Total runs finished (win or loss). */
  runsCompleted: number;
  runsWon: number;
  /** Best (longest) reign in days. */
  bestReign: number;
  /** ISO date of the last daily challenge played. */
  lastDailyDate?: string;
  /** Crown balance — premium currency, earnable by deeds. */
  crowns: number;
  /** Achievement ids whose crown bounty has already been paid (idempotence). */
  crownsGrantedFor: string[];
  /** Keep theme ids owned ("standard" is always owned). */
  ownedThemes: string[];
  /** Currently equipped keep theme id. */
  activeTheme: string;
  /** Warden classes unlocked with crowns (every one also earnable by deeds). */
  purchasedWardens: string[];
  /** ISO date the daily-challenge crown bounty was last paid. */
  lastDailyCrownDate?: string;
}

/** Fresh default profile. A factory (not a constant) so callers never share
 *  array references with each other or with a global template. */
function freshDefaults(): Profile {
  return {
    achievements: [],
    runsCompleted: 0,
    runsWon: 0,
    bestReign: 0,
    crowns: 0,
    crownsGrantedFor: [],
    ownedThemes: ["standard"],
    activeTheme: "standard",
    purchasedWardens: [],
  };
}

/** Normalize a stored blob (possibly from an older app version) into a valid
 *  Profile: default missing fields, clone arrays, repair invariants. */
function repair(raw: Partial<Profile>): Profile {
  const p: Profile = { ...freshDefaults(), ...raw };
  p.achievements = Array.isArray(p.achievements) ? [...p.achievements] : [];
  p.crownsGrantedFor = Array.isArray(p.crownsGrantedFor) ? [...p.crownsGrantedFor] : [];
  p.ownedThemes = Array.isArray(p.ownedThemes) ? [...p.ownedThemes] : ["standard"];
  p.purchasedWardens = Array.isArray(p.purchasedWardens) ? [...p.purchasedWardens] : [];
  if (typeof p.crowns !== "number" || !Number.isFinite(p.crowns) || p.crowns < 0) p.crowns = 0;
  if (!p.ownedThemes.includes("standard")) p.ownedThemes.unshift("standard");
  if (typeof p.activeTheme !== "string" || !p.ownedThemes.includes(p.activeTheme)) {
    p.activeTheme = "standard";
  }
  return p;
}

let cached: Profile | null = null;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getProfile(): Profile {
  if (cached) return cached;
  let loaded: Profile;
  try {
    const raw = localStorage.getItem(KEY);
    loaded = raw ? repair(JSON.parse(raw) as Partial<Profile>) : freshDefaults();
  } catch {
    loaded = freshDefaults();
  }
  cached = loaded;
  return loaded;
}

/** Drop the in-memory cache and re-read storage (boot repair, tests). */
export function reloadProfile(): Profile {
  cached = null;
  return getProfile();
}

/** Write the profile through the full save path (localStorage + native
 *  mirror). Store/UI code that mutates a profile calls this to commit;
 *  with no argument it re-persists the cached (live) profile. */
export function persistProfile(p: Profile = getProfile()): void {
  cached = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* non-fatal */
  }
  if (isNative()) {
    void Preferences.set({ key: KEY, value: JSON.stringify(p) }).catch(() => {});
  }
}

/** Merge native-stored profile at boot (device may outlive localStorage). */
export async function hydrateProfile(): Promise<Profile> {
  const local = getProfile();
  if (!isNative()) return local;
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return local;
    const native = JSON.parse(value) as Partial<Profile>;
    const merged: Profile = repair({
      achievements: [...new Set([...local.achievements, ...(native.achievements ?? [])])],
      runsCompleted: Math.max(local.runsCompleted, native.runsCompleted ?? 0),
      runsWon: Math.max(local.runsWon, native.runsWon ?? 0),
      bestReign: Math.max(local.bestReign, native.bestReign ?? 0),
      lastDailyDate: native.lastDailyDate ?? local.lastDailyDate,
      // Crowns: keep the larger balance — losing earned currency is the worse
      // failure mode when the two stores have diverged.
      crowns: Math.max(local.crowns, native.crowns ?? 0),
      crownsGrantedFor: [
        ...new Set([...local.crownsGrantedFor, ...(native.crownsGrantedFor ?? [])]),
      ],
      ownedThemes: [...new Set([...local.ownedThemes, ...(native.ownedThemes ?? [])])],
      activeTheme: native.activeTheme ?? local.activeTheme,
      purchasedWardens: [
        ...new Set([...local.purchasedWardens, ...(native.purchasedWardens ?? [])]),
      ],
      lastDailyCrownDate: native.lastDailyCrownDate ?? local.lastDailyCrownDate,
    });
    persistProfile(merged);
    return merged;
  } catch {
    return local;
  }
}

/**
 * Evaluate the live state against the profile; persist and return any NEWLY
 * earned achievement ids (for toasts). Call after each day and at game end.
 * Also pays out crown bounties for earned achievements (once per id, ever).
 */
export function recordProgress(state: GameState): string[] {
  const p = getProfile();
  const now = evaluateAchievements(state);
  const fresh = now.filter((id) => !p.achievements.includes(id));
  let dirty = fresh.length > 0;
  if (fresh.length > 0) p.achievements = [...p.achievements, ...fresh];
  // Crown bounties: each earned achievement pays its def's `crowns` exactly
  // once per profile, tracked by crownsGrantedFor. Defs may not carry a
  // `crowns` field yet (rolling out separately) — treat missing as 0.
  for (const id of p.achievements) {
    if (p.crownsGrantedFor.includes(id)) continue;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    const bounty = def ? ((def as AchievementDef & { crowns?: number }).crowns ?? 0) : 0;
    p.crowns += bounty;
    p.crownsGrantedFor = [...p.crownsGrantedFor, id];
    dirty = true;
  }
  if (state.day > p.bestReign) {
    p.bestReign = state.day;
    dirty = true;
  }
  if (state.gameOver) {
    p.runsCompleted += 1;
    if (state.gameWon) p.runsWon += 1;
    dirty = true;
  }
  if (dirty) persistProfile(p);
  return fresh;
}

/** Record that today's daily challenge has been started. */
export function markDailyPlayed(date: string): void {
  const p = getProfile();
  p.lastDailyDate = date;
  persistProfile(p);
}

/**
 * Pay the daily-challenge crown bounty — a flat DAILY_CROWN_BOUNTY, at most
 * once per calendar date. Returns the crowns granted (0 if already paid
 * today). The daily-challenge scene calls this on completion.
 */
export function grantDailyCrowns(date: string = new Date().toISOString().slice(0, 10)): number {
  const p = getProfile();
  if (p.lastDailyCrownDate === date) return 0;
  p.lastDailyCrownDate = date;
  p.crowns += DAILY_CROWN_BOUNTY;
  persistProfile(p);
  return DAILY_CROWN_BOUNTY;
}

/** Warden classes currently available to this profile: everything unlocked
 *  by deeds (achievements) plus any crown-purchased shortcuts. */
export function availableWardens(profile: Profile = getProfile()): string[] {
  return [...new Set([...unlockedWardens(profile.achievements), ...profile.purchasedWardens])];
}
