/**
 * Hash a string seed into a 32-bit unsigned integer.
 */
export function hashSeed(seed: string | number): number {
  if (typeof seed === "number") return Math.abs(Math.floor(seed))
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Mulberry32 PRNG yielding deterministic pseudo-random floats in [0, 1).
 */
export function createMulberry32(seed: number): () => number {
  let a = seed
  return function mulberry32Random() {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Perform a deterministic Fisher-Yates shuffle on an array using a seed.
 * Returns a new shuffled array without mutating the original input.
 */
export function seededShuffle<T>(array: readonly T[], seed: string | number): T[] {
  const result = [...array]
  const random = createMulberry32(hashSeed(seed))

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }

  return result
}
