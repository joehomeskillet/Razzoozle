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
 * vertical offset and a wingPhase offset for visual variety. When the
 * pool doesn't have enough free slots, the controller fills what is
 * available.
 */
export const BIRD_GROUP_SIZE_RANGE: readonly [number, number] = [2, 3]

/**
 * Per-follower vertical offset range (px) — controls the vertical spread
 * of the V-formation. (FU-L: widened from the pre-FU-L ±15 px band so the
 * birds read as separate silhouettes rather than a compact flock blob.
 * Sign is chosen per-follower by `(i % 2 === 0 ? 1 : -1)` to alternate
 * above/below the leader.)
 */
export const BIRD_GROUP_VERTICAL_OFFSET_RANGE: readonly [number, number] = [
  50, 80,
]

/**
 * Per-follower horizontal stagger range (px) — multiplied by `(i + 1)`
 * so deeper followers drift further along the travel axis, breaking the
 * pure-line look. (FU-L.)
 */
export const BIRD_GROUP_HORIZONTAL_OFFSET_RANGE: readonly [number, number] = [
  25, 45,
]

/** Off-canvas margin (px) where gust leaves enter the canvas. (FU-J.) */
export const GUST_LEAF_EDGE_INSET = 40

/**
 * Gust-leaf base horizontal speed (px/s). The leaf travels the full
 * canvas width: startX at one edge, retire at the opposite edge.
 * FU-L: lowered from the pre-FU-L 70–130 px/s band to 55–100 px/s so
 * the longer lifetime (5–9 s) reads as a deliberate crossing rather
 * than a blur.
 */
export const GUST_LEAF_SPEED_RANGE: readonly [number, number] = [55, 100]

/**
 * Gust-leaf lifetime (s). FU-M: extended from the previous 5–9 s band to
 * 25–45 s so leaves can remain visible for a full wind crossing.
 */
export const GUST_LEAF_LIFETIME_RANGE: readonly [number, number] = [25.0, 45.0]

export const GUST_LEAF_VEIN_SCALE_RATIO = 0.55
export const GUST_LEAF_VEIN_TINT_FACTOR = 0.55

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
 * Gust-leaf scale (sprite scale). Source frames span 22.6×128 (linden)
 * to 128×137.55 (ivy), so 0.16 → ~17.6 px wide (height ~36 px) and
 * 0.28 → ~30.8 px wide (height ~38 px) — large enough for the leaf
 * shape to be legible at runtime, small enough to avoid colliding
 * with the foreground vegetation. (FU-K: was [0.06, 0.10]; bumped so
 * the new 6-variant palette is visible as actual leaves, not green
 * dots.)
 */
export const GUST_LEAF_SCALE_RANGE: readonly [number, number] = [0.16, 0.28]

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

/**
 * Butterfly base Y range as a fraction of ATMOSPHERE_HEIGHT — Plan §7.2
 * "sanft geschwungene Route im Gartenmittelgrund". (FU-L.)
 */
export const BUTTERFLY_BASE_Y_RANGE: readonly [number, number] = [0.35, 0.65]

/**
 * First butterfly spawn delay (ms) — single shot after this band elapses.
 * Picked at bind from the seeded RNG so the route is deterministic per
 * seed. (FU-L.)
 */
export const BUTTERFLY_FIRST_SPAWN_RANGE_MS: readonly [number, number] = [
  8_000, 15_000,
]

/**
 * Butterfly path speed (px/s) — slower than the bird flock so the
 * silhouette reads as ambient motion rather than a passing flock.
 * (FU-L.)
 */
export const BUTTERFLY_SPEED_RANGE: readonly [number, number] = [40, 80]

/**
 * Butterfly Bezier-segment lifetime range (seconds). Each segment is a
 * single cubic Bezier through C0..C3; on `t >= 1` the controller
 * spawns the next segment (G1 continuous). FU-O physics redesign.
 */
export const BUTTERFLY_SEGMENT_DURATION_RANGE: readonly [number, number] = [
  4, 7,
]

/**
 * Wing-flap frequency multiplier on tangent speed
 * (flapFreq = clamp(speed * BUTTERFLY_FLAP_SPEED_MULT, 1.5, 5.0)).
 * The bob sinusoid rides at `flapFreq * 2/3`. FU-O physics redesign.
 */
export const BUTTERFLY_FLAP_SPEED_MULT = 2.0

/**
 * Vertical bob amplitude (px) layered on top of the Bezier position.
 * FU-O physics redesign.
 */
export const BUTTERFLY_BOB_AMP = 12.0

/**
 * Gust-leaf linear drag coefficient (1/s). Applied as
 * `vy = vy * exp(-LEAF_DRAG_K * dt) + LEAF_GRAVITY * liftFactor * dt`
 * for the ballistic integration. FU-O physics redesign.
 */
export const LEAF_DRAG_K = 0.8

/**
 * Gust-leaf gravity (px/s²). FU-O physics redesign.
 */
export const LEAF_GRAVITY = 9.81

/**
 * Per-rad/s-of-spin reduction in the gravity lift factor
 * (liftFactor = clamp(1 - |angVel| * LEAF_ROTATION_LIFT, 0.05, 1)).
 * Higher angular velocity → less effective gravity → leaf falls slower.
 * FU-O physics redesign.
 */
export const LEAF_ROTATION_LIFT = 0.05

/**
 * Angular drag coefficient (1/s) — `angVel *= exp(-LEAF_ROT_DRAG_K * dt)`.
 * FU-O physics redesign.
 */
export const LEAF_ROT_DRAG_K = 0.2

/**
 * Initial horizontal speed range (px/s) for a freshly spawned gust
 * leaf. The leaf crosses the canvas in `(ATMOSPHERE_WIDTH + 2 * inset)
 * / speed` seconds. FU-O physics redesign.
 */
export const LEAF_FLIGHT_BASE_V_RANGE: readonly [number, number] = [55, 100]

/**
 * Initial vertical speed range (px/s) for a freshly spawned gust leaf.
 * Sign is +ve (downward) per FU-O. FU-O physics redesign.
 */
export const LEAF_FLIGHT_BASE_VY_RANGE: readonly [number, number] = [40, 80]

/**
 * Initial angular velocity range (rad/s). FU-O physics redesign.
 */
export const LEAF_FLIGHT_ANG_VEL_RANGE: readonly [number, number] = [
  -2.5, 2.5,
]

/**
 * Spawn Y band (fraction of `ATMOSPHERE_HEIGHT`). The leaf appears
 * somewhere inside this band and drifts down. FU-O physics redesign.
 */
export const LEAF_FLIGHT_SPAWN_BASE_Y_RANGE: readonly [number, number] = [
  0.18, 0.55,
]

/**
 * Stuck threshold (fraction of `ATMOSPHERE_HEIGHT`). Once a leaf's
 * currentY exceeds this and stays above it for the configured
 * duration, the controller retires the slot. FU-O physics redesign.
 */
export const LEAF_FLIGHT_STUCK_THRESHOLD = 0.55

/**
 * Stuck duration (seconds). A leaf whose currentY exceeds the
 * threshold for at least this long is retired. FU-O physics redesign.
 */
export const LEAF_FLIGHT_STUCK_DURATION = 2.0