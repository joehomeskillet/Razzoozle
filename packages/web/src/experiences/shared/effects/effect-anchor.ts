import type { ExperienceEffectAnchor } from "../types/experience-effect"

export interface EffectAnchorPoint {
  x: number
  y: number
}

const ZERO: EffectAnchorPoint = { x: 0, y: 0 }

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function rectCenter(rect: { x: number; y: number; width: number; height: number }): EffectAnchorPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

/**
 * Resolves an {@link ExperienceEffectAnchor} to absolute `{ x, y }` coordinates.
 *
 * Pure function — no DOM writes. Missing or zero-size refs fall back safely
 * without throwing.
 */
export function resolveEffectAnchor(anchor: ExperienceEffectAnchor): EffectAnchorPoint {
  switch (anchor.kind) {
    case "normalized":
      return {
        x: clamp01(anchor.x),
        y: clamp01(anchor.y),
      }

    case "svg-element": {
      const element = anchor.element
      if (typeof element.getBBox !== "function") {
        return ZERO
      }

      try {
        const box = element.getBBox()
        if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) {
          return ZERO
        }
        return rectCenter(box)
      } catch {
        return ZERO
      }
    }

    case "dom-ref": {
      const element = anchor.element
      if (!element || typeof element.getBoundingClientRect !== "function") {
        return ZERO
      }

      try {
        const rect = element.getBoundingClientRect()
        if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
          return ZERO
        }
        return rectCenter(rect)
      } catch {
        return ZERO
      }
    }

    default: {
      const _exhaustive: never = anchor
      return _exhaustive
    }
  }
}
