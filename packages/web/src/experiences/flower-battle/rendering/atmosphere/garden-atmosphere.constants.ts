/**
 * Garden atmosphere constants (Task 2 — wind, birds, motes, gust leaves).
 *
 * Exposed as named arrays so tests can introspect the contract (quality
 * tiers, spawn bands, gust envelope ranges) without scraping magic numbers
 * out of controller bodies. Every range is half-open `[min, max)`.
 */

import { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH } from "../gardenViewport"
import type { GardenRenderQuality } from "../../garden-pixi.types"

/** Quality-tier pool counts. Static is defensive — the host should
 *  never bind an atmosphere for static quality. */
export const BIRD_COUNTS: Record<GardenRenderQuality, number> = {
  high: 2,
  medium: 1,
  low: 0,
  static: 0,
}

export const MOTE_COUNTS: Record<GardenRenderQuality, [number, number]> = {
  high: [10, 12],
  medium: [6, 8],
  low: [3, 4],
  static: [0, 0],
}

/** Motes selected from this range per quality band; mid count is the
 *  canonical pick the controllers read at construction. */
export const GRASS_TUFT_COUNTS: Record<GardenRenderQuality, [number, number]> = {
  high: [12, 18],
  medium: [8, 10],
  low: [4, 6],
  static: [0, 0],
}

/** Gust-leaf pool size per quality. Static/low never spawn leaves. */
export const GUST_LEAF_COUNTS: Record<GardenRenderQuality, [number, number]> = {
  high: [1, 3],
  medium: [1, 2],
  low: [0, 0],
  static: [0, 0],
}

/** Mid counts derived for tests + non-randomised lookups. */
export const BIRD_MID_COUNT: Record<GardenRenderQuality, number> = {
  high: 2,
  medium: 1,
  low: 0,
  static: 0,
}

export const MOTE_MID_COUNT: Record<GardenRenderQuality, number> = {
  high: 11,
  medium: 7,
  low: 4,
  static: 0,
}

export const GUST_LEAF_MID_COUNT: Record<GardenRenderQuality, number> = {
  high: 2,
  medium: 1,
  low: 0,
  static: 0,
}

/** Y band for birds — fraction of GARDEN_LOGICAL_HEIGHT. */
export const BIRD_Y_BAND: readonly [number, number] = [0.14, 0.32]

/** Speed in logical px/s. */
export const BIRD_SPEED_RANGE: readonly [number, number] = [35, 65]

/** Spawn interval between birds (ms). */
export const BIRD_SPAWN_INTERVAL_RANGE: readonly [number, number] = [
  12_000, 25_000,
]

/** Bird visual scale. */
export const BIRD_SCALE_RANGE: readonly [number, number] = [0.55, 0.9]

/** Wing swap every 180–280 ms. */
export const BIRD_WING_SWAP_RANGE: readonly [number, number] = [180, 280]

/** Vertical wave amplitude (px) for in-flight drift. */
export const BIRD_VERTICAL_WAVE_RANGE: readonly [number, number] = [4, 8]

/** Safe-zone exclusions for bird spawn destinations. */
export const SUN_SAFE_RADIUS = 130
/** Top HUD safe zone — above this Y fraction is reserved for HUD. */
export const HUD_SAFE_TOP_FRACTION = 0.12
/** Number of times to retry finding a safe spawn before falling back. */
export const BIRD_SPAWN_RETRY_LIMIT = 8

/** Mote lifetime (seconds). */
export const MOTE_LIFETIME_RANGE: readonly [number, number] = [5, 10]
/** Mote drift speed (px/s baseline before wind). */
export const MOTE_BASE_SPEED_RANGE: readonly [number, number] = [8, 14]
/** Mote scale (sprite scale). */
export const MOTE_SCALE_RANGE: readonly [number, number] = [0.6, 1.1]

/** Gust default schedule (ms). */
export const GUST_PERIOD_RANGE: readonly [number, number] = [9_000, 18_000]
/** Ramp up — first-stage climb to peak. */
export const GUST_RAMP_RANGE: readonly [number, number] = [500, 800]
/** Peak hold. */
export const GUST_PEAK_MS = 100
/** Decay back to zero. */
export const GUST_DECAY_RANGE: readonly [number, number] = [1_200, 2_000]

/** Gust leaves ride the wind envelope only above this wind sample
 *  threshold (positive-only bursts). */
export const GUST_LEAF_ACTIVATION_THRESHOLD = 0.18

/** Mote Y band (fraction of logical height). */
export const MOTE_Y_BAND: readonly [number, number] = [0.35, 0.78]

/** Grass wind rotation range (radians) for animated tufts. */
export const GRASS_WIND_SWEEP_RANGE: readonly [number, number] = [
  -0.18, 0.18,
]

/** Constants for the wind signal. */
export const WIND_FREQ_PRIMARY = 0.55
export const WIND_FREQ_SECONDARY = 0.17
export const WIND_PRIMARY_AMP = 0.55
export const WIND_SECONDARY_AMP = 0.25
export const WIND_GUST_AMP = 0.75

/** Logical-viewport helpers exposed for tests that need a frame of
 *  reference independent of the host's renderer size. */
export const ATMOSPHERE_WIDTH = GARDEN_LOGICAL_WIDTH
export const ATMOSPHERE_HEIGHT = GARDEN_LOGICAL_HEIGHT