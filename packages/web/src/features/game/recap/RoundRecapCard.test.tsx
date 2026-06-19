// Tests for the RoundRecapCard value-pill decision.
//
// LIMITATION: @testing-library/react is NOT a dependency and the package's
// vitest env is `node` (no jsdom) — see vitest.config.ts. So a full render
// test (asserting the pill text + winner name in the DOM) is out of scope
// without adding deps/config. Instead we test the pure decision function that
// RoundRecapCard uses to render the pill: `formatRoundRecapValue`. In the
// component, `value ? <pill/> : <placeholder/>` (RoundRecapCard.tsx §value),
// so an empty string is exactly the "no pill, height-reserving placeholder"
// signal. These assertions pin that contract.
//
// Mirrors the package's vitest conventions (describe/it/expect, 2-space
// indent, no semicolons). Deterministic, no timers/network.

import type { RoundRecapAward } from "@razzoozle/common/types/game"
import { describe, expect, it } from "vitest"

import { formatRoundRecapValue } from "./formatRoundRecap"

describe("RoundRecapCard value pill", () => {
  it("renders a formatted value pill for an award WITH a value", () => {
    // e.g. { key: "fastest_finger", winnerName: "Ada", value: 1500 }
    const award: RoundRecapAward = {
      key: "fastest_finger",
      winnerName: "Ada",
      value: 1500,
    }
    const value = formatRoundRecapValue(award.key, award.value)

    // The pill text is "1.5s" (1500ms → "X.Xs").
    expect(value).toBe("1.5s")
    // Non-empty → component renders the pill (value ? <pill/> : <placeholder/>).
    expect(value).not.toBe("")
  })

  it("renders NO value pill for an award WITHOUT a value, with no NaN/undefined leak", () => {
    // e.g. { key: "first_correct", winnerName: "Bo" } (no `value`)
    const award: RoundRecapAward = {
      key: "first_correct",
      winnerName: "Bo",
    }
    const value = formatRoundRecapValue(award.key, award.value)

    // Empty string is the "no pill" signal → component renders the
    // height-reserving placeholder instead (RoundRecapCard.tsx §value).
    expect(value).toBe("")
    // Guard against "undefined"/"NaN" leaking into the rendered string.
    expect(value).not.toMatch(/undefined|NaN/)
  })

  it("treats a value-less key as empty even if a value is somehow supplied", () => {
    // first_correct never shows a number, regardless of an incidental value.
    expect(formatRoundRecapValue("first_correct", 42)).toBe("")
  })
})
