/**
 * Garden atmosphere aggregator.
 *
 * Single facade that owns the wind, bird, particle, butterfly, and
 * wind-line sub-controllers. The scene drives this through
 * `update(deltaMs)` after each Pixi ticker frame. Idempotent
 * `destroy()` tears down every owned child.
 *
 * Why this exists: keeps the sub-controllers decoupled for unit
 * testing while presenting a single, stable API to `GardenScene`. The
 * facade never adds allocation pressure — `update()` only writes to
 * pre-built Pixi nodes.
 *
 * FU-Q: a single `GardenWindField` instance is created here and
 * shared with `GardenWindLineController` and
 * `GardenParticleController` so speed-lines and gust leaves stay
 * coherent (same wind direction + same corridor midline).
 */

import { Container, type Texture } from "pixi.js"

import type { GardenPalette } from "../gardenPalette"
import type { GardenRenderQuality } from "../../garden-pixi.types"
import {
  GardenBirdController,
  type BirdSafeZone,
  type GardenBirdTextures,
} from "./GardenBirdController"
import {
  GardenParticleController,
} from "./GardenParticleController"
import {
  GardenWindController,
} from "./GardenWindController"
import {
  GardenButterflyController,
  type GardenButterflyRenderer,
} from "./GardenButterflyController"
import {
  GardenWindLineController,
} from "./GardenWindLineController"
import {
  resolveThemeTokenColor,
  type ThemeColorResolver,
} from "../resolveThemeColor"
import {
  ATMOSPHERE_HEIGHT,
  WIND_FIELD_FLIP_INTERVAL_RANGE,
  type WindFieldState,
} from "./garden-atmosphere.constants"
import {
  DEFAULT_ATMOSPHERE_SEED,
  createSeededRandom,
  type SeededRandom,
} from "./seededRandom"

export interface GardenAtmosphereInput {
  /**
   * Pixi sky-life layer (background — behind distant hills). Reserved for
   * future sky objects. Deprecated for birds: see `skyLifeForeground`.
   * Kept so pre-FU-I callers continue to compile.
   */
  skyLife: Container
  /**
   * FU-I: Pixi sky-life foreground layer — birds mount here so they render
   * ABOVE distant hills / bushes and BELOW grass / trees / fence / plots /
   * flowers. Plumbed straight through to GardenBirdController.
   */
  skyLifeForeground: Container
  /** Pixi ambient layer — motes + gust leaves. */
  ambient: Container
  /** Pixi weather layer — reserved for future wind-blown leaves / pollen. */
  weather: Container
  /** Pixi grass layer — animated tufts. */
  grass: Container
  /** Resolved palette. */
  palette: GardenPalette
  /** Quality tier. `static` short-circuits the bind. */
  quality: GardenRenderQuality
  /** Suppresses all motion when true. */
  prefersReducedMotion: boolean
  /** Seed for the deterministic RNG. */
  seed?: number
  /** Bird wing-up / wing-down textures. Null = empty bird pool. */
  birdTextures?: GardenBirdTextures | null
  /** Wind-leaves textures. Empty = no gust leaves spawn. */
  windLeafTextures?: readonly Texture[]
  /** Mote texture. Null = no motes. */
  moteTexture?: Texture | null
  /** Plot-band safe zones (logical px). Birds reject spawns inside these. */
  safeZones?: readonly BirdSafeZone[]
  /** Sun-holder world position (logical px). Non-null enables the
   *  `SUN_SAFE_RADIUS` exclusion; null disables it (back-compatible). */
  sunPosition?: { x: number; y: number } | null
  /**
   * Color resolver for theme-token lookups. FU-L: the aggregator
   * resolves `--color-accent` once at scene-bind time and threads
   * the numeric value into `GardenButterflyController`. Tests stub
   * this to skip the DOM lookup.
   */
  resolveColor?: ThemeColorResolver
  renderer?: GardenButterflyRenderer | null
}

