/**
 * Fixed logical garden viewport + cover-fit transform (WP-PIX-05A / WP-19).
 * Design basis: 16:9 presenter canvas (Flower Pixi SDD §9.1).
 *
 * Uses CSS-style `object-fit: cover` (Math.max) so the logical garden always
 * fills the canvas — no white pillarbox/letterbox side bars. Slight crop on
 * non-16:9 hosts is preferred over empty bars for a casual mobile look.
 */

export const GARDEN_LOGICAL_WIDTH = 1920
export const GARDEN_LOGICAL_HEIGHT = 1080

export interface Size2D {
  width: number
  height: number
}

/** Axis-aligned rectangle in logical scene coordinates. */
export interface LogicalRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LetterboxTransform {
  /** Uniform scale from logical → screen pixels. */
  scale: number
  /**
   * Horizontal offset in screen pixels. Negative when cover-cropping
   * ultrawide (content wider than screen).
   */
  offsetX: number
  /**
   * Vertical offset in screen pixels. Negative when cover-cropping tall
   * aspect ratios (content taller than screen).
   */
  offsetY: number
  screen: Size2D
  logical: Size2D
}

/**
 * Compute cover-fit scale so the logical frame fully covers the screen
 * (no empty bars). Content may crop on non-matching aspect ratios.
 */
export function fitLogicalViewport(
  screenWidth: number,
  screenHeight: number,
  logicalWidth: number = GARDEN_LOGICAL_WIDTH,
  logicalHeight: number = GARDEN_LOGICAL_HEIGHT,
): LetterboxTransform {
  const width = Math.max(1, screenWidth)
  const height = Math.max(1, screenHeight)
  // Cover (object-fit: cover) — fill canvas, crop edges if needed.
  const scale = Math.max(width / logicalWidth, height / logicalHeight)
  const contentW = logicalWidth * scale
  const contentH = logicalHeight * scale
  return {
    scale,
    offsetX: (width - contentW) / 2,
    offsetY: (height - contentH) / 2,
    screen: { width, height },
    logical: { width: logicalWidth, height: logicalHeight },
  }
}

/**
 * Logical-coordinates rectangle that is actually visible on screen after the
 * cover-fit transform. With a perfect aspect match this is the full logical
 * frame; with cover-crop (4:3 / ultrawide) it is the cropped inner band.
 *
 * Gameplay-relevant content (plot anchors, sun, clouds) must be placed inside
 * this rect so a cover-crop can never amputate it (WP immersive §13).
 */
export function computeVisibleLogicalRect(
  transform: LetterboxTransform,
): LogicalRect {
  const { scale, offsetX, offsetY, screen, logical } = transform
  if (!(scale > 0)) {
    return { x: 0, y: 0, width: logical.width, height: logical.height }
  }
  const clamp = (v: number, max: number): number => Math.min(max, Math.max(0, v))
  const x0 = clamp(-offsetX / scale, logical.width)
  const y0 = clamp(-offsetY / scale, logical.height)
  const x1 = clamp((screen.width - offsetX) / scale, logical.width)
  const y1 = clamp((screen.height - offsetY) / scale, logical.height)
  return {
    x: x0,
    y: y0,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0),
  }
}
