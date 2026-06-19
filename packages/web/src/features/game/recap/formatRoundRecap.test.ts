// Unit tests for round-recap pure formatters (formatRoundRecap.ts).
//
// Pure TS — no React, no jsdom. Covers emoji map completeness, value formatting,
// and i18n label key namespacing for the per-round recap strip.

import type { RoundRecapKey } from "@razzoozle/common/types/game"
import { describe, expect, it } from "vitest"
import {
  ROUND_RECAP_EMOJI,
  formatRoundRecapValue,
  roundRecapLabelKey,
} from "./formatRoundRecap"

const ALL_KEYS: RoundRecapKey[] = [
  "fastest_finger",
  "first_correct",
  "streak",
  "highest_round_score",
  "rank_climber",
  "achievement_unlock",
  "slowest_player",
  "most_wrong",
]

describe("ROUND_RECAP_EMOJI", () => {
  it("has a non-empty string entry for every RoundRecapKey", () => {
    for (const k of ALL_KEYS) {
      expect(typeof ROUND_RECAP_EMOJI[k]).toBe("string")
      expect(ROUND_RECAP_EMOJI[k].length).toBeGreaterThan(0)
    }
  })
})

describe("formatRoundRecapValue", () => {
  it("formats fastest_finger ms to seconds with one decimal", () => {
    expect(formatRoundRecapValue("fastest_finger", 1500)).toBe("1.5s")
  })

  it("formats slowest_player ms to seconds", () => {
    expect(formatRoundRecapValue("slowest_player", 1500)).toBe("1.5s")
  })

  it("renders count keys as the integer string", () => {
    for (const key of [
      "streak",
      "highest_round_score",
      "rank_climber",
      "most_wrong",
    ] as const) {
      expect(formatRoundRecapValue(key, 7)).toBe("7")
    }
  })

  it("renders empty string for label-only keys", () => {
    for (const key of ["first_correct", "achievement_unlock"] as const) {
      expect(formatRoundRecapValue(key, 1)).toBe("")
    }
  })

  it("renders empty string when value is undefined", () => {
    expect(formatRoundRecapValue("streak", undefined)).toBe("")
  })
})

describe("roundRecapLabelKey", () => {
  it("namespaces every key under game:roundRecap.<key>", () => {
    for (const k of ALL_KEYS) {
      expect(roundRecapLabelKey(k)).toBe(`game:roundRecap.${k}`)
    }
  })
})
