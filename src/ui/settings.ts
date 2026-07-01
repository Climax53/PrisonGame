// Lightweight client settings, persisted to localStorage (→ native storage via
// Capacitor). Kept separate from the game save so preferences survive a new run.
// Reduced-motion is an accessibility must-have: it turns off shakes/tweens for
// players who are motion-sensitive, without changing any game logic.

export interface Settings {
  reducedMotion: boolean;
  sound: boolean;
}

const KEY = "wardens_keep_settings_v1";

const DEFAULTS: Settings = {
  reducedMotion: prefersReducedMotion(),
  sound: true,
};

/** Respect the OS-level "reduce motion" accessibility flag as the default. */
function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

let current: Settings | null = null;

export function getSettings(): Settings {
  if (current) return current;
  let loaded: Settings;
  try {
    const raw = localStorage.getItem(KEY);
    loaded = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    loaded = { ...DEFAULTS };
  }
  current = loaded;
  return loaded;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  return current;
}
