// Unit tests for the client-side achievement metadata utility (achievements.ts).
//
// Pure TS — no React, no jsdom, runs under the default node env. Covers the
// dependency-free, deterministic logic: the tier-ordering primitives
// (TIER_INDEX / highestTier), catalog ↔ token-map consistency across all
// tiers, and the server-override-vs-i18n-fallback resolution in
// getAchievementDisplay. The fetch-backed loadAchievementMeta is intentionally
// not exercised here (impure I/O). Mirrors the socket package's vitest
// conventions (describe/it/expect, 2-space indent, no semicolons).

import { describe, expect, it } from "vitest"
import {
  ACHIEVEMENT_META,
  type AchievementTier,
  getAchievementDisplay,
  highestTier,
  TIER_ACCENT,
  TIER_GRADIENT,
  TIER_INDEX,
  TIER_LABEL,
  TIER_ORDER,
  TIER_RING,
  TIER_TEXT,
} from "./achievements"

const ALL_TIERS: AchievementTier[] = ["bronze", "silver", "gold", "diamant"]

describe("TIER_INDEX / TIER_ORDER", () => {
  it("orders tiers ascending bronze < silver < gold < diamant", () => {
    expect(TIER_INDEX.bronze).toBe(0)
    expect(TIER_INDEX.silver).toBe(1)
    expect(TIER_INDEX.gold).toBe(2)
    expect(TIER_INDEX.diamant).toBe(3)
  })

  it("TIER_ORDER lists every tier in ascending index order", () => {
    expect(TIER_ORDER).toEqual(ALL_TIERS)
    TIER_ORDER.forEach((tier, i) => {
      expect(TIER_INDEX[tier]).toBe(i)
    })
  })
})

describe("highestTier", () => {
  it("returns null for an empty list", () => {
    expect(highestTier([])).toBeNull()
  })

  it("returns the single tier when only one is present", () => {
    expect(highestTier(["silver"])).toBe("silver")
  })

  it("picks the highest tier regardless of order", () => {
    expect(highestTier(["bronze", "diamant", "silver"])).toBe("diamant")
    expect(highestTier(["diamant", "bronze"])).toBe("diamant")
  })

  it("handles duplicates of the same tier", () => {
    expect(highestTier(["gold", "gold", "gold"])).toBe("gold")
  })

  it("prefers gold over silver and bronze", () => {
    expect(highestTier(["bronze", "silver", "gold"])).toBe("gold")
  })
})

describe("ACHIEVEMENT_META catalog", () => {
  it("uses a key that matches each entry's id", () => {
    for (const [key, meta] of Object.entries(ACHIEVEMENT_META)) {
      expect(meta.id).toBe(key)
    }
  })

  it("assigns every achievement a known tier", () => {
    for (const meta of Object.values(ACHIEVEMENT_META)) {
      expect(ALL_TIERS).toContain(meta.tier)
    }
  })

  it("namespaces every i18nKey under game:achievements.<id>", () => {
    for (const meta of Object.values(ACHIEVEMENT_META)) {
      expect(meta.i18nKey).toBe(`game:achievements.${meta.id}`)
    }
  })

  it("includes the spec's tier representatives", () => {
    expect(ACHIEVEMENT_META.first_correct.tier).toBe("bronze")
    expect(ACHIEVEMENT_META.streak_3.tier).toBe("silver")
    expect(ACHIEVEMENT_META.streak_5.tier).toBe("gold")
    expect(ACHIEVEMENT_META.streak_10.tier).toBe("diamant")
    expect(ACHIEVEMENT_META.speedy_gonzales.tier).toBe("diamant")
  })
})

describe("tier token maps", () => {
  it("defines a token for every tier in each derived map", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_GRADIENT[tier]).toBeTruthy()
      expect(TIER_RING[tier]).toBeTruthy()
      expect(TIER_TEXT[tier]).toBeTruthy()
      expect(TIER_LABEL[tier]).toBeTruthy()
      expect(TIER_ACCENT[tier]).toBeTruthy()
    }
  })

  it("uses German tier labels", () => {
    expect(TIER_LABEL.silver).toBe("Silber")
    expect(TIER_LABEL.diamant).toBe("Diamant")
  })
})

describe("getAchievementDisplay", () => {
  const fallback = { name: "Fallback Name", desc: "Fallback Desc" }

  it("falls back to i18n values when no server override is given", () => {
    expect(getAchievementDisplay("streak_3", undefined, fallback)).toEqual({
      name: "Fallback Name",
      description: "Fallback Desc",
    })
  })

  it("prefers the server-provided name and description", () => {
    const merged = {
      id: "streak_3",
      name: "Server Name",
      description: "Server Desc",
    } as unknown as Parameters<typeof getAchievementDisplay>[1]

    expect(getAchievementDisplay("streak_3", merged, fallback)).toEqual({
      name: "Server Name",
      description: "Server Desc",
    })
  })

  it("uses each field independently (override name, fallback desc)", () => {
    const merged = {
      id: "streak_3",
      name: "Only Name Overridden",
      description: undefined,
    } as unknown as Parameters<typeof getAchievementDisplay>[1]

    expect(getAchievementDisplay("streak_3", merged, fallback)).toEqual({
      name: "Only Name Overridden",
      description: "Fallback Desc",
    })
  })
})
