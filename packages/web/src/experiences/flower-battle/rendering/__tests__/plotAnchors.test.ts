import { describe, expect, it } from "vitest"

import {
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
} from "../gardenViewport"
import {
  computePlotAnchors,
  MAX_PLOT_TEAMS,
  MIN_PLOT_TEAMS,
  normalizePlotTeamCount,
} from "../plotAnchors"

describe("plotAnchors", () => {
  it.each([2, 3, 4] as const)(
    "places %i evenly spaced anchors inside the logical frame",
    (count) => {
      const anchors = computePlotAnchors(count)
      expect(anchors).toHaveLength(count)
      expect(normalizePlotTeamCount(count)).toBe(count)

      for (const a of anchors) {
        expect(a.x).toBeGreaterThan(0)
        expect(a.x).toBeLessThan(GARDEN_LOGICAL_WIDTH)
        expect(a.y).toBeGreaterThan(GARDEN_LOGICAL_HEIGHT * 0.6)
        expect(a.y).toBeLessThan(GARDEN_LOGICAL_HEIGHT)
      }

      // Monotonic X order
      for (let i = 1; i < anchors.length; i += 1) {
        expect(anchors[i]!.x).toBeGreaterThan(anchors[i - 1]!.x)
      }
    },
  )

  it("is pure: identical inputs → identical anchors", () => {
    const a = computePlotAnchors(3)
    const b = computePlotAnchors(3)
    expect(a).toEqual(b)
  })

  it("clamps to 2–4 plots", () => {
    expect(normalizePlotTeamCount(0)).toBe(MIN_PLOT_TEAMS)
    expect(normalizePlotTeamCount(99)).toBe(MAX_PLOT_TEAMS)
    expect(computePlotAnchors(99)).toHaveLength(MAX_PLOT_TEAMS)
  })
})
