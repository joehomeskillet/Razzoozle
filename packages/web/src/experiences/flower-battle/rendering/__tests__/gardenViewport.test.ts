import { describe, expect, it } from "vitest"

import {
  computeVisibleLogicalRect,
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

describe("computeVisibleLogicalRect", () => {
  it("returns the full logical frame on a perfect 16:9 match", () => {
    const rect = computeVisibleLogicalRect(fitLogicalViewport(1920, 1080))
    expect(rect).toEqual({
      x: 0,
      y: 0,
      width: GARDEN_LOGICAL_WIDTH,
      height: GARDEN_LOGICAL_HEIGHT,
    })
  })

  it("returns the cropped inner band on 4:3 (horizontal cover-crop)", () => {
    // 1024×768 is 4:3 — cover crops left/right; full height stays visible.
    const rect = computeVisibleLogicalRect(fitLogicalViewport(1024, 768))
    expect(rect.x).toBeGreaterThan(0)
    expect(rect.height).toBeCloseTo(GARDEN_LOGICAL_HEIGHT, 6)
    expect(rect.y).toBe(0)
    expect(rect.width).toBeLessThan(GARDEN_LOGICAL_WIDTH)
    expect(rect.width).toBeGreaterThan(0)
    // Symmetric crop: band stays centered in the logical frame.
    const right = rect.x + rect.width
    expect(right).toBeLessThan(GARDEN_LOGICAL_WIDTH)
    expect(rect.x).toBeCloseTo(GARDEN_LOGICAL_WIDTH - right, 6)
  })

  it("returns the cropped inner band on ultrawide (vertical cover-crop)", () => {
    // 2560×1080 is 21:9 — cover crops top/bottom; full width stays visible.
    const rect = computeVisibleLogicalRect(fitLogicalViewport(2560, 1080))
    expect(rect.y).toBeGreaterThan(0)
    expect(rect.width).toBeCloseTo(GARDEN_LOGICAL_WIDTH, 6)
    expect(rect.x).toBe(0)
    expect(rect.height).toBeLessThan(GARDEN_LOGICAL_HEIGHT)
    expect(rect.height).toBeGreaterThan(0)
    const bottom = rect.y + rect.height
    expect(bottom).toBeLessThan(GARDEN_LOGICAL_HEIGHT)
    expect(rect.y).toBeCloseTo(GARDEN_LOGICAL_HEIGHT - bottom, 6)
  })

  it("never exceeds the logical frame on extreme aspects", () => {
    for (const [w, h] of [
      [800, 1080],
      [3840, 720],
      [320, 568],
    ] as const) {
      const rect = computeVisibleLogicalRect(fitLogicalViewport(w, h))
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(
        GARDEN_LOGICAL_WIDTH + 1e-6,
      )
      expect(rect.y + rect.height).toBeLessThanOrEqual(
        GARDEN_LOGICAL_HEIGHT + 1e-6,
      )
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
    }
  })
})
