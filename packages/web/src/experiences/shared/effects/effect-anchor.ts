import type {
  ExperienceEffectAnchor,
  ExperienceEffectDomRefAnchor,
  ExperienceEffectNormalizedAnchor,
  ExperienceEffectSvgElementAnchor,
} from "../types/experience-effect"

/**
 * Stage viewbox context for resolving normalized anchors to pixel coordinates.
 *
 * Typically derived from the ExperienceViewportProps container's
 * clientWidth / clientHeight.
 */
export interface EffectAnchorViewportContext {
  width: number
  height: number
}

/** Pixel coordinates returned by anchor resolution. */
export interface AnchorPixelCoordinates {
  x: number
  y: number
}

const FALLBACK: AnchorPixelCoordinates = { x: 0, y: 0 }

/** Clamp a normalized coordinate to [0, 1]. */
export function clampNormalized(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function resolveNormalized(
  anchor: ExperienceEffectNormalizedAnchor,
  context: EffectAnchorViewportContext,
): AnchorPixelCoordinates {
  const x = clampNormalized(anchor.x)
  const y = clampNormalized(anchor.y)
  return { x: x * context.width, y: y * context.height }
}

function resolveSvgElement(
  anchor: ExperienceEffectSvgElementAnchor,
): AnchorPixelCoordinates {
  const element = anchor.element ?? anchor.ref?.current ?? null
  if (!element) return FALLBACK

  const box = element.getBBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function resolveDomRef(
  anchor: ExperienceEffectDomRefAnchor,
): AnchorPixelCoordinates {
  const element = anchor.element ?? anchor.ref?.current ?? null
  if (!element) return FALLBACK

  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * Resolve an ExperienceEffectAnchor to pixel coordinates.
 *
 * Pure geometry — no rendering, no DOM mutation.
 *
 * - Missing refs/elements → { x: 0, y: 0 }
 * - Zero-size bounding boxes → center point (no division-by-zero crash)
 * - Out-of-range normalized coords → clamped to [0, 1] before scaling
 */
export function resolveEffectAnchorToPixels(
  anchor: ExperienceEffectAnchor,
  context: EffectAnchorViewportContext,
): AnchorPixelCoordinates {
  switch (anchor.type) {
    case "normalized":
      return resolveNormalized(anchor, context)
    case "svg-element":
      return resolveSvgElement(anchor)
    case "dom-ref":
      return resolveDomRef(anchor)
    default: {
      const _exhaustive: never = anchor
      return _exhaustive
    }
  }
}
