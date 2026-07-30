import { describe, expect, it } from "vitest"

import {
  GARDEN_SCENE_ACTORS_ZONE_END_PERCENT,
  GARDEN_SCENE_ACTORS_ZONE_START_PERCENT,
  GARDEN_SCENE_BACKGROUND_ZONE_END_PERCENT,
  GARDEN_SCENE_BACKGROUND_ZONE_START_PERCENT,
  GARDEN_SCENE_HUD_ZONE_END_PERCENT,
  GARDEN_SCENE_HUD_ZONE_START_PERCENT,
  GARDEN_SCENE_SAFE_AREA_MARGIN_PERCENT,
  validateSafeZones,
  type GardenSceneElementPosition,
} from "../garden-scene-safe-zones"

describe("garden-scene-safe-zones", () => {
  it("exports the documented vertical zone bands", () => {
    expect(GARDEN_SCENE_HUD_ZONE_START_PERCENT).toBe(0)
    expect(GARDEN_SCENE_HUD_ZONE_END_PERCENT).toBe(16)
    expect(GARDEN_SCENE_BACKGROUND_ZONE_START_PERCENT).toBe(16)
    expect(GARDEN_SCENE_BACKGROUND_ZONE_END_PERCENT).toBe(64)
    expect(GARDEN_SCENE_ACTORS_ZONE_START_PERCENT).toBe(64)
    expect(GARDEN_SCENE_ACTORS_ZONE_END_PERCENT).toBe(100)
    expect(GARDEN_SCENE_SAFE_AREA_MARGIN_PERCENT).toBeGreaterThanOrEqual(5)
  })

  it("accepts valid positions inside each zone and safe margin", () => {
    const positions: GardenSceneElementPosition[] = [
      { id: "hud-chip", zone: "hud", xPercent: 50, yPercent: 8 },
      { id: "cloud-a", zone: "background", xPercent: 20, yPercent: 40 },
      { id: "plant-red", zone: "actors", xPercent: 75, yPercent: 80 },
    ]

    expect(validateSafeZones(positions)).toEqual({ valid: true, errors: [] })
  })

  it("rejects positions outside the safe-area margin", () => {
    const result = validateSafeZones([
      { id: "edge", zone: "background", xPercent: 2, yPercent: 40 },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors[0]?.message).toContain("safe-area margin")
  })

  it("rejects yPercent outside the declared zone band", () => {
    const result = validateSafeZones([
      { id: "misplaced-plant", zone: "actors", xPercent: 50, yPercent: 30 },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors[0]?.message).toContain('"actors" zone')
  })

  it("rejects negative and non-finite coordinates", () => {
    const result = validateSafeZones([
      { id: "bad-x", zone: "hud", xPercent: -1, yPercent: 8 },
      { id: "bad-y", zone: "hud", xPercent: 50, yPercent: Number.NaN },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
  })
})
