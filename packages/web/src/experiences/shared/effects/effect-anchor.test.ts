import { describe, expect, it } from "vitest"

import { resolveEffectAnchor } from "./effect-anchor"
import type { ExperienceEffectAnchor } from "../types/experience-effect"

describe("resolveEffectAnchor", () => {
  describe("normalized", () => {
    it("returns coordinates unchanged when in range", () => {
      expect(resolveEffectAnchor({ kind: "normalized", x: 0.25, y: 0.75 })).toEqual({
        x: 0.25,
        y: 0.75,
      })
    })

    it("clamps out-of-range values to [0, 1]", () => {
      expect(resolveEffectAnchor({ kind: "normalized", x: -0.5, y: 1.5 })).toEqual({
        x: 0,
        y: 1,
      })
    })
  })

  describe("svg-element", () => {
    it("returns bbox center in user units", () => {
      const element = {
        getBBox: () => ({ x: 10, y: 20, width: 100, height: 50 }),
      } as SVGGraphicsElement

      expect(resolveEffectAnchor({ kind: "svg-element", element })).toEqual({
        x: 60,
        y: 45,
      })
    })

    it("falls back to {0,0} when getBBox is missing", () => {
      const element = {} as SVGGraphicsElement

      expect(resolveEffectAnchor({ kind: "svg-element", element })).toEqual({ x: 0, y: 0 })
    })

    it("falls back to {0,0} when getBBox throws", () => {
      const element = {
        getBBox: () => {
          throw new Error("detached")
        },
      } as unknown as SVGGraphicsElement

      expect(resolveEffectAnchor({ kind: "svg-element", element })).toEqual({ x: 0, y: 0 })
    })

    it("handles zero-size bbox without crashing", () => {
      const element = {
        getBBox: () => ({ x: 5, y: 5, width: 0, height: 0 }),
      } as SVGGraphicsElement

      expect(resolveEffectAnchor({ kind: "svg-element", element })).toEqual({ x: 5, y: 5 })
    })
  })

  describe("dom-ref", () => {
    it("returns bounding-rect center in viewport pixels", () => {
      const element = {
        getBoundingClientRect: () => ({
          x: 100,
          y: 200,
          width: 80,
          height: 40,
          top: 200,
          left: 100,
          right: 180,
          bottom: 240,
          toJSON: () => ({}),
        }),
      } as HTMLElement

      expect(resolveEffectAnchor({ kind: "dom-ref", element })).toEqual({ x: 140, y: 220 })
    })

    it("falls back to {0,0} for null ref", () => {
      expect(resolveEffectAnchor({ kind: "dom-ref", element: null })).toEqual({ x: 0, y: 0 })
    })

    it("falls back to {0,0} when getBoundingClientRect throws", () => {
      const element = {
        getBoundingClientRect: () => {
          throw new Error("layout thrash")
        },
      } as unknown as HTMLElement

      expect(resolveEffectAnchor({ kind: "dom-ref", element })).toEqual({ x: 0, y: 0 })
    })

    it("handles zero-size rect without crashing", () => {
      const element = {
        getBoundingClientRect: () => ({
          x: 50,
          y: 60,
          width: 0,
          height: 0,
          top: 60,
          left: 50,
          right: 50,
          bottom: 60,
          toJSON: () => ({}),
        }),
      } as HTMLElement

      expect(resolveEffectAnchor({ kind: "dom-ref", element })).toEqual({ x: 50, y: 60 })
    })
  })

  describe("discriminated union", () => {
    it("narrows on kind for each anchor variant", () => {
      const anchors: ExperienceEffectAnchor[] = [
        { kind: "normalized", x: 0.5, y: 0.5 },
        {
          kind: "svg-element",
          element: { getBBox: () => ({ x: 0, y: 0, width: 10, height: 10 }) } as SVGGraphicsElement,
        },
        {
          kind: "dom-ref",
          element: {
            getBoundingClientRect: () => ({
              x: 0,
              y: 0,
              width: 20,
              height: 20,
              top: 0,
              left: 0,
              right: 20,
              bottom: 20,
              toJSON: () => ({}),
            }),
          } as HTMLElement,
        },
      ]

      for (const anchor of anchors) {
        const point = resolveEffectAnchor(anchor)
        expect(point).toHaveProperty("x")
        expect(point).toHaveProperty("y")
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
      }
    })

    it("rejects invalid kind at compile time", () => {
      // @ts-expect-error — invalid discriminator not in union
      const bad: ExperienceEffectAnchor = { kind: "canvas", x: 0, y: 0 }
      expect(bad).toBeDefined()
    })
  })
})
