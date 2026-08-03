/**
 * Garden atmosphere — public surface.
 *
 * The atmosphere is a single aggregator that owns three sub-controllers:
 *   - wind: deterministic sine signal + gust scheduler
 *   - birds: Pixi sprite pool in the sky-life layer
 *   - particles: motes + gust leaves + grass-wind sweeps
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
  GardenParticleController,
  type GardenParticleControllerOptions,
} from "./GardenParticleController"

export {
  GardenWindController,
  computeGustEnvelope,
  computeWindSample,
  type WindControllerOptions,
  type GustSample,
} from "./GardenWindController"

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
  BIRD_Y_BAND,
  GUST_LEAF_COUNTS,
  GUST_LEAF_MID_COUNT,
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
} from "./garden-atmosphere.constants"