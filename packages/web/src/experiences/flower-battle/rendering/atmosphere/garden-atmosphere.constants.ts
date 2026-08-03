/**
 * Garden atmosphere constants (Task 2 — wind, birds, motes, gust leaves).
 *
 * Exposed as named arrays so tests can introspect the contract (quality
 * tiers, spawn bands, gust envelope ranges) without scraping magic numbers
 * out of controller bodies. Every range is half-open `[min, max)`.
 */

import { GARDEN_LOGICAL_HEIGHT, GARDEN_LOGICAL_WIDTH } from "../gardenViewport"
import type { GardenRenderQuality } from "../../garden-pixi.types"

/**
 * Quality-tier pool counts. Static is defensive — the host should
 *  never bind an atmosphere for static quality. (FU-J: high=5, medium=4,
 *  low=2 — pool must be large enough to host 2-3-bird flocks; low still
 *  gets a small flock so the garden has visible sky-life even on
 *  constrained devices.)
 */
export const BIRD_COUNTS: Record<GardenRenderQuality, number> = {
  high: 5,
  medium: 4,
  low: 2,
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

/** Mid counts derived for tests + non-randomised lookups. (FU-J.) */
export const BIRD_MID_COUNT: Record<GardenRenderQuality, number> = {
  high: 5,
  medium: 4,
  low: 2,
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

/**
 * First-bird delay (ms) — separate from the steady-state interval so the
 * first bird appears within 2.5–6 s of bind (previously 12–25 s, which
 * made birds invisible during normal live-test observation). (FU-H.)
 */
export const BIRD_FIRST_SPAWN_RANGE_MS: readonly [number, number] = [
  2_500, 6_000,
]

/** Spawn interval between subsequent birds (ms). (FU-H.) */
export const BIRD_SPAWN_INTERVAL_RANGE_MS: readonly [number, number] = [
  6_000, 12_000,
]

/**
 * @deprecated Kept as a backward-compat alias for the renamed
 * `BIRD_SPAWN_INTERVAL_RANGE_MS`. New callers must use the `_MS` name —
 * the explicit ms suffix documents the unit, and the new value is
 * narrower (6–12 s) so it must never be confused with the legacy band.
 */
export const BIRD_SPAWN_INTERVAL_RANGE: readonly [number, number] =
  BIRD_SPAWN_INTERVAL_RANGE_MS

/**
 * Bird visual scale. Source frame is 259×146, so 0.14 → ~36 px wide,
 * 0.21 → ~54 px wide — matches Plan §5.3's "36–54 logical px"
 * window so birds read as small and far rather than dominating the
 * sky-life layer.
 */
export const BIRD_SCALE_RANGE: readonly [number, number] = [0.14, 0.21]

/** Wing swap every 180–280 ms. */
export const BIRD_WING_SWAP_RANGE: readonly [number, number] = [180, 280]

/**
 * Number of birds in a single flock spawn wave (FU-J). The leader picks
 * a safe destination; followers share direction + baseY with a small
 * vertical offset (±15 px) and a wingPhase offset for visual variety.
 * When the pool doesn't have enough free slots, the controller fills
 * what is available.
 */
export const BIRD_GROUP_SIZE_RANGE: readonly [number, number] = [2, 3]

/** Follower vertical offset range (px) — keeps the flock compact. */
export const BIRD_FOLLOWER_OFFSET_RANGE: readonly [number, number] = [
  -15, 15,
]

/** Off-canvas margin (px) where gust leaves enter the canvas. (FU-J.) */
export const GUST_LEAF_EDGE_INSET = 40

/**
 * Gust-leaf base horizontal speed (px/s). The leaf travels the full
 * canvas width: startX at one edge, retire at the opposite edge, so
 * the speed band is wider than the pre-FU-J cloud-style dance. (FU-J.)
 */
export const GUST_LEAF_SPEED_RANGE: readonly [number, number] = [70, 130]

/** Gust-leaf lifetime (s). (FU-J: 4-7 s, longer than the pre-FU-J 3-5 s
 *  because the leaf now spans the full canvas width.) */
export const GUST_LEAF_LIFETIME_RANGE: readonly [number, number] = [4.0, 7.0]

/** Gust-leaf vertical drop (px/s) — small but visible. (FU-J.) */
export const GUST_LEAF_VY_RANGE: readonly [number, number] = [3, 7]

/** Gust-leaf rotation drift (rad/s). (FU-J.) */
export const GUST_LEAF_ROTATION_RANGE: readonly [number, number] = [
  -0.8, 0.8,
]

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
export const MOTE_ALPHA_RANGE: readonly [number, number] = [0.15, 0.42]

/**
 * Mote scale (sprite scale). Source PNG is 512×512, so 0.003 → ~1.5 px
 * diameter, 0.007 → ~3.6 px — matches Plan §6.1's "1.5–3.5 px pollen
 * dust" target so motes read as ambient atmosphere, not foreground
 * circles. (FU-G: was [0.6, 1.1].)
 */
export const MOTE_SCALE_RANGE: readonly [number, number] = [0.003, 0.007]

/**
 * Gust-leaf scale (sprite scale). Source frames are 106.7×137.55
 * (wind-leaf-01) and 128×120 (wind-leaf-02), so 0.06 → ~7.7 px wide
 * (height ~8 px) and 0.10 → ~12.8 px wide (height ~12 px) — small,
 * unassertive flying leaves that read as wind debris rather than
 * foreground props. (FU-H: was sampled at the much larger BIRD_SCALE
 * range, producing oversized leaves.)
 */
export const GUST_LEAF_SCALE_RANGE: readonly [number, number] = [0.06, 0.10]

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