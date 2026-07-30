/**
 * garden-scene-safe-zones.ts — vertical safe-zone bands for FlowerGardenScene
 * (WP-937). Single source of truth for the 0–16 / 16–64 / 64–100 % layout
 * split consumed by the scene composer and placement validation.
 */

/** Top HUD lock band (empty in #937 — filled by #938). */
export const GARDEN_SCENE_HUD_ZONE_START_PERCENT = 0
export const GARDEN_SCENE_HUD_ZONE_END_PERCENT = 16
export const GARDEN_SCENE_HUD_ZONE_WIDTH_PERCENT =
  GARDEN_SCENE_HUD_ZONE_END_PERCENT - GARDEN_SCENE_HUD_ZONE_START_PERCENT

/** Middle background band (garden recipe catalog layers). */
export const GARDEN_SCENE_BACKGROUND_ZONE_START_PERCENT = 16
export const GARDEN_SCENE_BACKGROUND_ZONE_END_PERCENT = 64
export const GARDEN_SCENE_BACKGROUND_ZONE_WIDTH_PERCENT =
  GARDEN_SCENE_BACKGROUND_ZONE_END_PERCENT -
  GARDEN_SCENE_BACKGROUND_ZONE_START_PERCENT

/** Bottom actors / beet band (FlowerPlant slots). */
export const GARDEN_SCENE_ACTORS_ZONE_START_PERCENT = 64
export const GARDEN_SCENE_ACTORS_ZONE_END_PERCENT = 100
export const GARDEN_SCENE_ACTORS_ZONE_WIDTH_PERCENT =
  GARDEN_SCENE_ACTORS_ZONE_END_PERCENT - GARDEN_SCENE_ACTORS_ZONE_START_PERCENT

/** Minimum inset from every stage edge (all four sides). */
export const GARDEN_SCENE_SAFE_AREA_MARGIN_PERCENT = 5

export type GardenSceneZone = "hud" | "background" | "actors"

export interface GardenSceneElementPosition {
  id: string
  zone: GardenSceneZone
  /** Horizontal placement 0–100 (stage width). */
  xPercent: number
  /** Vertical placement 0–100 (stage height) — determines zone membership. */
  yPercent: number
}

export interface SafeZoneValidationResult {
  valid: boolean
  errors: Array<{ id: string; message: string }>
}

const ZONE_VERTICAL_BOUNDS: Record<
  GardenSceneZone,
  { start: number; end: number }
> = {
  hud: {
    start: GARDEN_SCENE_HUD_ZONE_START_PERCENT,
    end: GARDEN_SCENE_HUD_ZONE_END_PERCENT,
  },
  background: {
    start: GARDEN_SCENE_BACKGROUND_ZONE_START_PERCENT,
    end: GARDEN_SCENE_BACKGROUND_ZONE_END_PERCENT,
  },
  actors: {
    start: GARDEN_SCENE_ACTORS_ZONE_START_PERCENT,
    end: GARDEN_SCENE_ACTORS_ZONE_END_PERCENT,
  },
}

const isFinitePercent = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 100

/**
 * Validates that every declared element sits inside its zone band and the
 * global safe-area margin (≥5 % on all sides). Returns aggregated errors for
 * negative-test / placement-guard use.
 */
export function validateSafeZones(
  positions: readonly GardenSceneElementPosition[],
): SafeZoneValidationResult {
  const errors: SafeZoneValidationResult["errors"] = []
  const margin = GARDEN_SCENE_SAFE_AREA_MARGIN_PERCENT
  const safeMin = margin
  const safeMax = 100 - margin

  for (const position of positions) {
    const { id, zone, xPercent, yPercent } = position

    if (!isFinitePercent(xPercent)) {
      errors.push({
        id,
        message: `xPercent must be a finite value between 0 and 100 (got ${xPercent})`,
      })
    } else if (xPercent < safeMin || xPercent > safeMax) {
      errors.push({
        id,
        message: `xPercent ${xPercent} is outside the ${margin}% safe-area margin`,
      })
    }

    if (!isFinitePercent(yPercent)) {
      errors.push({
        id,
        message: `yPercent must be a finite value between 0 and 100 (got ${yPercent})`,
      })
      continue
    }

    if (yPercent < safeMin || yPercent > safeMax) {
      errors.push({
        id,
        message: `yPercent ${yPercent} is outside the ${margin}% safe-area margin`,
      })
    }

    const bounds = ZONE_VERTICAL_BOUNDS[zone]
    if (yPercent < bounds.start || yPercent >= bounds.end) {
      errors.push({
        id,
        message: `yPercent ${yPercent} is outside the "${zone}" zone (${bounds.start}–${bounds.end}%)`,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
