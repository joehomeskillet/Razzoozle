/**
 * Dynamic team-slot layout for the Flower Battle presenter garden
 * (WP-D-1, SDD §20.3).
 *
 * Shape contract:
 *  - 2 teams: two large slots side by side (≈45% width each).
 *  - 3 teams: three equal slots side by side.
 *  - 4 teams: 2x2 grid of compact slots.
 *  - 1 team:   centred single slot (caller applies the WP-958D cqw cap).
 *  - 5+ teams: deterministic grid fallback, no overlap.
 *  - 0 teams:  empty layout, no crash.
 *
 * Slot positions are returned in team-index order; the scene pairs each slot
 * with the team at the same index using a stable teamId key (never the array
 * index). Re-renders with the same teamCount + viewport return the same
 * positions byte-for-byte so React reuses existing DOM nodes.
 *
 * All positions use 0..100 percent coordinates so the same layout adapts to
 * any viewport (CSS handles the resize translation).
 */

export const TEAM_SLOT_SIDE_PADDING_PERCENT = 5
export const TEAM_SLOT_INTER_SLOT_GAP_PERCENT = 5
export const TEAM_SLOT_TOP_PADDING_PERCENT = 0
export const TEAM_SLOT_BOTTOM_PADDING_PERCENT = 5

/** Hard upper guard — defensive cap so absurd team counts still layout. */
export const TEAM_SLOT_MAX_TEAMS = 12

export interface TeamSlotPosition {
  /** 0-based slot index in team order. Stable across re-renders for the same teamCount. */
  index: number
  /** Left edge 0..100 (% of viewport width). */
  xPercent: number
  /** Top edge 0..100 (% of viewport height). */
  yPercent: number
  /** Width 0..100 (% of viewport width). */
  widthPercent: number
  /** Height 0..100 (% of viewport height). */
  heightPercent: number
}

export interface TeamSlotViewport {
  /** Logical width in pixels. Must be > 0. */
  width: number
  /** Logical height in pixels. Must be > 0. */
  height: number
}

interface GridShape {
  columns: number
  rows: number
}

const computeGridShape = (teamCount: number): GridShape => {
  if (teamCount <= 1) return { columns: teamCount, rows: 1 }
  if (teamCount === 2) return { columns: 2, rows: 1 }
  if (teamCount === 3) return { columns: 3, rows: 1 }
  if (teamCount === 4) return { columns: 2, rows: 2 }
  // 5..6 prefer 3 columns; 7..8 prefer 4 columns; 9+ stays at 4 columns.
  if (teamCount <= 6) return { columns: 3, rows: Math.ceil(teamCount / 3) }
  if (teamCount <= 8) return { columns: 4, rows: 2 }
  return { columns: 4, rows: Math.ceil(teamCount / 4) }
}

const buildGridSlots = (
  teamCount: number,
  columns: number,
  rows: number,
): TeamSlotPosition[] => {
  if (teamCount <= 0 || columns <= 0 || rows <= 0) return []
  const availableHeight =
    100 -
    TEAM_SLOT_TOP_PADDING_PERCENT -
    TEAM_SLOT_BOTTOM_PADDING_PERCENT -
    Math.max(0, rows - 1) * TEAM_SLOT_INTER_SLOT_GAP_PERCENT
  const slotWidth =
    (100 -
      2 * TEAM_SLOT_SIDE_PADDING_PERCENT -
      Math.max(0, columns - 1) * TEAM_SLOT_INTER_SLOT_GAP_PERCENT) /
    columns
  const slotHeight = availableHeight / rows

  const slots: TeamSlotPosition[] = []
  for (let index = 0; index < teamCount; index += 1) {
    const col = index % columns
    const row = Math.floor(index / columns)
    const xPercent =
      TEAM_SLOT_SIDE_PADDING_PERCENT +
      col * (slotWidth + TEAM_SLOT_INTER_SLOT_GAP_PERCENT)
    const yPercent =
      TEAM_SLOT_TOP_PADDING_PERCENT +
      row * (slotHeight + TEAM_SLOT_INTER_SLOT_GAP_PERCENT)
    slots.push({
      index,
      xPercent,
      yPercent,
      widthPercent: slotWidth,
      heightPercent: slotHeight,
    })
  }
  return slots
}

/**
 * Returns deterministic slot positions for the given team count.
 *
 * Pure function: same `(teamCount, viewport)` returns the same result. The
 * viewport is used only to validate the call site (non-finite or
 * non-positive dims yield an empty layout — never a NaN-producing layout).
 *
 * `teamCount` is clamped to `[0, TEAM_SLOT_MAX_TEAMS]` so the layout never
 * returns negative dimensions; the caller decides how to handle the clamp
 * (e.g. surface a console warning, fall back to a lobby view).
 */
export function getTeamSlotLayout(
  teamCount: number,
  viewport: TeamSlotViewport,
): TeamSlotPosition[] {
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return []
  }
  const safeCount = Number.isFinite(teamCount)
    ? Math.max(0, Math.min(TEAM_SLOT_MAX_TEAMS, Math.floor(teamCount)))
    : 0
  if (safeCount === 0) return []
  const { columns, rows } = computeGridShape(safeCount)
  return buildGridSlots(safeCount, columns, rows)
}

/**
 * Defensive cap exposed for callers that want to surface "too many teams"
 * UX before the layout swallows the overflow silently.
 */
export function isTeamCountOverHardCap(teamCount: number): boolean {
  return Number.isFinite(teamCount) && teamCount > TEAM_SLOT_MAX_TEAMS
}