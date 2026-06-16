// Unit tests for the browser-safe text-match utility (text-match.ts).
//
// Pure TS — no React, no jsdom, runs under the default node env. Covers the
// answer-normalization / matching edge cases the type-answer spec relies on:
// case + accent folding, the Levenshtein distance primitive, and the three
// match modes (exact / normalized / fuzzy) including the fuzzy-threshold
// boundary (1 edit per 10 chars, floor 1). Mirrors the socket package's vitest
// conventions (describe/it/expect, 2-space indent, no semicolons).

import { describe, expect, it } from "vitest"
import { levenshtein, matchAnswer, normalizeText } from "./text-match"

describe("normalizeText", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello")
  })

  it("lowercases", () => {
    expect(normalizeText("HeLLo")).toBe("hello")
  })

  it("strips combining diacritics (Café === cafe)", () => {
    expect(normalizeText("Café")).toBe("cafe")
    expect(normalizeText("Café")).toBe(normalizeText("cafe"))
  })

  it("folds accents across multiple characters", () => {
    expect(normalizeText("Ångström")).toBe("angstrom")
  })

  it("leaves an already-canonical string unchanged", () => {
    expect(normalizeText("plain text")).toBe("plain text")
  })

  it("collapses combined case + accent + whitespace together", () => {
    expect(normalizeText("  RÉSUMÉ  ")).toBe("resume")
  })
})

describe("levenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(levenshtein("kitten", "kitten")).toBe(0)
    expect(levenshtein("", "")).toBe(0)
  })

  it("equals the other length when one string is empty", () => {
    expect(levenshtein("", "abc")).toBe(3)
    expect(levenshtein("abc", "")).toBe(3)
  })

  it("counts a single substitution", () => {
    expect(levenshtein("cat", "cot")).toBe(1)
  })

  it("counts a single insertion / deletion", () => {
    expect(levenshtein("cat", "cats")).toBe(1)
    expect(levenshtein("cats", "cat")).toBe(1)
  })

  it("computes the classic kitten -> sitting distance (3)", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3)
  })

  it("is symmetric", () => {
    expect(levenshtein("flaw", "lawn")).toBe(levenshtein("lawn", "flaw"))
  })
})

describe("matchAnswer", () => {
  it("returns false against an empty accepted list", () => {
    expect(matchAnswer("anything", [])).toBe(false)
  })

  describe("exact mode", () => {
    it("matches only on byte-identical input", () => {
      expect(matchAnswer("Paris", ["Paris"], "exact")).toBe(true)
    })

    it("rejects case / accent / whitespace differences", () => {
      expect(matchAnswer("paris", ["Paris"], "exact")).toBe(false)
      expect(matchAnswer(" Paris ", ["Paris"], "exact")).toBe(false)
      expect(matchAnswer("Café", ["Cafe"], "exact")).toBe(false)
    })
  })

  describe("normalized mode (default)", () => {
    it("is the default when no mode is passed", () => {
      expect(matchAnswer("  PARIS ", ["paris"])).toBe(true)
    })

    it("matches across case, accent and surrounding whitespace", () => {
      expect(matchAnswer("café", ["CAFE"], "normalized")).toBe(true)
      expect(matchAnswer("  Ångström ", ["angstrom"], "normalized")).toBe(true)
    })

    it("still rejects a genuine typo (no fuzz in normalized)", () => {
      expect(matchAnswer("pariz", ["paris"], "normalized")).toBe(false)
    })

    it("matches against any one of several accepted answers", () => {
      expect(matchAnswer("london", ["paris", "London"], "normalized")).toBe(
        true,
      )
    })
  })

  describe("fuzzy mode", () => {
    // Threshold = max(1, floor(len/10)). For a 5-char answer that is 1 edit.
    it("tolerates a single typo within the floor-1 threshold", () => {
      expect(matchAnswer("pariz", ["paris"], "fuzzy")).toBe(true)
    })

    it("rejects two edits on a short answer (exceeds floor-1)", () => {
      expect(matchAnswer("pariss", ["pari"], "fuzzy")).toBe(false)
    })

    it("allows more edits on a long answer (1 per 10 chars)", () => {
      // "abcdefghijklmnopqrst" is 20 chars -> threshold 2.
      const accepted = "abcdefghijklmnopqrst"
      expect(matchAnswer("XbcdefghijklmnopqrsX", [accepted], "fuzzy")).toBe(
        true,
      )
    })

    it("rejects when edits exceed the long-answer threshold", () => {
      // 20-char answer -> threshold 2; three substitutions must fail.
      const accepted = "abcdefghijklmnopqrst"
      expect(matchAnswer("XYZdefghijklmnopqrst", [accepted], "fuzzy")).toBe(
        false,
      )
    })

    it("normalizes before measuring distance (accents are free)", () => {
      expect(matchAnswer("Café", ["cafe"], "fuzzy")).toBe(true)
    })
  })
})
