// Unit tests for buildWortartenAnswer pure function.
//
// Tests the POS tagging answer builder against the Rust eval contract
// (rust/engine/src/eval.rs, Wortarten arm ~line 240).
// Ensures client submission format matches server evaluation expectations.

import { describe, expect, it } from "vitest"
import { buildWortartenAnswer } from "./buildWortartenAnswer"

describe("buildWortartenAnswer", () => {
  it("returns string array with all tokens active when no disabled tokens", () => {
    const choices = ["Nomen", "Verb", "Adjektiv"]
    const result = buildWortartenAnswer(choices)
    expect(result).toEqual(["Nomen", "Verb", "Adjektiv"])
  })

  it("replaces null choices with empty string for active tokens", () => {
    const choices = ["Nomen", null, "Adjektiv"]
    const result = buildWortartenAnswer(choices)
    expect(result).toEqual(["Nomen", "", "Adjektiv"])
  })

  it("replaces disabled token positions with empty string regardless of choice", () => {
    const choices = ["Nomen", "Verb", "Adjektiv", "Adverb"]
    const disabled = [1, 3]
    const result = buildWortartenAnswer(choices, disabled)
    expect(result).toEqual(["Nomen", "", "Adjektiv", ""])
  })

  it("handles mixed disabled and null choices correctly", () => {
    const choices = ["Nomen", null, "Adjektiv", "Verb"]
    const disabled = [1]
    const result = buildWortartenAnswer(choices, disabled)
    // Index 1 is disabled, so becomes "" even if it's null
    // Index 1 is null and disabled, so ""
    expect(result).toEqual(["Nomen", "", "Adjektiv", "Verb"])
  })

  it("preserves token order matching input order, not choice value order", () => {
    const choices = ["Verb", "Nomen", "Adjektiv"]
    const result = buildWortartenAnswer(choices)
    expect(result).toEqual(["Verb", "Nomen", "Adjektiv"])
    // Output order follows choices array index, not alphabetical or other ordering
  })

  it("returns all empty strings when all tokens are disabled", () => {
    const choices = ["Nomen", "Verb", "Adjektiv"]
    const disabled = [0, 1, 2]
    const result = buildWortartenAnswer(choices, disabled)
    expect(result).toEqual(["", "", ""])
  })

  it("ignores out-of-bounds disabled indices gracefully", () => {
    const choices = ["Nomen", "Verb"]
    const disabled = [0, 5] // Index 5 is out of bounds
    const result = buildWortartenAnswer(choices, disabled)
    // Only index 0 should be disabled; index 5 has no effect
    expect(result).toEqual(["", "Verb"])
  })

  it("returns empty array for empty choices", () => {
    const choices: Array<string | null> = []
    const result = buildWortartenAnswer(choices)
    expect(result).toEqual([])
  })

  it("handles empty disabled array same as undefined", () => {
    const choices = ["Nomen", "Verb"]
    const result1 = buildWortartenAnswer(choices, [])
    const result2 = buildWortartenAnswer(choices, undefined)
    expect(result1).toEqual(result2)
    expect(result1).toEqual(["Nomen", "Verb"])
  })
})
