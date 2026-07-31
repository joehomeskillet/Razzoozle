/**
 * Deterministic team-plot anchors (WP-PIX-05A).
 * Anchors derive only from the fixed logical viewport + stable team count/order.
 */

import {
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
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
 */
export const PLOT_GROUND_Y_RATIO = 0.72

export function computePlotAnchors(
  teamCount: number,
  logicalWidth: number = GARDEN_LOGICAL_WIDTH,
  logicalHeight: number = GARDEN_LOGICAL_HEIGHT,
): PlotAnchor[] {
  const count = normalizePlotTeamCount(teamCount)
  // Actor band: plant feet in lower-mid third (above bottom HUD safe band).
  const groundY = logicalHeight * PLOT_GROUND_Y_RATIO
  const sideMargin = logicalWidth * 0.12
  const usable = logicalWidth - sideMargin * 2
  const step = count === 1 ? 0 : usable / (count - 1)

  const anchors: PlotAnchor[] = []
  for (let index = 0; index < count; index += 1) {
    anchors.push({
      index,
      x: sideMargin + step * index,
      y: groundY,
    })
  }
  return anchors
}
