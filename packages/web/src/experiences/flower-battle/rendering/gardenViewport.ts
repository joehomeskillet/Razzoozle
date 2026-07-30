/**
 * Fixed logical garden viewport + fit/letterbox transform (WP-PIX-05A).
 * Design basis: 16:9 presenter canvas (Flower Pixi SDD §9.1).
 */

export const GARDEN_LOGICAL_WIDTH = 1920
export const GARDEN_LOGICAL_HEIGHT = 1080

export interface Size2D {
  width: number
  height: number
}

export interface LetterboxTransform {
  /** Uniform scale from logical → screen pixels. */
  scale: number
  /** Horizontal letterbox offset in screen pixels. */
  offsetX: number
  /** Vertical letterbox (pillarbox) offset in screen pixels. */
  offsetY: number
  screen: Size2D
  logical: Size2D
}

/**
 * Compute cover-fit scale with letterboxing so the full logical frame stays
 * visible and centered inside an arbitrary screen size.
 */
export function fitLogicalViewport(
  screenWidth: number,
  screenHeight: number,
  logicalWidth: number = GARDEN_LOGICAL_WIDTH,
  logicalHeight: number = GARDEN_LOGICAL_HEIGHT,
): LetterboxTransform {
  const width = Math.max(1, screenWidth)
  const height = Math.max(1, screenHeight)
  const scale = Math.min(width / logicalWidth, height / logicalHeight)
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
