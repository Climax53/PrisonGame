// Persistence adapter.
//
// The core stays platform-agnostic (pure JSON); this adapter decides WHERE the
// JSON lives. Two layers:
//   1. localStorage — synchronous, instant, works everywhere. BUT on iOS,
//      WKWebView storage can be evicted under storage pressure, which would
//      silently delete a player's keep.
//   2. Capacitor Preferences — native UserDefaults/SharedPreferences. Durable
//      on device, unavailable in a plain browser.
// We write to both and, at boot, prefer whichever copy has progressed further
// (they can diverge if localStorage was purged). On the web this degrades to
// plain localStorage with zero behavior change.

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { deserialize, serialize, type GameState } from "../core";

const KEY = "wardens_keep_save_v1";

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function saveGame(state: GameState): void {
  const json = serialize(state);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // Storage may be unavailable (private mode); non-fatal.
  }
  if (isNative()) {
    // Fire-and-forget mirror to durable native storage.
    void Preferences.set({ key: KEY, value: json }).catch(() => {});
  }
}

/** Synchronous load from localStorage only (web fast-path). */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Full load: consult native storage too and prefer the furthest-progressed
 * copy. Await this at boot; afterwards saveGame keeps both layers in sync.
 */
export async function loadGameAsync(): Promise<GameState | null> {
  const local = loadGame();
  if (!isNative()) return local;
  try {
    const { value } = await Preferences.get({ key: KEY });
    const native = value ? deserialize(value) : null;
    if (!native) return local;
    if (!local) return native;
    return native.day > local.day ? native : local;
  } catch {
    return local;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (isNative()) {
    void Preferences.remove({ key: KEY }).catch(() => {});
  }
}