export interface BoundGardenAtmosphere {
  update(deltaMs: number): void
  destroy(): void
  /** Test hooks. */
  setGustPeriod(minMs: number, maxMs: number): void
  forceNextGustAt(msFromNow: number): void
  getBirdCount(): number
  getActiveBirdCount(): number
  getMoteCount(): number
  getGustLeafCount(): number
  getGustLeafCapacity(): number
  /**
   * FU-Q backward-compat shim — preserved as the legacy "is there a
   * butterfly pool?" sentinel (returns 1 when the butterfly pool is
   * non-empty). New callers should reach for `getButterflyCapacity()`
   * (the actual pool size, 6 at high quality per FU-Q).
   */
  getButterflyCount(): number
  /** FU-Q: actual butterfly pool capacity (= `BUTTERFLY_POOL_SIZE`). */
  getButterflyCapacity(): number
  /** FU-Q: number of currently-spawned butterflies (≤ capacity). */
  getActiveButterflyCount(): number
  getButterflyActive(): boolean
  getWindSample(): number
  getElapsedSeconds(): number
}

/* --------------------------------------------------------------------------
 * Shared WindField (FU-Q).
 *
 * Single source of truth for `direction` (1 = LTR, -1 = RTL) and
 * `midlineY` (the speed-line corridor centre). The aggregator creates
 * one instance and threads it into both the wind-line controller
 * (which stacks the 6 lines around `midlineY`) and the particle
 * controller (which spawns leaves within ±30 px of `midlineY`).
 * ------------------------------------------------------------------------*/

const DEFAULT_WIND_MIDLINE_FRAC = 0.4

export class GardenWindField {
  private state: WindFieldState = {
    direction: 1,
    midlineY: ATMOSPHERE_HEIGHT * DEFAULT_WIND_MIDLINE_FRAC,
  }
  private readonly rng: SeededRandom
  private elapsedSec = 0
  private nextFlipAtSec: number

  constructor(seed: number) {
    this.rng = createSeededRandom(seed)
    this.nextFlipAtSec = this.rng.range(
      WIND_FIELD_FLIP_INTERVAL_RANGE[0],
      WIND_FIELD_FLIP_INTERVAL_RANGE[1],
    )
  }

  getState(): WindFieldState {
    return this.state
  }

  update(deltaMs: number): void {
    const clamped = Math.min(50, Math.max(0, deltaMs))
    const dt = clamped / 1000
    this.elapsedSec += dt
    if (this.elapsedSec >= this.nextFlipAtSec) {
      const flipped: 1 | -1 = this.state.direction === 1 ? -1 : 1
      this.state = {
        direction: flipped,
        midlineY: this.state.midlineY,
      }
      this.elapsedSec = 0
      this.nextFlipAtSec = this.rng.range(
        WIND_FIELD_FLIP_INTERVAL_RANGE[0],
        WIND_FIELD_FLIP_INTERVAL_RANGE[1],
      )
    }
  }
}

export interface CreateGardenAtmosphereOptions extends GardenAtmosphereInput {}

