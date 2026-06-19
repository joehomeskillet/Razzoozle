import type { Theme } from "@razzoozle/common/types/theme"
import { describe, expect, it } from "vitest"

import { setTokenColor } from "@razzoozle/web/features/manager/utils/setTokenColor"

// A minimal Theme-shaped object cast via the same `as unknown as Theme` pattern
// the source uses; only the keys the tests touch need to be present.
const makeTheme = (): Theme =>
  ({
    colorPrimary: "#7c3aed",
    footerColors: {
      bg: "#ffffff",
      text: "#1f2937",
    },
  }) as unknown as Theme

describe("setTokenColor", () => {
  it("sets a top-level path", () => {
    const result = setTokenColor(makeTheme(), "colorPrimary", "#fff")

    expect(result.colorPrimary).toBe("#fff")
  })

  it("sets a nested path immutably, preserving siblings", () => {
    const original = makeTheme()
    const snapshot = structuredClone(original)

    const result = setTokenColor(original, "footerColors.bg", "#000")

    // New value applied on the returned object.
    expect(result.footerColors.bg).toBe("#000")
    // Sibling key at that level is preserved.
    expect(result.footerColors.text).toBe("#1f2937")
    // Original object is untouched (deep-clone immutability).
    expect(original).toEqual(snapshot)
    expect(original.footerColors.bg).toBe("#ffffff")
  })

  it("does not throw on an unknown deep path and returns an object", () => {
    const result = setTokenColor(makeTheme(), "nope.deeper", "#abc")

    expect(typeof result).toBe("object")
    expect((result as unknown as Record<string, unknown>).nope).toBeDefined()
  })
})
