// Tiny pure helpers shared across the core.

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to one decimal place — keeps fractional resources from drifting. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
