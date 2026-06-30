// ─────────────────────────────────────────────────────────────────────────────
// Deterministic RNG (mulberry32)
//
// Math.random() is banned from the simulation core: it makes the game
// un-testable and un-replayable. Instead we carry a 32-bit cursor inside
// GameState and advance it with a small, fast, well-distributed PRNG. Given the
// same seed and the same actions, the game always plays out identically — which
// is exactly what the unit tests rely on.
// ─────────────────────────────────────────────────────────────────────────────

/** Advance `state` once and return the next cursor + a float in [0, 1). */
export function nextRandom(state: number): { state: number; value: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value };
}

/**
 * A small stateful helper so callers don't have to thread the cursor by hand.
 * Read `.state` back into GameState when you're done with a batch of rolls.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    // Force into 32-bit int space.
    this.state = seed | 0;
  }

  /** Float in [0, 1). */
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability `p` (0–1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element. Returns undefined for empty arrays. */
  pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }
}
