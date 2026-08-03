/**
 * Garden bird controller.
 *
 * Owns a fixed pool of Pixi Sprite birds in the sky-life layer. Each bird
 * is reused across flights — no per-frame allocation. Spawns are picked
 * from the seeded RNG and rejected if they land in a safe zone (top HUD
 * strip, sun safe radius, team-plot band). Spawn retries up to
 * BIRD_SPAWN_RETRY_LIMIT times before giving up.
 *
 * Reduced-motion and quality gating:
 *   - Static / low → empty pool, never spawn.
 *   - Reduced-motion → empty pool, birds stay off.
 */

import { Container, Sprite, Texture } from "pixi.js"

import { ATMOSPHERE_HEIGHT, ATMOSPHERE_WIDTH } from "./garden-atmosphere.constants"
import {
  BIRD_COUNTS,
  BIRD_FIRST_SPAWN_RANGE_MS,
  BIRD_GROUP_HORIZONTAL_OFFSET_RANGE,
  BIRD_GROUP_SIZE_RANGE,
  BIRD_GROUP_VERTICAL_OFFSET_RANGE,
  BIRD_SCALE_RANGE,
  BIRD_SPAWN_INTERVAL_RANGE_MS,
  BIRD_SPEED_RANGE,
  BIRD_VERTICAL_WAVE_RANGE,
  BIRD_WING_SWAP_RANGE,
  BIRD_Y_BAND,
  BIRD_SPAWN_RETRY_LIMIT,
  HUD_SAFE_TOP_FRACTION,
  SUN_SAFE_RADIUS,
  EGG_FALL_SPAWN_INTERVAL_RANGE_MS,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { GardenRenderQuality } from "../../garden-pixi.types"

export interface GardenBirdTextures {
  up: Texture
  down: Texture
}

interface BirdSlot {
  sprite: Sprite
  /** True while flying — invisible otherwise. */
  active: boolean
  /** Travelling direction (-1 = left, +1 = right). */
  direction: 1 | -1
  /** Speed in logical px/s. */
  speed: number
  baseY: number
  /** Vertical wave amplitude (px). */
  waveAmp: number
  /** Vertical wave phase (radians). */
  wavePhase: number
  /** Time since spawn (seconds) — drives vertical wave. */
  elapsedSec: number
  /** ms until wing swap. */
  wingSwapAtMs: number
  /** ms until this bird is retired. */
  retireAtMs: number
}

export interface GardenBirdControllerOptions {
  seed?: number
  quality: GardenRenderQuality
  /** When true, suppress all motion (no spawns, no animation). */
  reducedMotion?: boolean
  /**
   * Layer the bird sprites are mounted on. Deprecated — prefer
   * `skyLifeForeground` (FU-I: birds render above distant hills).
   * Kept as a back-compat alias: when only `skyLife` is passed, the
   * controller still mounts there so pre-FU-I callers do not break.
   */
  skyLife?: Container
  /**
   * FU-I: foreground sky-life layer — birds render ABOVE distant hills /
   * bushes, BELOW grass / trees / fence / plots / flowers. Takes priority
   * over `skyLife` when both are provided.
   */
  skyLifeForeground?: Container
  /** Pair of textures for wings-up / wings-down. Null = graceful empty pool. */
  birdTextures?: GardenBirdTextures | null
  /** Rectangles (logical px) the controller must avoid. Tests pass plot
   *  anchors / HUD strips here. */
  safeZones?: readonly BirdSafeZone[]
  /** Override the spawn interval (ms). Tests tighten to make assertions
   *  deterministic. */
  spawnIntervalRangeMs?: readonly [number, number]
  /** Override the first-spawn delay (ms). Same purpose as the interval
   *  override — keeps the test surface symmetric. */
  firstSpawnRangeMs?: readonly [number, number]
  /** Sun-holder world position (logical px). When non-null, the controller
   *  rejects spawn destinations within `SUN_SAFE_RADIUS` of this point.
   *  When null (default), the sun safe zone is disabled — back-compatible
   *  with callers that do not have a sun holder. */
  sunPosition?: { x: number; y: number } | null
  /** FU-R: egg-drop callback (birdX, birdY) — invoked when an active
   *  bird is over the flower-bed corridor. Default = no-op. */
  eggDropper?: (x: number, y: number) => void
  /** FU-R: override the egg drop interval band (ms). Tests tighten to
   *  make assertions deterministic. */
  eggDropIntervalRangeMs?: readonly [number, number]
  /** FU-R: x-range fraction of the atmosphere width inside which a
   *  bird is considered to be over the flower bed (default
   *  `[0.15, 0.85]`). */
  eggDropRangeXFrac?: readonly [number, number]
}

export interface BirdSafeZone {
  x: number
  y: number
  width: number
  height: number
}

export class GardenBirdController {
  private readonly rng: SeededRandom
  private readonly quality: GardenRenderQuality
  private readonly reducedMotion: boolean
  /**
   * FU-I: foreground sky-life layer — the mount point for bird sprites.
   * Prefers `options.skyLifeForeground`; falls back to `options.skyLife` for
   * back-compat with pre-FU-I callers. Both are accepted in the constructor.
   */
  private readonly skyLifeForeground: Container
  /** Deprecated back-compat alias of `skyLifeForeground`. */
  private readonly skyLife: Container
  private readonly pool: BirdSlot[] = []
  private readonly spawnIntervalRangeMs: readonly [number, number]
  private readonly firstSpawnRangeMs: readonly [number, number]
  /** ms from bind when next bird becomes eligible to spawn. */
  private nextSpawnAtMs = 0
  /** ms at which the controller was bound (anchor for spawn timing). */
  private elapsedMs = 0
  /** Safe zones to avoid (HUD strip + sun safe radius + plot band). */
  private readonly safeZones: readonly BirdSafeZone[]
  private readonly birdTextures: GardenBirdTextures | null
  /** Sun-holder world position. Null disables the sun safe radius. */
  private readonly sunPosition: { x: number; y: number } | null
  /** FU-R: shared drop hook. */
  private readonly eggDropper: (x: number, y: number) => void
  private readonly eggDropIntervalRangeMs: readonly [number, number]
  private readonly eggDropRangeXFrac: readonly [number, number]
  /** FU-R: ms from bind when the next egg drop is allowed. */
  private nextDropAtMs = 0
  private destroyed = false

  constructor(options: GardenBirdControllerOptions) {
    this.quality = options.quality
    this.reducedMotion = options.reducedMotion ?? false
    // FU-I: prefer the new foreground layer; fall back to the legacy
    // `skyLife` option so existing tests / pre-FU-I callers keep working.
    const foreground = options.skyLifeForeground ?? options.skyLife
    if (!foreground) {
      throw new Error(
        "GardenBirdController requires either skyLifeForeground or skyLife",
      )
    }
    this.skyLifeForeground = foreground
    this.skyLife = foreground
    this.birdTextures = options.birdTextures ?? null
    this.safeZones = options.safeZones ?? []
    this.sunPosition = options.sunPosition ?? null
    this.spawnIntervalRangeMs =
      options.spawnIntervalRangeMs ?? BIRD_SPAWN_INTERVAL_RANGE_MS
    this.firstSpawnRangeMs =
      options.firstSpawnRangeMs ?? BIRD_FIRST_SPAWN_RANGE_MS
    this.eggDropper = options.eggDropper ?? (() => {})
    this.eggDropIntervalRangeMs =
      options.eggDropIntervalRangeMs ?? EGG_FALL_SPAWN_INTERVAL_RANGE_MS
    this.eggDropRangeXFrac = options.eggDropRangeXFrac ?? [0.15, 0.85]
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)

    const poolSize = BIRD_COUNTS[this.quality]
    if (this.reducedMotion) {
      this.nextSpawnAtMs = Number.POSITIVE_INFINITY
      return
    }
    if (poolSize === 0 || !this.birdTextures) {
      this.nextSpawnAtMs = Number.POSITIVE_INFINITY
      return
    }

    for (let i = 0; i < poolSize; i += 1) {
      const sprite = new Sprite(this.birdTextures.up)
      sprite.label = `bird-${i}`
      sprite.anchor.set(0.5, 0.5)
      sprite.visible = false
      this.skyLifeForeground.addChild(sprite)
      this.pool.push({
        sprite,
        active: false,
        direction: 1,
        speed: 0,
        baseY: 0,
        waveAmp: 0,
        wavePhase: 0,
        elapsedSec: 0,
        wingSwapAtMs: 0,
        retireAtMs: 0,
      })
    }

    if (this.reducedMotion) {
      this.nextDropAtMs = Number.POSITIVE_INFINITY
    } else {
      this.nextDropAtMs = this.rng.rangeInt(
        this.eggDropIntervalRangeMs[0],
        this.eggDropIntervalRangeMs[1],
      )
    }

    // Stagger the first spawn so we don't dump everything at t=0. Uses
    // the dedicated first-spawn band (2.5–6 s) so the user actually sees
    // a bird during normal observation. (FU-H.)
    this.nextSpawnAtMs = this.rng.rangeInt(
      this.firstSpawnRangeMs[0],
      this.firstSpawnRangeMs[1],
    )
  }

  /** Current pool size (== configured maximum birds). */
  getBirdCount(): number {
    return this.pool.length
  }

  /** Active (in-flight) bird count. */
  getActiveBirdCount(): number {
    let count = 0
    for (const slot of this.pool) {
      if (slot.active) count += 1
    }
    return count
  }

  update(deltaMs: number): void {
    if (this.destroyed || this.reducedMotion) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    this.elapsedMs += clamped

    if (this.elapsedMs >= this.nextSpawnAtMs) {
      this.trySpawn()
      this.nextSpawnAtMs =
        this.elapsedMs +
        this.rng.rangeInt(
          this.spawnIntervalRangeMs[0],
          this.spawnIntervalRangeMs[1],
        )
    }

    for (const slot of this.pool) {
      if (!slot.active) continue
      slot.elapsedSec += clamped / 1000
      // Advance horizontally. Keep the wave on top so it never overrides
      // an out-of-band value — we re-add it each frame from the saved
      // base Y.
      const step = (slot.speed * clamped) / 1000
      slot.sprite.x += slot.direction * step
      slot.sprite.y =
        slot.baseY + Math.sin(slot.elapsedSec * 4 + slot.wavePhase) * slot.waveAmp
      // Wing swap on the configured cadence.
      if (this.elapsedMs >= slot.wingSwapAtMs) {
        slot.wingSwapAtMs =
          this.elapsedMs +
          this.rng.rangeInt(
            BIRD_WING_SWAP_RANGE[0],
            BIRD_WING_SWAP_RANGE[1],
          )
        if (this.birdTextures) {
          const usingUp = slot.sprite.texture === this.birdTextures.up
          slot.sprite.texture = usingUp
            ? this.birdTextures.down
            : this.birdTextures.up
        }
      }
      // Retire once the bird has cleared the canvas by a full sprite width.
      const margin = 80
      if (
        (slot.direction === 1 &&
          slot.sprite.x > ATMOSPHERE_WIDTH + margin) ||
        (slot.direction === -1 &&
          slot.sprite.x < -margin) ||
        this.elapsedMs >= slot.retireAtMs
      ) {
        slot.active = false
        slot.sprite.visible = false
      }
    }

    this.maybeDropEgg()
  }

  private maybeDropEgg(): void {
    if (this.destroyed || this.reducedMotion) return
    if (this.elapsedMs < this.nextDropAtMs) return
    const xMin = ATMOSPHERE_WIDTH * this.eggDropRangeXFrac[0]
    const xMax = ATMOSPHERE_WIDTH * this.eggDropRangeXFrac[1]
    let dropper: BirdSlot | null = null
    for (const slot of this.pool) {
      if (!slot.active) continue
      if (slot.sprite.x < xMin || slot.sprite.x > xMax) continue
      if (dropper === null || slot.sprite.x > dropper.sprite.x) {
        dropper = slot
      }
    }
    if (!dropper) {
      this.nextDropAtMs = this.elapsedMs + 250
      return
    }
    this.eggDropper(dropper.sprite.x, dropper.sprite.y)
    this.nextDropAtMs =
      this.elapsedMs +
      this.rng.rangeInt(
        this.eggDropIntervalRangeMs[0],
        this.eggDropIntervalRangeMs[1],
      )
  }

  /** FU-R: test hook — force the next drop to be eligible now. */
  forceNextDrop(): void {
    this.nextDropAtMs = this.elapsedMs
  }

  private trySpawn(): void {
    // FU-J: spawn a flock of 2-3 birds per wave. Leader picks a safe
    // destination; followers trail the leader with the per-axis offsets
    // described below. If the pool has fewer free slots than the
    // chosen group size, fill what is available — never block on
    // a partial group.
    const groupSize = this.rng.rangeInt(
      BIRD_GROUP_SIZE_RANGE[0],
      BIRD_GROUP_SIZE_RANGE[1],
    )
    const freeSlots = this.pool.filter((s) => !s.active)
    if (freeSlots.length === 0) return
    const spawnCount = Math.min(groupSize, freeSlots.length)
    if (spawnCount === 0) return

    const destination = this.pickSafeDestination()
    if (!destination) return
    const dir: 1 | -1 = destination.x < ATMOSPHERE_WIDTH / 2 ? 1 : -1
    const leaderStartX = dir === 1 ? -40 : ATMOSPHERE_WIDTH + 40
    // Shared flight parameters — every bird in the flock flies the
    // same path (leader's), so they read as a single V-formation.
    const leaderSpeed = this.rng.range(
      BIRD_SPEED_RANGE[0],
      BIRD_SPEED_RANGE[1],
    )
    const flockWaveAmp = this.rng.range(
      BIRD_VERTICAL_WAVE_RANGE[0],
      BIRD_VERTICAL_WAVE_RANGE[1],
    )
    const flockLeaderPhase = this.rng.range(0, Math.PI * 2)
    // Worst-case time to cross the canvas; ensures birds always retire
    // even if the speed cell glitches to 0.
    const flockRetireAtMs =
      this.elapsedMs + (ATMOSPHERE_WIDTH / Math.max(1, leaderSpeed)) * 1000 * 2
    const flockWingSwapAtMs =
      this.elapsedMs +
      this.rng.rangeInt(
        BIRD_WING_SWAP_RANGE[0],
        BIRD_WING_SWAP_RANGE[1],
      )

    for (let i = 0; i < spawnCount; i += 1) {
      const slot = freeSlots[i]!
      const isLeader = i === 0
      // FU-L: per-follower offsets.
      //   vertical = (i % 2 === 0 ? 1 : -1) * rng.range(VVOR) — alternate
      //     above/below the leader so the V reads as two distinct rows.
      //   horizontal = ((i + 1) % 2 === 0 ? 1 : -1)
      //              * rng.range(HOR) * (i + 1) * 0.5 — stagger deeper
      //     followers along the travel axis to break the pure-line look.
      //   speed = leaderSpeed * rng.range(0.95, 1.05) — slight per-bird
      //     variation so the formation doesn't lock-step.
      //   wingPhase = leader.wingPhase + rng.range(-0.5, 0.5) — desync
      //     wing beats visually.
      let verticalOffset = 0
      let horizontalOffset = 0
      let speed = leaderSpeed
      let wingPhase = flockLeaderPhase
      if (!isLeader) {
        verticalOffset =
          (i % 2 === 0 ? 1 : -1) *
          this.rng.range(
            BIRD_GROUP_VERTICAL_OFFSET_RANGE[0],
            BIRD_GROUP_VERTICAL_OFFSET_RANGE[1],
          )
        horizontalOffset =
          ((i + 1) % 2 === 0 ? 1 : -1) *
          this.rng.range(
            BIRD_GROUP_HORIZONTAL_OFFSET_RANGE[0],
            BIRD_GROUP_HORIZONTAL_OFFSET_RANGE[1],
          ) *
          (i + 1) *
          0.5
        speed = leaderSpeed * this.rng.range(0.95, 1.05)
        wingPhase = flockLeaderPhase + this.rng.range(-0.5, 0.5)
      }
      const baseY = destination.y + verticalOffset
      const startX = leaderStartX + horizontalOffset
      slot.baseY = baseY
      slot.sprite.position.set(startX, slot.baseY)
      slot.direction = dir
      slot.speed = speed
      slot.waveAmp = flockWaveAmp
      slot.wavePhase = wingPhase
      slot.elapsedSec = 0
      slot.wingSwapAtMs = flockWingSwapAtMs
      slot.retireAtMs = flockRetireAtMs
      const scale = this.rng.range(
        BIRD_SCALE_RANGE[0],
        BIRD_SCALE_RANGE[1],
      )
      slot.sprite.scale.set(scale)
      if (dir === -1) {
        // Flip horizontally for left-bound flights.
        slot.sprite.scale.set(-scale, scale)
      }
      slot.sprite.texture = this.birdTextures!.up
      slot.sprite.visible = true
      slot.active = true
    }
  }

  private pickSafeDestination(): { x: number; y: number } | null {
    const yMin = ATMOSPHERE_HEIGHT * BIRD_Y_BAND[0]
    const yMax = ATMOSPHERE_HEIGHT * BIRD_Y_BAND[1]
    const hudBottom = ATMOSPHERE_HEIGHT * HUD_SAFE_TOP_FRACTION
    const sunR2 = SUN_SAFE_RADIUS * SUN_SAFE_RADIUS

    const isInSafeZone = (x: number, y: number): boolean => {
      if (y < hudBottom) return true
      if (this.sunPosition) {
        const dx = x - this.sunPosition.x
        const dy = y - this.sunPosition.y
        if (dx * dx + dy * dy < sunR2) return true
      }
      for (const zone of this.safeZones) {
        if (
          x >= zone.x &&
          x <= zone.x + zone.width &&
          y >= zone.y &&
          y <= zone.y + zone.height
        ) {
          return true
        }
      }
      return false
    }

    for (let attempt = 0; attempt < BIRD_SPAWN_RETRY_LIMIT; attempt += 1) {
      const x = this.rng.range(40, ATMOSPHERE_WIDTH - 40)
      const y = this.rng.range(yMin, yMax)
      if (!isInSafeZone(x, y)) return { x, y }
    }
    return null
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const slot of this.pool) {
      if (slot.sprite.parent) {
        slot.sprite.parent.removeChild(slot.sprite)
      }
      slot.sprite.destroy()
    }
    this.pool.length = 0
  }
}