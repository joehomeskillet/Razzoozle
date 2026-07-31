import { describe, expect, it } from "vitest"

import {
  computeVisibleLogicalRect,
  fitLogicalViewport,
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

  describe("visible-band anchors (cover-crop safe content)", () => {
    it.each([2, 3, 4] as const)(
      "keeps %i anchors fully inside the visible band on 4:3 hosts",
      (count) => {
        const visible = computeVisibleLogicalRect(
          fitLogicalViewport(1024, 768),
        )
        const anchors = computePlotAnchors(
          count,
          GARDEN_LOGICAL_WIDTH,
          GARDEN_LOGICAL_HEIGHT,
          visible,
        )
        expect(anchors).toHaveLength(count)
        for (const a of anchors) {
          expect(a.x).toBeGreaterThan(visible.x)
          expect(a.x).toBeLessThan(visible.x + visible.width)
          expect(a.y).toBeGreaterThan(visible.y)
          expect(a.y).toBeLessThan(visible.y + visible.height)
        }
        // Symmetric around the band centre.
        const centre = visible.x + visible.width / 2
        const first = anchors[0]!
        const last = anchors[anchors.length - 1]!
        expect(first.x - visible.x).toBeCloseTo(
          visible.x + visible.width - last.x,
          6,
        )
        expect((first.x + last.x) / 2).toBeCloseTo(centre, 6)
      },
    )

    it("keeps anchors inside the visible band on ultrawide hosts", () => {
      const visible = computeVisibleLogicalRect(
        fitLogicalViewport(2560, 1080),
      )
      for (const count of [2, 4] as const) {
        const anchors = computePlotAnchors(
          count,
          GARDEN_LOGICAL_WIDTH,
          GARDEN_LOGICAL_HEIGHT,
          visible,
        )
        for (const a of anchors) {
          expect(a.x).toBeGreaterThan(visible.x)
          expect(a.x).toBeLessThan(visible.x + visible.width)
          // Ground contact stays above the bottom crop edge.
          expect(a.y).toBeLessThan(visible.y + visible.height)
          // …and grown heads stay below the top crop edge.
          expect(a.y).toBeGreaterThan(visible.y + 300)
        }
      }
    })

    it("matches the legacy layout when no visible rect is provided", () => {
      const legacy = computePlotAnchors(4)
      const explicitFull = computePlotAnchors(
        4,
        GARDEN_LOGICAL_WIDTH,
        GARDEN_LOGICAL_HEIGHT,
        { x: 0, y: 0, width: GARDEN_LOGICAL_WIDTH, height: GARDEN_LOGICAL_HEIGHT },
      )
      expect(explicitFull).toEqual(legacy)
    })

    it("is pure for a given visible rect", () => {
      const visible = computeVisibleLogicalRect(
        fitLogicalViewport(1024, 768),
      )
      const a = computePlotAnchors(
        2,
        GARDEN_LOGICAL_WIDTH,
        GARDEN_LOGICAL_HEIGHT,
        visible,
      )
      const b = computePlotAnchors(
        2,
        GARDEN_LOGICAL_WIDTH,
        GARDEN_LOGICAL_HEIGHT,
        visible,
      )
      expect(a).toEqual(b)
    })
  })
})
