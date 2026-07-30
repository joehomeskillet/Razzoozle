/**
 * garden-safe-zones.ts — placement safe-zone constants for the Garden
 * Background Recipe (WP-FLB-11, SDD §16). Single source of truth for the
 * cardinality bounds and placement rules documented in
 * docs/design/flower-battle-asset-inventory.md §B — consumed by
 * `createGardenBackgroundRecipe` (cardinality) and, later, by the rendering
 * layer (band width / exclusion rules). No randomness, no logic — constants
 * only.
 */
import type { GardenEdgeFoliageSide } from "./garden-background.types"

/** §B.4 — 2–4 clouds simultaneously; static (no motion) under reduced motion. */
export const GARDEN_CLOUD_MIN_COUNT = 2
export const GARDEN_CLOUD_MAX_COUNT = 4
export const GARDEN_CLOUD_STATIC_UNDER_REDUCED_MOTION = true

/** §B.5/§B.6 — exactly one horizon and one boundary module per recipe. */
export const GARDEN_HORIZON_COUNT = 1
export const GARDEN_BOUNDARY_COUNT = 1

/**
 * §B.7 — edge foliage lives in the outer 8% width band only (left/right),
 * 2–4 clusters selected, never covering team labels/plants/beds/power-ups.
 */
export const GARDEN_EDGE_FOLIAGE_BAND_WIDTH_PERCENT = 8
export const GARDEN_EDGE_FOLIAGE_MIN_COUNT = 2
export const GARDEN_EDGE_FOLIAGE_MAX_COUNT = 4
export const GARDEN_EDGE_FOLIAGE_SIDES: readonly GardenEdgeFoliageSide[] = [
  "left",
  "right",
]

/** §B.8 — zero or one distant feature; never resembles a gameplay item. */
export const GARDEN_DISTANT_FEATURE_MAX_COUNT = 1
