// Unit tests for the WCAG contrast helpers (console/contrast.ts).
//
// Pure TS — no React, no jsdom. The web package has no test runner wired up yet
// (no vitest/@testing-library/jsdom in packages/web), so this file is written so
// that it can be picked up unchanged once a web vitest config lands. It imports
// only the dependency-free contrast module, mirroring the socket package's
// vitest conventions (`describe`/`it`/`expect`, 2-space indent, no semicolons).

import {
  contrastRatio,
  hexToRgb,
  relativeLuminance,
  wcagLevel,
} from "@razzia/web/features/manager/components/console/contrast"
import { describe, expect, it } from "vitest"

describe("hexToRgb", () => {
  it("parses 6-digit hex with a leading #", () => {
    expect(hexToRgb("#aabbcc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc })
  })

  it("parses 6-digit hex without a leading #", () => {
    expect(hexToRgb("ff8800")).toEqual({ r: 255, g: 136, b: 0 })
  })

  it("expands 3-digit shorthand", () => {
    expect(hexToRgb("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc })
  })

  it("returns null for invalid input", () => {
    expect(hexToRgb("#xyz")).toBeNull()
    expect(hexToRgb("#1234")).toBeNull()
    expect(hexToRgb("nope")).toBeNull()
    // @ts-expect-error — guarding the non-string branch at runtime
    expect(hexToRgb(null)).toBeNull()
  })
})

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6)
  })
})

describe("contrastRatio", () => {
  it("returns ~21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2)
  })

  it("returns ~21 regardless of fg/bg order", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2)
  })

  it("returns ~1 for white on white", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 6)
  })

  it("returns ~1 for identical colours", () => {
    expect(contrastRatio("#3366aa", "#3366aa")).toBeCloseTo(1, 6)
  })

  it("falls back to the worst-case ratio of 1 on unparseable input", () => {
    expect(contrastRatio("not-a-colour", "#ffffff")).toBe(1)
    expect(contrastRatio("#ffffff", "garbage")).toBe(1)
  })
})

describe("wcagLevel", () => {
  it("classifies the AAA band at and above 7", () => {
    expect(wcagLevel(21)).toBe("AAA")
    expect(wcagLevel(7)).toBe("AAA")
  })

  it("classifies the AA band in [4.5, 7)", () => {
    expect(wcagLevel(6.99)).toBe("AA")
    expect(wcagLevel(4.5)).toBe("AA")
  })

  it("classifies the fail band below 4.5", () => {
    expect(wcagLevel(4.49)).toBe("fail")
    expect(wcagLevel(1)).toBe("fail")
  })
})
