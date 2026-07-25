import { describe, expect, it } from "vitest"
import { seededShuffle, hashSeed, createMulberry32 } from "./seededShuffle"

describe("seededShuffle Utility (Issue #476 / SDD #476)", () => {
  const items = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"]

  it("produces deterministic identical shuffle results for the same seed", () => {
    const shuffle1 = seededShuffle(items, "room-123-game-456")
    const shuffle2 = seededShuffle(items, "room-123-game-456")

    expect(shuffle1).toEqual(shuffle2)
  })

  it("produces different shuffle results for different seeds", () => {
    const shuffle1 = seededShuffle(items, "seed-A")
    const shuffle2 = seededShuffle(items, "seed-B")

    expect(shuffle1).not.toEqual(shuffle2)
  })

  it("does not mutate the input array", () => {
    const original = ["A", "B", "C"]
    const copy = [...original]
    seededShuffle(original, "test-seed")

    expect(original).toEqual(copy)
  })

  it("preserves all elements in shuffled output", () => {
    const result = seededShuffle(items, "test-preserve")

    expect(result).toHaveLength(items.length)
    expect(new Set(result)).toEqual(new Set(items))
  })

  it("hashSeed converts strings to positive integers consistently", () => {
    const hash1 = hashSeed("razzoozle-seed")
    const hash2 = hashSeed("razzoozle-seed")

    expect(hash1).toBe(hash2)
    expect(hash1).toBeGreaterThanOrEqual(0)
  })

  it("createMulberry32 PRNG outputs values in range [0, 1)", () => {
    const prng = createMulberry32(12345)
    for (let i = 0; i < 20; i++) {
      const val = prng()
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThan(1)
    }
  })
})
