// Unit tests for the achievement *tier* primitives (achievements.ts).
//
// Pure TS — deterministic, no network, no React. Complements
// achievements.test.ts (which covers i18nKey namespacing) by asserting the
// tier-ranking helper (highestTier), the strictly-ascending TIER_INDEX, and
// the completeness of every per-tier token map — so a tier added to TIER_ORDER
// without a matching map entry (or a catalog entry pointing at an unknown
// tier) fails loudly here. Mirrors the vitest style of the sibling test file
// (describe/it/expect, 2-space indent, no semicolons).

import { describe, expect, it } from "vitest"
import {
  ACHIEVEMENT_META,
  type AchievementTier,
  highestTier,
  TIER_ACCENT,
  TIER_GRADIENT,
  TIER_INDEX,
  TIER_LABEL,
  TIER_ORDER,
  TIER_RING,
  TIER_TEXT,
} from "./achievements"

describe("highestTier", () => {
  it("returns null for an empty list", () => {
    expect(highestTier([])).toBeNull()
  })

  it("returns the single tier for a one-element list", () => {
    expect(highestTier(["bronze"])).toBe("bronze")
    expect(highestTier(["diamant"])).toBe("diamant")
  })

  it("picks gold over bronze and silver regardless of order", () => {
    expect(highestTier(["bronze", "gold", "silver"])).toBe("gold")
  })

  it("picks diamant as the strict maximum", () => {
    expect(highestTier(["diamant", "gold"])).toBe("diamant")
  })
})

describe("TIER_INDEX ordering", () => {
  it("strictly increases bronze < silver < gold < diamant", () => {
    expect(TIER_INDEX.bronze).toBeLessThan(TIER_INDEX.silver)
    expect(TIER_INDEX.silver).toBeLessThan(TIER_INDEX.gold)
    expect(TIER_INDEX.gold).toBeLessThan(TIER_INDEX.diamant)
  })

  it("matches the position of each tier in TIER_ORDER", () => {
    TIER_ORDER.forEach((tier, i) => {
      expect(TIER_INDEX[tier]).toBe(i)
    })
  })
})

describe("per-tier token map completeness", () => {
  const maps: ReadonlyArray<[string, Record<AchievementTier, string>]> = [
    ["TIER_GRADIENT", TIER_GRADIENT],
    ["TIER_RING", TIER_RING],
    ["TIER_TEXT", TIER_TEXT],
    ["TIER_LABEL", TIER_LABEL],
    ["TIER_ACCENT", TIER_ACCENT],
  ]

  for (const [name, map] of maps) {
    it(`defines a non-empty entry for every tier in ${name}`, () => {
      for (const tier of TIER_ORDER) {
        expect(typeof map[tier]).toBe("string")
        expect(map[tier].length).toBeGreaterThan(0)
      }
    })
  }
})

describe("ACHIEVEMENT_META tiers", () => {
  it("uses only tiers declared in TIER_ORDER", () => {
    for (const meta of Object.values(ACHIEVEMENT_META)) {
      expect(TIER_ORDER).toContain(meta.tier)
    }
  })
})
