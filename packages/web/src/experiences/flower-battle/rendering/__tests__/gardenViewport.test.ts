import { describe, expect, it } from "vitest"

import {
  fitLogicalViewport,
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
} from "../gardenViewport"

describe("fitLogicalViewport", () => {
  it("fills 16:9 without bars or crop", () => {
    const t = fitLogicalViewport(1920, 1080)
    expect(t.scale).toBe(1)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(0)
    expect(t.logical).toEqual({
      width: GARDEN_LOGICAL_WIDTH,
      height: GARDEN_LOGICAL_HEIGHT,
    })
  })

  it("covers 4:3 (no empty bars; may crop top/bottom)", () => {
    // 1600×1200 is 4:3 — cover scales by the larger factor (height)
    const t = fitLogicalViewport(1600, 1200)
    const expectedScale = Math.max(
      1600 / GARDEN_LOGICAL_WIDTH,
      1200 / GARDEN_LOGICAL_HEIGHT,
    )
    expect(t.scale).toBeCloseTo(expectedScale, 8)
    const contentW = GARDEN_LOGICAL_WIDTH * expectedScale
    const contentH = GARDEN_LOGICAL_HEIGHT * expectedScale
    expect(t.offsetX).toBeCloseTo((1600 - contentW) / 2, 8)
    expect(t.offsetY).toBeCloseTo((1200 - contentH) / 2, 8)
    // Cover: content always >= screen on both axes
    expect(contentW).toBeGreaterThanOrEqual(1600 - 0.001)
    expect(contentH).toBeGreaterThanOrEqual(1200 - 0.001)
  })

  it("covers ultrawide (no side bars; may crop left/right)", () => {
    const t = fitLogicalViewport(2560, 1080)
    const expectedScale = Math.max(
      2560 / GARDEN_LOGICAL_WIDTH,
      1080 / GARDEN_LOGICAL_HEIGHT,
    )
    expect(t.scale).toBeCloseTo(expectedScale, 8)
    const contentW = GARDEN_LOGICAL_WIDTH * expectedScale
    const contentH = GARDEN_LOGICAL_HEIGHT * expectedScale
    expect(t.offsetX).toBeCloseTo((2560 - contentW) / 2, 8)
    expect(t.offsetY).toBeCloseTo((1080 - contentH) / 2, 8)
    expect(contentW).toBeGreaterThanOrEqual(2560 - 0.001)
    expect(contentH).toBeGreaterThanOrEqual(1080 - 0.001)
  })
})
