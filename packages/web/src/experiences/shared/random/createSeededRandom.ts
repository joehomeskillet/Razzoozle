/**
 * Creates a deterministic pseudo-random number generator (PRNG) seeded with a given value.
 *
 * ⚠️ FORBIDDEN USE CASES (use Server/Rust instead):
 * - Game outcome (winner/loser determination)
 * - Score/points allocation
 * - Loot/reward selection
 * - Power-up availability (game balance)
 * - Target selection for effects
 * - Domain balancing logic
 *
 * ✅ ALLOWED: Visual-only determinism (animations, particle effects, color variation)
 *
 * @param seed - Number or string to initialize the generator. Same seed always produces identical sequences.
 * @returns A function that returns a float in [0, 1) on each call
 *
 * @example
 * const rng = createSeededRandom(42);
 * rng(); // 0.37621...
 * rng(); // 0.18362...
 *
 * const rng2 = createSeededRandom("game-123");
 * rng2(); // 0.91283... (same as any other seeding with "game-123")
 */
export function createSeededRandom(seed: number | string): () => number {
  // Convert string seed to number via simple hash if needed
  let numSeed: number
  if (typeof seed === 'string') {
    numSeed = simpleStringHash(seed)
  } else {
    numSeed = seed | 0 // Ensure integer
  }

  return mulberry32(numSeed)
}

/**
 * Mulberry32 PRNG algorithm: compact, deterministic, good distribution for visual purposes.
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
function mulberry32(seed: number): () => number {
  let a = seed
  return function seedRng(): number {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296)
  }
}

/**
 * Simple deterministic string-to-number hash for seed conversion.
 * Uses bit-mixing to distribute string characters evenly across number space.
 */
function simpleStringHash(str: string): number {
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // FNV-1a bit mixing
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0
  }
  return hash
}
