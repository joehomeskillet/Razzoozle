/**
 * Deterministic Mulberry32 PRNG for the garden atmosphere.
 *
 * - 32-bit internal state, [0, 1) output, uniform distribution.
 * - Same seed → same sequence (callers can replay the entire scene).
 * - No Math.random() in the animation path; everything routes through here.
 *
 * The brief disallows non-deterministic sources; this module is the *only*
 * sanctioned randomness for wind, birds, motes, gust leaves, and grass
 * tuft phases.
 */

export interface SeededRandom {
  /** Next uniform sample in [0, 1). */
  next(): number
  /** Uniform sample in [min, max). */
  range(min: number, max: number): number
  /** Uniform integer in [min, max] (inclusive on both ends). */
  rangeInt(min: number, max: number): number
  /** Sign in {-1, +1} weighted by `bias` in [-1, 1] (0 = even). */
  signed(bias?: number): number
  /** Read-only snapshot of the current internal state. */
  readonly state: number
}

/**
 * Splitmix32 — small helper to seed Mulberry32 from any 32-bit value
 * (including string-derived ones) without biasing the first sample.
 */
function splitmix32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x9e3779b9) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) | 0
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) | 0
    return (t ^ (t >>> 15)) >>> 0
  }
}

export function createSeededRandom(seed: number): SeededRandom {
  const initialSeed = (seed | 0) || 0xc0ffee
  const sm = splitmix32(initialSeed)
  let state = sm() >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function range(min: number, max: number): number {
    if (max <= min) return min
    return min + next() * (max - min)
  }

  function rangeInt(min: number, max: number): number {
    if (max <= min) return Math.floor(min)
    return Math.floor(min + next() * (max - min + 1))
  }

  function signed(bias = 0): number {
    const v = next() * 2 - 1
    const clampedBias = Math.min(1, Math.max(-1, bias))
    return v + clampedBias * (1 - Math.abs(v))
  }

  return {
    next,
    range,
    rangeInt,
    signed,
    get state() {
      return state >>> 0
    },
  }
}

/** Default seed used when the host does not pass one. */
export const DEFAULT_ATMOSPHERE_SEED = 0xc0ffee