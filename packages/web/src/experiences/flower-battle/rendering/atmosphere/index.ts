/**
 * Garden atmosphere — public surface.
 *
 * The atmosphere is a single aggregator that owns four sub-controllers:
 *   - wind: deterministic sine signal + gust scheduler
 *   - birds: Pixi sprite pool in the sky-life layer
 *   - particles: motes + gust leaves + grass-wind sweeps
 *   - butterfly (FU-L): a single ambient butterfly on a Bezier-like
 *     route through the mid-ground (Plan §7.2)
 *
 * All randomness routes through the seeded Mulberry32 PRNG; same seed →
 * same sequence. Quality tiering (high / medium / low / static) gates
 * each pool's capacity and reduced-motion globally suspends motion.
 *
 * The scene calls `createGardenAtmosphere` once at scene creation and
 * drives `update(deltaMs)` from the existing Pixi ticker. `destroy()` is
 * idempotent and tears down every owned Pixi node.
 */

export {
  createGardenAtmosphere,
  GardenWindField,
  type BoundGardenAtmosphere,
  type CreateGardenAtmosphereOptions,
  type GardenAtmosphereInput,
} from "./GardenAtmosphereController"

export {
  GardenBirdController,
  type BirdSafeZone,
  type GardenBirdControllerOptions,
  type GardenBirdTextures,
} from "./GardenBirdController"

export {
  GardenEggController,
  type GardenEggControllerOptions,
  type GardenEggStats,
} from "./GardenEggController"

export {
  GardenParticleController,
  type GardenParticleControllerOptions,
} from "./GardenParticleController"

export {
  GardenButterflyController,
  type ButterflySlot,
  type GardenButterflyControllerOptions,
} from "./GardenButterflyController"

export {
  type ButterflyFrame,
  type ButterflyTypeConfig,
  type ButterflyTypeId,
  BUTTERFLY_TYPES,
  BUTTERFLY_TEXTURE_HEIGHT,
  BUTTERFLY_TEXTURE_WIDTH,
} from "./ButterflyTypeGenerator"

export {
  bakeButterflyTextures,
  clearButterflyTextureCache,
  getButterflyTextureCacheSource,
  type BakeFramePair,
  type ButterflyTextureBaker,
} from "./ButterflyTypeBake"

export {
  GardenWindController,
  computeGustEnvelope,
  computeWindSample,
  type WindControllerOptions,
  type GustSample,
} from "./GardenWindController"

export {
  GardenWindLineController,
  type GardenWindLineControllerOptions,
} from "./GardenWindLineController"

export {
  createSeededRandom,
  DEFAULT_ATMOSPHERE_SEED,
  type SeededRandom,
} from "./seededRandom"

export {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  BIRD_COUNTS,
  BIRD_MID_COUNT,
  BIRD_SPAWN_INTERVAL_RANGE,
  BIRD_GROUP_VERTICAL_OFFSET_RANGE,
  BIRD_GROUP_HORIZONTAL_OFFSET_RANGE,
  BIRD_Y_BAND,
  BUTTERFLY_BASE_Y_RANGE,
  BUTTERFLY_FLAP_FREQ_RANGE,
  BUTTERFLY_FIRST_SPAWN_RANGE_MS,
  BUTTERFLY_POOL_SIZE,
  BUTTERFLY_SPEED_RANGE,
  BUTTERFLY_TYPE_POOL,
  GUST_LEAF_COUNTS,
  GUST_LEAF_MID_COUNT,
  GUST_LEAF_PEACH,
  GUST_LEAF_CORAL,
  GUST_LEAF_LIFETIME_RANGE,
  GUST_LEAF_SPEED_RANGE,
  GUST_LEAF_SPAWN_CORRIDOR_MARGIN,
  GUST_PERIOD_RANGE,
  GUST_RAMP_RANGE,
  GUST_DECAY_RANGE,
  GUST_LEAF_ACTIVATION_THRESHOLD,
  GRASS_TUFT_COUNTS,
  GRASS_WIND_SWEEP_RANGE,
  MOTE_COUNTS,
  MOTE_MID_COUNT,
  MOTE_Y_BAND,
  WIND_FREQ_PRIMARY,
  WIND_FREQ_SECONDARY,
  WIND_FIELD_FLIP_INTERVAL_RANGE,
  WIND_LINE_BASE_ALPHA,
  WIND_LINE_COLOR,
  WIND_LINE_COUNT,
  WIND_LINE_CORRIDOR_HEIGHT,
  WIND_LINE_GUST_ALPHA_GAIN,
  WIND_LINE_HEIGHT,
  WIND_LINE_SPEED_RANGE,
  EGG_GRAVITY,
  EGG_TERMINAL_VEL,
  PIECE_GRAVITY,
  EGG_FALL_SPAWN_INTERVAL_RANGE_MS,
  EGG_IMPACT_Y_FRACTION,
  EGG_SHATTER_PIECE_COUNT_RANGE,
  EGG_YOLK_FADE_DURATION_SEC,
  EGG_YOLK_FADE_DURATION_RANGE,
  EGG_POOL_SIZE,
  EGG_SHATTER_POOL_SIZE,
  EGG_YOLK_POOL_SIZE,
  type WindFieldState,
  resolveGustLeafColors,
} from "./garden-atmosphere.constants"