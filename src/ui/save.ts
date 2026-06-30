// Browser-side persistence. The core stays platform-agnostic (pure JSON), and
// this thin adapter writes that JSON to localStorage — which Capacitor maps to
// native WebView storage on iOS/Android, so saves survive app restarts.

import { deserialize, serialize, type GameState } from "../core";

const KEY = "wardens_keep_save_v1";

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, serialize(state));
  } catch {
    // Storage may be unavailable (private mode); failing to save is non-fatal.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
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
}
