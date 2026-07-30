import { describe, expect, it } from "vitest"

import {
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
} from "../gardenViewport"

describe("fitLogicalViewport", () => {
  it("fills 16:9 without letterbox bars", () => {
    const t = fitLogicalViewport(1920, 1080)
    expect(t.scale).toBe(1)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(0)
    expect(t.logical).toEqual({
      width: GARDEN_LOGICAL_WIDTH,
      height: GARDEN_LOGICAL_HEIGHT,
    })
  })

  it("letterboxes 4:3 (pillarbox horizontal bars none, vertical bars yes)", () => {
    // 1600×1200 is 4:3 — content limited by width → vertical bars
    const t = fitLogicalViewport(1600, 1200)
    const expectedScale = 1600 / GARDEN_LOGICAL_WIDTH
    expect(t.scale).toBeCloseTo(expectedScale, 8)
    expect(t.offsetX).toBeCloseTo(0, 8)
    const contentH = GARDEN_LOGICAL_HEIGHT * expectedScale
    expect(t.offsetY).toBeCloseTo((1200 - contentH) / 2, 8)
  })

  it("pillarboxes ultrawide (side bars)", () => {
    const t = fitLogicalViewport(2560, 1080)
    const expectedScale = 1080 / GARDEN_LOGICAL_HEIGHT
    expect(t.scale).toBeCloseTo(expectedScale, 8)
    expect(t.offsetY).toBeCloseTo(0, 8)
    const contentW = GARDEN_LOGICAL_WIDTH * expectedScale
    expect(t.offsetX).toBeCloseTo((2560 - contentW) / 2, 8)
  })
})
