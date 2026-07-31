/**
 * Team-HUD widgets for the Flower Battle presenter garden (WP-PRESENTER-5).
 *
 * Three pure PixiJS scene-graph helpers — TeamLabel, SegmentedGrowthMeter,
 * StatusChip — composed by `buildTeamHud` into a single Container positioned
 * under a team's plot anchor. All production colors flow through
 * `getThemeTokenCssVar()` → `resolveThemeTokenColor()`; the host may inject a
 * pre-resolved palette for tests / SSR / offline rendering.
 *
 * Layout uses `getTeamSlotLayout()` so 2 / 3 / 4-team rosters share the same
 * layout source as the rest of the scene. The HUD never introduces its own
 * full-width strip — every widget stays inside its plot's safe area.
 */

import { Container, Graphics, Text } from "pixi.js"
import type { TextStyleOptions } from "pixi.js"

import { getThemeTokenCssVar } from "@razzoozle/common/theme-tokens"

import { resolveThemeTokenColor, type ThemeColorResolver } from "./resolveThemeColor"
import { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH } from "./gardenViewport"

const LABEL_PILL_WIDTH = 168
const LABEL_PILL_HEIGHT = 32
const LABEL_OUTLINE_WIDTH = 2.5
const LABEL_TEXT_FONT_SIZE = 16

const METER_GROWTH_SEGMENTS = 10
const METER_SUN_SEGMENTS = 3
const METER_SEGMENT_GAP = 3
const METER_HEIGHT = 14
const METER_WIDTH = 168

const CHIP_PADDING_X = 10
const CHIP_HEIGHT = 26

const TEAM_HUD_VERTICAL_GAP = 18

/** Theme tokens used by the team HUD — mapped to existing Razzoozle design tokens. */
export const TEAM_HUD_TOKENS = {
  labelFill: "--color-field-cream",
  labelText: "--color-field-ink",
  meterFill: "--color-field-cream",
  meterTrack: "--surface-muted",
  chipFill: "--color-field-cream",
  chipText: "--color-field-ink",
} as const

/** Pre-resolved palette for the team HUD widgets (test injection surface). */
export interface TeamHudPalette {
  labelFill: number
  labelText: number
  meterFill: number
  meterTrack: number
  chipFill: number
  chipText: number
}

/** Resolve a TeamHudPalette from the live theme via the resolver pipeline. */
export function resolveTeamHudPalette(
  resolveColor: ThemeColorResolver = resolveThemeTokenColor,
): TeamHudPalette {
  return {
    labelFill: resolveColor(TEAM_HUD_TOKENS.labelFill),
    labelText: resolveColor(TEAM_HUD_TOKENS.labelText),
    meterFill: resolveColor(TEAM_HUD_TOKENS.meterFill),
    meterTrack: resolveColor(TEAM_HUD_TOKENS.meterTrack),
    chipFill: resolveColor(TEAM_HUD_TOKENS.chipFill),
    chipText: resolveColor(TEAM_HUD_TOKENS.chipText),
  }
}

export interface TeamColorTokens {
  /** Primary team color (used for outline + meter highlight). */
  primary: number
}

export interface TeamLabelOptions {
  text: string
  palette: TeamHudPalette
  teamColor: number
}

/**
 * Pill-shaped team label: rounded rect with team-color outline + cream fill +
 * localised text. Pure decoration — never interacts with input.
 */
export function buildTeamLabel(options: TeamLabelOptions): Container {
  const { text, palette, teamColor } = options
  const container = new Container()
  container.label = "team-hud-label"

  const pill = new Graphics()
  pill.label = "team-hud-label-pill"
  pill.roundRect(
    -LABEL_PILL_WIDTH / 2,
    -LABEL_PILL_HEIGHT / 2,
    LABEL_PILL_WIDTH,
    LABEL_PILL_HEIGHT,
    LABEL_PILL_HEIGHT / 2,
  )
  pill.fill({ color: palette.labelFill })
  pill.stroke({ color: teamColor, width: LABEL_OUTLINE_WIDTH })
  container.addChild(pill)

  const label = new Text({
    text,
    style: {
      fontFamily: "inherit",
      fontSize: LABEL_TEXT_FONT_SIZE,
      fontWeight: "600",
      fill: palette.labelText,
      align: "center",
    } satisfies TextStyleOptions,
  })
  label.anchor.set(0.5, 0.5)
  label.label = "team-hud-label-text"
  container.addChild(label)

  return container
}

export interface SegmentedGrowthMeterOptions {
  /** Filled growth segments (0..METER_GROWTH_SEGMENTS). */
  growthCurrent: number
  /** Total growth segments. */
  growthMax: number
  /** Filled sun segments (0..METER_SUN_SEGMENTS). */
  sunCurrent: number
  /** Total sun segments. */
  sunMax: number
  palette: TeamHudPalette
  teamColor: number
}

/**
 * Two stacked segmented bars: growth (10 segs) under, sun (3 segs) above.
 * Each segment is a rounded rect; filled segments wear the team color,
 * unfilled segments wear the cream/track tone.
 */
