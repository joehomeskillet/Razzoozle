/**
 * Input parameters for deriving a stable visual seed.
 * Each field contributes to the final seed deterministically.
 */
export interface VisualSeedInput {
  gameId: string
  revision: number
  eventId?: string
  effectId?: string
}

/**
 * Derives a stable deterministic seed from game context and effect metadata.
 * Reconnects and page reloads produce identical seeds for the same input.
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
 * @param input - Object with gameId, revision, eventId, effectId
 * @returns A number suitable as a seed for createSeededRandom
 *
 * @example
 * const seed1 = stableVisualSeed({ gameId: "g-123", revision: 1 });
 * const seed2 = stableVisualSeed({ gameId: "g-123", revision: 1 });
 * // seed1 === seed2 (always identical for same input)
 *
 * const seed3 = stableVisualSeed({ gameId: "g-123", revision: 2 });
 * // seed3 !== seed1 (revision changed)
 */
export function stableVisualSeed(input: VisualSeedInput): number {
  const parts: string[] = [
    input.gameId,
    String(input.revision),
    input.eventId ?? '',
    input.effectId ?? '',
  ]

  const combined = parts.join(':')
  return fnv1aHash(combined)
}

/**
 * FNV-1a hash: deterministic, fast, good distribution.
 * Converts an arbitrary string to a 32-bit unsigned integer seed.
 */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // FNV-1a prime mixing
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0
  }
  return hash
}
