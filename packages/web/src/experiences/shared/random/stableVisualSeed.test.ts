import { describe, it, expect } from 'vitest'
import { stableVisualSeed, type VisualSeedInput } from './stableVisualSeed'

describe('stableVisualSeed', () => {
  it('produces identical seeds for identical inputs', () => {
    const input: VisualSeedInput = {
      gameId: 'game-123',
      revision: 5,
      eventId: 'evt-456',
      effectId: 'eff-789',
    }

    const seed1 = stableVisualSeed(input)
    const seed2 = stableVisualSeed(input)

    expect(seed1).toBe(seed2)
  })

  it('produces different seeds when gameId changes', () => {
    const base: VisualSeedInput = {
      gameId: 'game-aaa',
      revision: 1,
    }

    const seed1 = stableVisualSeed(base)
    const seed2 = stableVisualSeed({ ...base, gameId: 'game-bbb' })

    expect(seed1).not.toBe(seed2)
  })

  it('produces different seeds when revision changes', () => {
    const base: VisualSeedInput = {
      gameId: 'game-x',
      revision: 1,
    }

    const seed1 = stableVisualSeed(base)
    const seed2 = stableVisualSeed({ ...base, revision: 2 })

    expect(seed1).not.toBe(seed2)
  })

  it('produces different seeds when eventId changes', () => {
    const base: VisualSeedInput = {
      gameId: 'game-x',
      revision: 1,
      eventId: 'evt-1',
    }

    const seed1 = stableVisualSeed(base)
    const seed2 = stableVisualSeed({ ...base, eventId: 'evt-2' })

    expect(seed1).not.toBe(seed2)
  })

  it('produces different seeds when effectId changes', () => {
    const base: VisualSeedInput = {
      gameId: 'game-x',
      revision: 1,
      effectId: 'eff-1',
    }

    const seed1 = stableVisualSeed(base)
    const seed2 = stableVisualSeed({ ...base, effectId: 'eff-2' })

    expect(seed1).not.toBe(seed2)
  })

  it('treats missing eventId and undefined eventId identically', () => {
    const base: VisualSeedInput = {
      gameId: 'game-y',
      revision: 3,
    }

    const seed1 = stableVisualSeed(base)
    const seed2 = stableVisualSeed({ ...base, eventId: undefined })

    expect(seed1).toBe(seed2)
  })

  it('treats missing effectId and undefined effectId identically', () => {
    const base: VisualSeedInput = {
      gameId: 'game-z',
      revision: 2,
    }

    const seed1 = stableVisualSeed(base)
    const seed2 = stableVisualSeed({ ...base, effectId: undefined })

    expect(seed1).toBe(seed2)
  })

  it('produces different seeds for eventId vs effectId with same value (collision test)', () => {
    const withEventId = stableVisualSeed({
      gameId: 'game-collision',
      revision: 1,
      eventId: 'same-value',
    })

    const withEffectId = stableVisualSeed({
      gameId: 'game-collision',
      revision: 1,
      effectId: 'same-value',
    })

    expect(withEventId).not.toBe(withEffectId)
  })

  it('produces stable seed for full input with all fields', () => {
    const input: VisualSeedInput = {
      gameId: 'g-full-test',
      revision: 42,
      eventId: 'e-occurrence',
      effectId: 'fx-sparkle',
    }

    const seed = stableVisualSeed(input)
    expect(seed).toBe(1804938765)
  })

  it('produces stable seed for minimal input', () => {
    const input: VisualSeedInput = {
      gameId: 'minimal-game',
      revision: 1,
    }

    const seed = stableVisualSeed(input)
    expect(seed).toBe(3452958760)
  })

  it('returns uint32-compatible numbers', () => {
    const input: VisualSeedInput = {
      gameId: 'test-uint',
      revision: 10,
    }

    const seed = stableVisualSeed(input)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffffffff)
  })

  it('produces identical seeds across multiple calls for same input', () => {
    const input: VisualSeedInput = {
      gameId: 'persistence-test',
      revision: 5,
      eventId: 'evt-persist',
    }

    const seeds = [
      stableVisualSeed(input),
      stableVisualSeed(input),
      stableVisualSeed(input),
    ]

    expect(seeds[0]).toBe(seeds[1])
    expect(seeds[1]).toBe(seeds[2])
  })
})
