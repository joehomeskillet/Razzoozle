/**
 * Mulberry32 PRNG determinism tests.
 */

import { describe, expect, it } from "vitest"

import {
  createSeededRandom,
  DEFAULT_ATMOSPHERE_SEED,
} from "../seededRandom"

describe("createSeededRandom", () => {
  it("produces a deterministic sequence for a fixed seed", () => {
    const a = createSeededRandom(42)
    const b = createSeededRandom(42)
    for (let i = 0; i < 20; i += 1) {
      expect(a.next()).toBe(b.next())
    }
  })

  it("always returns output in [0, 1)", () => {
    const rng = createSeededRandom(7)
    for (let i = 0; i < 1_000; i += 1) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it("different seeds produce different sequences", () => {
    const a = createSeededRandom(1)
    const b = createSeededRandom(2)
    let diverge = false
    for (let i = 0; i < 32; i += 1) {
      if (a.next() !== b.next()) {
        diverge = true
        break
      }
    }
    expect(diverge).toBe(true)
  })

  it("exposes a readable, monotonically changing state", () => {
    const rng = createSeededRandom(99)
    const first = rng.state
    rng.next()
    const second = rng.state
    expect(typeof first).toBe("number")
    expect(second).not.toBe(first)
  })

  it("range(min, max) stays within bounds", () => {
    const rng = createSeededRandom(123)
    for (let i = 0; i < 200; i += 1) {
      const v = rng.range(-3.5, 7.2)
      expect(v).toBeGreaterThanOrEqual(-3.5)
      expect(v).toBeLessThan(7.2)
    }
  })

  it("rangeInt(min, max) returns an integer in [min, max]", () => {
    const rng = createSeededRandom(314)
    for (let i = 0; i < 200; i += 1) {
      const v = rng.rangeInt(-2, 4)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThanOrEqual(4)
    }
  })

  it("signed() returns a value in [-1, 1]", () => {
    const rng = createSeededRandom(7)
    for (let i = 0; i < 200; i += 1) {
      const v = rng.signed()
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it("DEFAULT_ATMOSPHERE_SEED is a non-zero constant", () => {
    expect(DEFAULT_ATMOSPHERE_SEED).toBe(0xc0ffee)
  })
})