export function createGardenAtmosphere(
  options: CreateGardenAtmosphereOptions,
): BoundGardenAtmosphere {
  // `static` quality is defensive: the scene never binds the atmosphere in
  // that path. If a test injects it anyway, return a strict no-op.
  if (options.quality === "static") {
    return createNoopAtmosphere()
  }

  const seed = options.seed ?? DEFAULT_ATMOSPHERE_SEED
  const wind = new GardenWindController({
    seed,
    reducedMotion: options.prefersReducedMotion,
  })
  const windField = new GardenWindField(seed)
  const birds = new GardenBirdController({
    seed,
    quality: options.quality,
    reducedMotion: options.prefersReducedMotion,
    // FU-I: plumb the new foreground layer so birds render above distant
    // hills. The legacy `skyLife` option is also passed so pre-FU-I code
    // paths remain covered if a caller sets only one.
    skyLifeForeground: options.skyLifeForeground,
    skyLife: options.skyLife,
    birdTextures: options.birdTextures ?? null,
    safeZones: options.safeZones ?? [],
    sunPosition: options.sunPosition ?? null,
  })
  const particles = new GardenParticleController({
    seed,
    quality: options.quality,
    reducedMotion: options.prefersReducedMotion,
    ambient: options.ambient,
    grass: options.grass,
    moteTexture: options.moteTexture ?? null,
    windLeafTextures: options.windLeafTextures ?? [],
    palette: options.palette,
    windField,
  })
  // FU-L: ambient butterfly (Plan §7.2). Pool-of-6 gated on quality
  // === "high" + !reducedMotion inside the controller. The aggregator
  // resolves `--color-accent` once (when a `resolveColor` is
  // provided) and threads the numeric value through so the controller
  // itself stays DOM-free for the unit tests (which run under `node`,
  // not jsdom).
  const butterflyBodyColor = options.resolveColor
    ? options.resolveColor("--color-accent" as never)
    : undefined
  const butterfly = new GardenButterflyController({
    seed,
    quality: options.quality,
    ambient: options.ambient,
    reducedMotion: options.prefersReducedMotion,
    bodyColor: butterflyBodyColor,
    renderer: options.renderer,
  })
  // FU-P, FU-Q: cream-yellow Bezier speed-lines in the weather layer.
  // The 6 lines stack tightly around the shared `WindField.midlineY`
  // and drift in the current `windField.direction`.
  const windLines = options.weather
    ? new GardenWindLineController({
        weather: options.weather,
        seed,
        windField,
      })
    : null

  let destroyed = false

  function update(deltaMs: number): void {
    if (destroyed) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    const sample = wind.update(clamped)
    windField.update(clamped)
    birds.update(clamped)
    particles.update(clamped, sample)
    butterfly.update(clamped)
    if (windLines) windLines.update(clamped, sample)
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    birds.destroy()
    particles.destroy()
    butterfly.destroy()
    if (windLines) windLines.destroy()
  }

  return {
    update,
    destroy,
    setGustPeriod: (min, max) => wind.setGustPeriod(min, max),
    forceNextGustAt: (msFromNow) => wind.forceNextGustAt(msFromNow),
    getBirdCount: () => birds.getBirdCount(),
    getActiveBirdCount: () => birds.getActiveBirdCount(),
    getMoteCount: () => particles.getMoteCount(),
    getGustLeafCount: () => particles.getGustLeafCount(),
    getGustLeafCapacity: () => particles.getGustLeafCapacity(),
    // FU-Q backward-compat: legacy single-slot semantic — returns 1
    // when the butterfly pool is non-empty (capacity > 0), else 0.
    // The internal pool is 6 slots; use `getButterflyCapacity()` for
    // the new contract.
    getButterflyCount: () => (butterfly.getCapacity() > 0 ? 1 : 0),
    getButterflyCapacity: () => butterfly.getCapacity(),
    getActiveButterflyCount: () => butterfly.getActiveCount(),
    getButterflyActive: () => butterfly.getIsAlive(),
    getWindSample: () => wind.getSample(),
    getElapsedSeconds: () => wind.getElapsedSeconds(),
  }
}

function createNoopAtmosphere(): BoundGardenAtmosphere {
  let destroyed = false
  return {
    update: () => {},
    destroy: () => {
      destroyed = true
    },
    setGustPeriod: () => {},
    forceNextGustAt: () => {},
    getBirdCount: () => 0,
    getActiveBirdCount: () => 0,
    getMoteCount: () => 0,
    getGustLeafCount: () => 0,
    getGustLeafCapacity: () => 0,
    getButterflyCount: () => 0,
    getButterflyCapacity: () => 0,
    getActiveButterflyCount: () => 0,
    getButterflyActive: () => false,
    getWindSample: () => 0,
    getElapsedSeconds: () => 0,
  }
}