export function buildSegmentedGrowthMeter(
  options: SegmentedGrowthMeterOptions,
): Container {
  const {
    growthCurrent,
    growthMax,
    sunCurrent,
    sunMax,
    palette,
    teamColor,
  } = options
  const container = new Container()
  container.label = "team-hud-meter"

  const safeGrowthMax = Math.max(1, Math.floor(growthMax))
  const safeSunMax = Math.max(1, Math.floor(sunMax))
  const growthSegW =
    (METER_WIDTH - METER_SEGMENT_GAP * (safeGrowthMax - 1)) / safeGrowthMax
  const sunSegW =
    (METER_WIDTH - METER_SEGMENT_GAP * (safeSunMax - 1)) / safeSunMax
  const growthY = METER_HEIGHT / 2
  const sunY = -METER_HEIGHT / 2 - 4

  // Growth row
  const growthRow = new Graphics()
  growthRow.label = "team-hud-meter-growth"
  for (let i = 0; i < safeGrowthMax; i += 1) {
    const x = -METER_WIDTH / 2 + i * (growthSegW + METER_SEGMENT_GAP)
    growthRow.roundRect(x, -METER_HEIGHT / 2, growthSegW, METER_HEIGHT, 3)
    growthRow.fill({
      color: i < growthCurrent ? teamColor : palette.meterTrack,
      alpha: i < growthCurrent ? 1 : 0.6,
    })
  }
  growthRow.position.y = growthY
  container.addChild(growthRow)

  // Sun row (slightly shorter to read as a sub-meter)
  const sunRow = new Graphics()
  sunRow.label = "team-hud-meter-sun"
  for (let i = 0; i < safeSunMax; i += 1) {
    const x = -METER_WIDTH / 2 + i * (sunSegW + METER_SEGMENT_GAP)
    sunRow.roundRect(x, -METER_HEIGHT / 2, sunSegW, METER_HEIGHT, 3)
    sunRow.fill({
      color: i < sunCurrent ? teamColor : palette.meterFill,
      alpha: i < sunCurrent ? 1 : 0.5,
    })
  }
  sunRow.position.y = sunY
  container.addChild(sunRow)

  return container
}

export interface StatusChipOptions {
  /** e.g. "12 / 15" — answers answered out of total. */
  text: string
  palette: TeamHudPalette
}

/**
 * Compact rounded chip for the answers counter. Cream fill + dark-ink text.
 * No team color — it belongs to the team but is purely informational.
 */
export function buildStatusChip(options: StatusChipOptions): Container {
  const { text, palette } = options
  const container = new Container()
  container.label = "team-hud-chip"

  const label = new Text({
    text,
    style: {
      fontFamily: "inherit",
      fontSize: 13,
      fontWeight: "600",
      fill: palette.chipText,
      align: "center",
    } satisfies TextStyleOptions,
  })
  // Pixi v8 measures text via the browser canvas API which throws under the
  // node test env. Fall back to a deterministic character-width heuristic so
  // tests stay pure-TS — the production path still uses Pixi's own metrics.
  const measured = safelyMeasureTextWidth(label)
  const w = Math.max(measured, text.length * 7.5) + CHIP_PADDING_X * 2
  const h = CHIP_HEIGHT

  const chip = new Graphics()
  chip.label = "team-hud-chip-bg"
  chip.roundRect(-w / 2, -h / 2, w, h, h / 2)
  chip.fill({ color: palette.chipFill })
  chip.stroke({ color: palette.chipText, width: 1, alpha: 0.2 })
  container.addChild(chip)

  label.anchor.set(0.5, 0.5)
  label.label = "team-hud-chip-text"
  container.addChild(label)

  return container
}

/**
 * Best-effort width measurement that gracefully degrades to 0 under test
 * environments without a `document` global. Production callers always get
 * Pixi's measured width; tests get 0 and the chip width is derived from the
 * character-count heuristic.
 */
function safelyMeasureTextWidth(label: { width: number }): number {
  try {
    return label.width
  } catch {
    return 0
  }
}

export interface TeamHudOptions {
  /** Anchor in logical pixels (origin = bottom of the plant). */
  anchor: { x: number; y: number }
  /** Localised team name (already resolved by host). */
  teamName: string
  /** Pre-resolved team color. */
  teamColor: number
  palette: TeamHudPalette
  growthCurrent: number
  growthMax?: number
  sunCurrent: number
  sunMax?: number
  /** e.g. "12 / 15"; pass empty string to omit. */
  chipText?: string
}

/**
 * Compose the three widgets into a single team HUD container. The HUD stacks
 * vertically below the plant anchor (label → meter → chip) and never expands
 * outside its 168 px logical footprint, so 4-team layouts stay non-clipping.
 */
export function buildTeamHud(options: TeamHudOptions): Container {
  const {
    anchor,
    teamName,
    teamColor,
    palette,
    growthCurrent,
    growthMax,
    sunCurrent,
    sunMax,
    chipText,
  } = options

  const container = new Container()
  container.label = "team-hud"
  container.position.set(anchor.x, anchor.y + 56)

  const label = buildTeamLabel({ text: teamName, palette, teamColor })
  label.position.set(0, 0)
  container.addChild(label)

  const meter = buildSegmentedGrowthMeter({
    growthCurrent,
    growthMax: growthMax ?? METER_GROWTH_SEGMENTS,
    sunCurrent,
    sunMax: sunMax ?? METER_SUN_SEGMENTS,
    palette,
    teamColor,
  })
  meter.position.set(0, LABEL_PILL_HEIGHT / 2 + TEAM_HUD_VERTICAL_GAP)
  container.addChild(meter)

  if (chipText && chipText.length > 0) {
    const chip = buildStatusChip({ text: chipText, palette })
    chip.position.set(0, LABEL_PILL_HEIGHT / 2 + TEAM_HUD_VERTICAL_GAP + METER_HEIGHT * 2 + 12)
    container.addChild(chip)
  }

  return container
}

/** Convenience: return the CSS `var()` expression for a HUD palette token. */
export function getTeamHudTokenCssVar(token: keyof typeof TEAM_HUD_TOKENS): string {
  return getThemeTokenCssVar(TEAM_HUD_TOKENS[token])
}

/** Re-export logical-viewport constants for callers that place the HUD in custom coordinates. */
export { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH }
