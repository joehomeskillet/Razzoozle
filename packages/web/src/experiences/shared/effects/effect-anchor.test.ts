import { describe, it, expect } from "vitest"

import {
  clampNormalized,
  resolveEffectAnchorToPixels,
  type EffectAnchorViewportContext,
} from "./effect-anchor"
import type {
  ExperienceEffectAnchor,
  ExperienceEffectDomRefAnchor,
  ExperienceEffectNormalizedAnchor,
  ExperienceEffectSvgElementAnchor,
} from "../types/experience-effect"

const viewport: EffectAnchorViewportContext = { width: 800, height: 600 }

describe("clampNormalized", () => {
  it("clamps below 0 to 0", () => expect(clampNormalized(-0.5)).toBe(0))
  it("clamps above 1 to 1", () => expect(clampNormalized(1.5)).toBe(1))
  it("passes through values in [0, 1]", () => expect(clampNormalized(0.5)).toBe(0.5))
})

describe("resolveEffectAnchorToPixels — normalized", () => {
  it("maps [0.5, 0.5] to stage center", () => {
    const anchor: ExperienceEffectNormalizedAnchor = { type: "normalized", x: 0.5, y: 0.5 }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 400, y: 300 })
  })

  it("clamps out-of-range normalized coords", () => {
    const anchor: ExperienceEffectNormalizedAnchor = { type: "normalized", x: -1, y: 2 }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 0, y: 600 })
  })
})

describe("resolveEffectAnchorToPixels — svg-element", () => {
  it("resolves getBBox center", () => {
    const fakeSvg = { getBBox: () => ({ x: 10, y: 20, width: 100, height: 50 }) } as unknown as SVGGraphicsElement
    const anchor: ExperienceEffectSvgElementAnchor = { type: "svg-element", element: fakeSvg }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 60, y: 45 })
  })

  it("returns center for zero-size bbox without crash", () => {
    const fakeSvg = { getBBox: () => ({ x: 30, y: 40, width: 0, height: 0 }) } as unknown as SVGGraphicsElement
    const anchor: ExperienceEffectSvgElementAnchor = { type: "svg-element", element: fakeSvg }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 30, y: 40 })
  })

  it("falls back to {0,0} when element is missing", () => {
    const anchor: ExperienceEffectSvgElementAnchor = { type: "svg-element", element: null }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 0, y: 0 })
  })

  it("resolves via ref.current", () => {
    const fakeSvg = { getBBox: () => ({ x: 0, y: 0, width: 200, height: 100 }) } as unknown as SVGGraphicsElement
    const anchor: ExperienceEffectSvgElementAnchor = { type: "svg-element", ref: { current: fakeSvg } }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 100, y: 50 })
  })
})

describe("resolveEffectAnchorToPixels — dom-ref", () => {
  it("resolves getBoundingClientRect center", () => {
    const fakeEl = {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 40, right: 180, bottom: 240, x: 100, y: 200, toJSON: () => ({}) }),
    } as unknown as HTMLElement
    const anchor: ExperienceEffectDomRefAnchor = { type: "dom-ref", element: fakeEl }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 140, y: 220 })
  })

  it("returns center for zero-size rect without crash", () => {
    const fakeEl = {
      getBoundingClientRect: () => ({ left: 50, top: 60, width: 0, height: 0, right: 50, bottom: 60, x: 50, y: 60, toJSON: () => ({}) }),
    } as unknown as HTMLElement
    const anchor: ExperienceEffectDomRefAnchor = { type: "dom-ref", element: fakeEl }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 50, y: 60 })
  })

  it("falls back to {0,0} when element is missing", () => {
    const anchor: ExperienceEffectDomRefAnchor = { type: "dom-ref" }
    expect(resolveEffectAnchorToPixels(anchor, viewport)).toEqual({ x: 0, y: 0 })
  })
})

describe("ExperienceEffectAnchor discriminated union", () => {
  it("accepts all three anchor types", () => {
    const anchors: ExperienceEffectAnchor[] = [
      { type: "normalized", x: 0.5, y: 0.5 },
      { type: "svg-element", element: null },
      { type: "dom-ref", element: null },
    ]
    expect(anchors).toHaveLength(3)
  })

  it("rejects invalid type at compile time", () => {
  // @ts-expect-error — invalid discriminator not in union
    const bad: ExperienceEffectAnchor = { type: "canvas", x: 0, y: 0 }
    expect(bad).toBeDefined()
  })
})
