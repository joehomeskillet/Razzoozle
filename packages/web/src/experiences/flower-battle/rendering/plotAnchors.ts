/**
 * Deterministic team-plot anchors (WP-PIX-05A).
 * Anchors derive only from the fixed logical viewport + stable team count/order.
 */

import {
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
  type LogicalRect,
} from "./gardenViewport"

export const MIN_PLOT_TEAMS = 2
export const MAX_PLOT_TEAMS = 4

export interface PlotAnchor {
  /** Stable slot index in team order (0-based). */
  index: number
  /** Ground contact X in logical pixels. */
  x: number
  /** Ground contact Y in logical pixels. */
  y: number
}

/**
 * Clamp team count into the supported 2–4 plot range.
 * Counts below 2 still yield a single-centred layout width of 2 slots so
 * sparse games keep comparable plant scale (mirrors DOM scene intent).
 */
export function normalizePlotTeamCount(teamCount: number): number {
  if (!Number.isFinite(teamCount) || teamCount < 1) return MIN_PLOT_TEAMS
  return Math.min(MAX_PLOT_TEAMS, Math.max(MIN_PLOT_TEAMS, Math.floor(teamCount)))
}

/**
 * Evenly spaced ground anchors along the actor band of the logical frame.
 * Pure function of (viewport constants, teamCount) — never growth/phase.
 */
/**
 * Ground contact Y as a fraction of logical height.
 * Lower-mid third so plants stay fully inside the React bottom safe area
 * (team HUD + answer counter) while remaining large and readable.
 * 0.80 keeps soil plots visibly above the floating bottom HUD even when the
 * host viewport letterbox-crops the logical frame (short/4:3 presenters).
 */
export const PLOT_GROUND_Y_RATIO = 0.8

/** Horizontal breathing room as a fraction of the usable anchor band. */
const PLOT_SIDE_MARGIN_RATIO = 0.12

/**
 * Vertical margins (logical px) that keep grown flower heads below the top
 * crop edge and soil plots above the bottom crop edge when a wide host
 * cover-crops the logical frame vertically.
 */
const PLOT_TOP_SAFE_MARGIN = 420
const PLOT_BOTTOM_SAFE_MARGIN = 24

export function computePlotAnchors(
  teamCount: number,
  logicalWidth: number = GARDEN_LOGICAL_WIDTH,
  logicalHeight: number = GARDEN_LOGICAL_HEIGHT,
  visibleRect?: LogicalRect,
): PlotAnchor[] {
  const count = normalizePlotTeamCount(teamCount)
  // Actor band: plant feet in lower-mid third (above bottom HUD safe band).
  // When the host cover-crops the frame (ultrawide crops top/bottom, 4:3
  // crops left/right), anchors are laid out inside the *visible* band so
  // plants can never be amputated by the crop (WP immersive §11/§13).
  const band = visibleRect ?? {
    x: 0,
    y: 0,
    width: logicalWidth,
    height: logicalHeight,
  }
  const sideMargin = band.width * PLOT_SIDE_MARGIN_RATIO
  const usable = Math.max(0, band.width - sideMargin * 2)
  const step = count === 1 ? 0 : usable / (count - 1)

  const minGroundY = band.y + Math.min(PLOT_TOP_SAFE_MARGIN, band.height * 0.4)
  const maxGroundY = band.y + band.height - PLOT_BOTTOM_SAFE_MARGIN
  const groundY = Math.min(
    Math.max(logicalHeight * PLOT_GROUND_Y_RATIO, minGroundY),
    Math.max(minGroundY, maxGroundY),
  )

  const anchors: PlotAnchor[] = []
  for (let index = 0; index < count; index += 1) {
    anchors.push({
      index,
      x: band.x + sideMargin + step * index,
      y: groundY,
    })
  }
  return anchors
}
