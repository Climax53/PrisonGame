// The player PROFILE — progress that outlives individual runs: achievements
// earned (which also unlock warden classes) and daily-challenge history.
// Persisted like saves: localStorage always, mirrored to native Preferences on
// device so it survives WebView storage eviction.

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { evaluateAchievements, unlockedWardens, type GameState } from "../core";

const KEY = "wardens_keep_profile_v1";

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
}

const DEFAULTS: Profile = {
  achievements: [],
  runsCompleted: 0,
  runsWon: 0,
  bestReign: 0,
};

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
    loaded = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    loaded = { ...DEFAULTS };
  }
  cached = loaded;
  return loaded;
}

function persist(p: Profile): void {
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
    const native = JSON.parse(value) as Profile;
    const merged: Profile = {
      achievements: [...new Set([...local.achievements, ...native.achievements])],
      runsCompleted: Math.max(local.runsCompleted, native.runsCompleted),
      runsWon: Math.max(local.runsWon, native.runsWon),
      bestReign: Math.max(local.bestReign, native.bestReign),
      lastDailyDate: native.lastDailyDate ?? local.lastDailyDate,
    };
    persist(merged);
    return merged;
  } catch {
    return local;
  }
}

/**
 * Evaluate the live state against the profile; persist and return any NEWLY
 * earned achievement ids (for toasts). Call after each day and at game end.
 */
export function recordProgress(state: GameState): string[] {
  const p = getProfile();
  const now = evaluateAchievements(state);
  const fresh = now.filter((id) => !p.achievements.includes(id));
  let dirty = fresh.length > 0;
  if (fresh.length > 0) p.achievements = [...p.achievements, ...fresh];
  if (state.day > p.bestReign) {
    p.bestReign = state.day;
    dirty = true;
  }
  if (state.gameOver) {
    p.runsCompleted += 1;
    if (state.gameWon) p.runsWon += 1;
    dirty = true;
  }
  if (dirty) persist(p);
  return fresh;
}

/** Record that today's daily challenge has been started. */
export function markDailyPlayed(date: string): void {
  const p = getProfile();
  p.lastDailyDate = date;
  persist(p);
}

/** Warden classes currently unlocked by this profile. */
export function availableWardens(): string[] {
  return unlockedWardens(getProfile().achievements);
}
