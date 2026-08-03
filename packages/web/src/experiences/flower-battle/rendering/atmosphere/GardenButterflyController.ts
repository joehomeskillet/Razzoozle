/**
 * Garden butterfly controller — 6-slot pool (FU-Q).
 *
 * Each slot runs its own cubic-Bezier trajectory through the garden
 * mid-ground. Pool sizing: `BUTTERFLY_POOL_SIZE = 6`. Each slot draws
 * its `typeId` from a Fisher-Yates-shuffled bag of all 8 butterfly
 * types (Tagfalter, Schwalbenschwanz, Monarchfalter, Tagpfauenauge,
 * Bläuling, Zitronenfalter, Hochzeit-Mantel, Glasflügler). Type-to-
 * texture lookup is satisfied by `ButterflyTypeBake.ts` which caches
 * the (up, down) texture pair per type.
 *
 * Per-frame update per slot mirrors the FU-O physics:
 *   pos      = cubicBezier(C0, C1, C2, C3, t)
 *   vel      = cubicBezierDerivative(C0, C1, C2, C3, t)
 *   heading  = atan2(vel.y, vel.x)
 *   flapFreq = config.flapFreqHz   ← per-type, sampled from BUTTERFLY_FLAP_FREQ_RANGE
 *   bobY     = sin(t_elapsed * flapFreq * 2/3) * BUTTERFLY_BOB_AMP
 *   sprite.x = pos.x; sprite.y = pos.y + bobY; sprite.rotation = heading
 *
 * Quality / motion gating (per slot):
 *   - Static / low / medium → pool stays empty (capacity = 0).
 *   - Reduced-motion → pool stays empty, update is a no-op.
 *
 * Test seam contract (FU-Q):
 *   - getCapacity()         → returns BUTTERFLY_POOL_SIZE (6) on high.
 *   - getSlots()            → readonly array of 6 ButterflySlot.
 *   - getSlotTypeIds()      → number[] of slot typeIds, length 6.
 *   - getUsedFallback()     → true when the bake returned Texture.WHITE.
 */

import { Container, Sprite, Texture } from "pixi.js"

import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  BUTTERFLY_BASE_Y_RANGE,
  BUTTERFLY_BOB_AMP,
  BUTTERFLY_FIRST_SPAWN_RANGE_MS,
  BUTTERFLY_POOL_SIZE,
  BUTTERFLY_SEGMENT_DURATION_RANGE,
  BUTTERFLY_TYPE_POOL,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { GardenRenderQuality } from "../../garden-pixi.types"
import {
  type ButterflyFrame,
  type ButterflyTypeConfig,
  type ButterflyTypeId,
  BUTTERFLY_TYPES,
} from "./ButterflyTypeGenerator"
import {
  type BakeFramePair,
  bakeButterflyTextures,
  clearButterflyTextureCache,
} from "./ButterflyTypeBake"

/** "Frame" identifiers — wings-up and wings-down. Re-exported from the
 *  generator so existing test imports keep working. */
export type { ButterflyFrame }

export interface GardenButterflyTextures {
  up: Texture
  down: Texture
}

export interface GardenButterflyRenderer {
  /** Bake a Graphics silhouette into a Texture. Tests stub this with
   *  hand-crafted textures; production passes `app.renderer`. */
  generateTexture: (
    target: Container,
    label: ButterflyFrame,
  ) => Texture
}

/** Pre-picked Bezier waypoint (internal). */
export interface ButterflyWaypoint {
  x: number
  y: number
}

/** 2D point — C0/C1/C2/C3 of a Bezier segment. */
export interface BezierPoint {
  x: number
  y: number
}

/** Single Bezier segment in the butterfly's continuous path. */
export interface BezierSegment {
  C0: BezierPoint
  C1: BezierPoint
  C2: BezierPoint
  C3: BezierPoint
  /** Segment lifetime (seconds). */
  segmentDuration: number
  /** Elapsed time within the segment (seconds). */
  segmentElapsed: number
}

/** Per-slot runtime state — exposed for tests. */
export interface ButterflySlot {
  readonly typeId: ButterflyTypeId
  readonly config: ButterflyTypeConfig
  readonly sprite: Sprite
  /** Y baseline for the slot's spawn band pick. */
  readonly baseY: number
  /** Pre-picked Bezier waypoints (first N segments). */
  readonly waypoints: readonly ButterflyWaypoint[]
  /** Live Bezier segment history (mirrors the FU-O contract). */
  readonly segments: BezierSegment[]
  /** Cached (up, down) textures for this slot. */
  readonly textures: { up: Texture; down: Texture }
  /** Current visible frame — `'up'` or `'down'`. */
  currentFrame: ButterflyFrame
  /** Total motion elapsed since first spawn (seconds). Anchors the
   *  bob sinusoid and the wing-swap countdown. */
  totalElapsedSec: number
  /** Time accumulator since the last wing swap (seconds). */
  wingSwapTimerSec: number
  /** Seconds remaining until the next Bezier segment is born. */
  nextSegmentAtSec: number
  /** True once the slot has crossed its first-spawn timer. */
  spawned: boolean
  /** Slots stay alive forever (FU-O); `active` mirrors `spawned` for
   *  test introspection. */
  active: boolean
}

export interface GardenButterflyControllerOptions {
  seed?: number
  quality: GardenRenderQuality
  /** Layer to mount the sprites on. */
  ambient: Container
  /** Suppress all motion. */
  reducedMotion?: boolean
  /** Override the first-spawn band (ms). Tests tighten to make
   *  assertions deterministic. */
  firstSpawnRangeMs?: readonly [number, number]
  /** Override the per-slot wing-swap period (ms). Used by tests to
   *  drive the flap cadence deterministically; production leaves it
   *  unset so the per-type `flapFreqHz` from the config is used. */
  wingSwapRangeMs?: readonly [number, number]
  /**
   * Pre-baked wings-up / wings-down textures per slot. Aggregators
   * that already own the butterfly textures pass them in directly.
   * Keyed by slot index (0..5). When omitted the controller calls
   * `bakeButterflyTextures(renderer)` and assigns each slot one entry
   * of the cache (round-robin across the 8-type rotation).
   */
  butterflyTextures?: readonly GardenButterflyTextures[] | null
  /**
   * Renderer for the bake step. When omitted, the bake falls through
   * to Canvas2D (DOM available) or Texture.WHITE (node test env).
   */
  renderer?: GardenButterflyRenderer | null
}

/* --------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------*/

const DEFAULT_BUTTERFLY_BODY_COLOR = 0xff9900
const BUTTERFLY_WAYPOINT_COUNT = 5
const BUTTERFLY_ENTRY_EDGE_INSET = 40
const BUTTERFLY_TEXTURE_WIDTH = 36
const BUTTERFLY_TEXTURE_HEIGHT = 28
const BUTTERFLY_SPRITE_WIDTH = 36
const BUTTERFLY_SPRITE_HEIGHT = 28

/** Mulberry32 Fisher-Yates shuffle — in-place, O(n). */
function fisherYatesShuffle<T>(items: T[], rng: SeededRandom): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1))
    const a = items[i]!
    const b = items[j]!
    items[i] = b
    items[j] = a
  }
  return items
}

/** Bag-RNG wrapper: holds a shuffled deck of all 8 typeIds, refills +
 *  re-shuffles when the cursor reaches the end. The first 8 draws are
 *  each of the 8 types exactly once (Fisher-Yates over 8 unique items). */
class ButterflyTypeBag {
  private deck: ButterflyTypeId[] = []
  private cursor = 0
  private readonly rng: SeededRandom

  constructor(rng: SeededRandom) {
    this.rng = rng
    this.refill()
  }

  draw(): ButterflyTypeId {
    if (this.cursor >= this.deck.length) this.refill()
    const id = this.deck[this.cursor]!
    this.cursor += 1
    return id
  }

  private refill(): void {
    const fresh: ButterflyTypeId[] = []
    for (let i = 0; i < BUTTERFLY_TYPE_POOL; i += 1) {
      fresh.push(i as ButterflyTypeId)
    }
    fisherYatesShuffle(fresh, this.rng)
    this.deck = fresh
    this.cursor = 0
  }
}

function darkenColor(color: number, factor: number): number {
  const red = Math.round(((color >> 16) & 0xff) * factor)
  const green = Math.round(((color >> 8) & 0xff) * factor)
  const blue = Math.round((color & 0xff) * factor)
  return (red << 16) | (green << 8) | blue
}

function cubicBezier(
  C0: BezierPoint,
  C1: BezierPoint,
  C2: BezierPoint,
  C3: BezierPoint,
  t: number,
): BezierPoint {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  const w0 = mt2 * mt
  const w1 = 3 * mt2 * t
  const w2 = 3 * mt * t2
  const w3 = t2 * t
  return {
    x: w0 * C0.x + w1 * C1.x + w2 * C2.x + w3 * C3.x,
    y: w0 * C0.y + w1 * C1.y + w2 * C2.y + w3 * C3.y,
  }
}

function cubicBezierDerivative(
  C0: BezierPoint,
  C1: BezierPoint,
  C2: BezierPoint,
  C3: BezierPoint,
  t: number,
): BezierPoint {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x:
      3 * mt2 * (C1.x - C0.x) +
      6 * mt * t * (C2.x - C1.x) +
      3 * t2 * (C3.x - C2.x),
    y:
      3 * mt2 * (C1.y - C0.y) +
      6 * mt * t * (C2.y - C1.y) +
      3 * t2 * (C3.y - C2.y),
  }
}

function randomBandY(rng: SeededRandom): number {
  return (
    ATMOSPHERE_HEIGHT *
    rng.range(BUTTERFLY_BASE_Y_RANGE[0], BUTTERFLY_BASE_Y_RANGE[1])
  )
}

function buildInitialSegment(
  rng: SeededRandom,
  waypoint0: ButterflyWaypoint,
): BezierSegment {
  const fromLeft = rng.next() < 0.5
  const C0x = fromLeft
    ? -BUTTERFLY_ENTRY_EDGE_INSET
    : ATMOSPHERE_WIDTH + BUTTERFLY_ENTRY_EDGE_INSET
  const C0y = randomBandY(rng)
  const C3x = waypoint0.x
  const C3y = waypoint0.y
  const C1x = (C0x + C3x) * 0.35 + rng.signed() * 60
  const C1y = (C0y + C3y) * 0.35 + rng.signed() * 40
  const C2x = (C0x + C3x) * 0.65 + rng.signed() * 60
  const C2y = (C0y + C3y) * 0.65 + rng.signed() * 40
  const segmentDuration = rng.range(
    BUTTERFLY_SEGMENT_DURATION_RANGE[0],
    BUTTERFLY_SEGMENT_DURATION_RANGE[1],
  )
  return {
    C0: { x: C0x, y: C0y },
    C1: { x: C1x, y: C1y },
    C2: { x: C2x, y: C2y },
    C3: { x: C3x, y: C3y },
    segmentDuration,
    segmentElapsed: 0,
  }
}

function buildContinuationSegment(
  rng: SeededRandom,
  previous: BezierSegment,
): BezierSegment {
  const C0 = previous.C3
  const tangentX = previous.C3.x - previous.C2.x
  const tangentY = previous.C3.y - previous.C2.y
  const C1x = C0.x + tangentX
  const C1y = C0.y + tangentY
  const C3x = 40 + rng.next() * (ATMOSPHERE_WIDTH - 80)
  const C3y = randomBandY(rng)
  const C2x = C0.x + (C3x - C0.x) * 0.6 + rng.signed() * 50
  const C2y = C0.y + (C3y - C0.y) * 0.6 + rng.signed() * 30
  const segmentDuration = rng.range(
    BUTTERFLY_SEGMENT_DURATION_RANGE[0],
    BUTTERFLY_SEGMENT_DURATION_RANGE[1],
  )
  return {
    C0: { x: C0.x, y: C0.y },
    C1: { x: C1x, y: C1y },
    C2: { x: C2x, y: C2y },
    C3: { x: C3x, y: C3y },
    segmentDuration,
    segmentElapsed: 0,
  }
}

/** Compute the next spawn delay (ms) for a slot's first frame, drawn
 *  from the first-spawn band. */
function pickFirstSpawnDelayMs(
  rng: SeededRandom,
  band: readonly [number, number],
): number {
  return rng.rangeInt(band[0], band[1])
}

/** Sprite tint derived from the per-type body color. */
function tintFromType(
  config: ButterflyTypeConfig,
  frame: ButterflyFrame,
): number {
  // Slight darken for the "down" frame mirrors the FU-N tint-rotation
  // behaviour so the two frames read as different silhouettes even when
  // the bake falls through to Texture.WHITE.
  return frame === "down"
    ? darkenColor(config.bodyColor, 0.65)
    : config.bodyColor
}

/* --------------------------------------------------------------------------
 * Controller
 * ------------------------------------------------------------------------*/

export class GardenButterflyController {
  private readonly rng: SeededRandom
  private readonly quality: GardenRenderQuality
  private readonly reducedMotion: boolean
  private readonly ambient: Container
  private readonly firstSpawnRangeMs: readonly [number, number]
  private readonly wingSwapOverrideMs: readonly [number, number] | null
  private readonly renderer: GardenButterflyRenderer | null
  private readonly slots: ButterflySlot[] = []
  private readonly bag: ButterflyTypeBag
  private nextSpawnAtMs: number = Number.POSITIVE_INFINITY
  private destroyed = false
  /** True when at least one slot's texture bake returned Texture.WHITE.
   *  The int fallback tint-rotation per-slot still applies on top. */
  private readonly usedFallback: boolean

  constructor(options: GardenButterflyControllerOptions) {
    this.quality = options.quality
    this.reducedMotion = options.reducedMotion ?? false
    this.ambient = options.ambient
    this.firstSpawnRangeMs =
      options.firstSpawnRangeMs ?? BUTTERFLY_FIRST_SPAWN_RANGE_MS
    this.wingSwapOverrideMs = options.wingSwapRangeMs ?? null
    this.renderer = options.renderer ?? null
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)

    this.bag = new ButterflyTypeBag(this.rng)

    // Gate: only "high" quality and !reducedMotion. Lower tiers leave
    // the pool empty.
    if (this.reducedMotion || this.quality !== "high") {
      this.usedFallback = true
      this.nextSpawnAtMs = Number.POSITIVE_INFINITY
      return
    }

    // Bake once — same call results in the same cached entry for the
    // whole session. Pass our renderer if available so the bake can
    // use the real Pixi path.
    const cache = bakeButterflyTextures(this.renderer ?? null)
    this.usedFallback = detectUsedFallback(cache)

    // Build the 6 slots, each drawing a unique typeId from the bag
    // (the bag's first 8 draws cover all 8 types exactly once, so the
    // first 6 slots get 6 distinct ids).
    for (let i = 0; i < BUTTERFLY_POOL_SIZE; i += 1) {
      const typeId = this.bag.draw()
      const config = BUTTERFLY_TYPES[typeId]!
      const cached = cache.get(typeId) ?? fallbackFramePair()
      const textures = {
        up: options.butterflyTextures?.[i]?.up ?? cached.up,
        down: options.butterflyTextures?.[i]?.down ?? cached.down,
      }
      const slot = this.buildSlot(typeId, config, textures, i)
      this.slots.push(slot)
    }

    // Schedule the controller-wide first-spawn time. Once any slot
    // ticks past this mark, slots become visible + start their Bezier
    // motion. We use a controller-wide delay rather than per-slot so
    // the pool comes alive in unison.
    this.nextSpawnAtMs = pickFirstSpawnDelayMs(
      this.rng,
      this.firstSpawnRangeMs,
    )
  }

  /** Test seam. */
  getControllerName(): string {
    return "butterfly"
  }

  /** Pool capacity (= BUTTERFLY_POOL_SIZE on high). Lower qualities
   *  collapse to 0. */
  getCapacity(): number {
    if (this.reducedMotion || this.quality !== "high") return 0
    return BUTTERFLY_POOL_SIZE
  }

  /** Number of slots currently visible (crossed the first-spawn gate). */
  getActiveCount(): number {
    let n = 0
    for (const slot of this.slots) if (slot.spawned) n += 1
    return n
  }

  /** Read-only access to the 6-slot pool. */
  getSlots(): readonly ButterflySlot[] {
    return this.slots
  }

  /** typeId of every slot (length 6 when pool is open). Useful for the
   *  Fisher-Yates variety assertion. */
  getSlotTypeIds(): readonly ButterflyTypeId[] {
    return this.slots.map((s) => s.typeId)
  }

  /** The mounted sprite for slot `index`, or null when out of range. */
  getSprite(index: number): Sprite | null {
    return this.slots[index]?.sprite ?? null
  }

  /** Convenience accessor — array of mounted sprites (matches the old
   *  single-sprite `getSprite()` callers that asked for *the* sprite). */
  getSprites(): readonly Sprite[] {
    return this.slots.map((s) => s.sprite)
  }

  /** Live Bezier segments for slot `index` (empty array when out of
   *  range). */
  getSegments(index = 0): readonly BezierSegment[] {
    return this.slots[index]?.segments ?? []
  }

  /** Pre-picked Bezier waypoints for slot `index`. The first
   *  `BUTTERFLY_WAYPOINT_COUNT` are pre-computed, subsequent segments
   *  pick their C3 from RNG (per the FU-O contract). */
  getWaypoints(index = 0): readonly ButterflyWaypoint[] {
    return this.slots[index]?.waypoints ?? []
  }

  /** Frame count per slot — always 2 (up + down). */
  getFrameCount(): number {
    return 2
  }

  /** Current visible frame for slot `index`. Defaults to `'up'`. */
  getCurrentFrame(index = 0): ButterflyFrame {
    return this.slots[index]?.currentFrame ?? "up"
  }

  /** Antennae count baked into the silhouette. */
  getAntennaeCount(): number {
    return 2
  }

  /** True when the bake fell through to Texture.WHITE for at least
   *  one slot. Production never lands here; node tests always do. */
  getUsedFallback(): boolean {
    return this.usedFallback
  }

  /** Convenience for "any slot alive?" — matches the legacy single-slot
   *  `getIsAlive()` contract. */
  getIsAlive(): boolean {
    return this.getActiveCount() > 0
  }

  update(deltaMs: number): void {
    if (this.destroyed || this.reducedMotion) return
    if (this.slots.length === 0) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    const dtSec = clamped / 1000

    // First-spawn gate — once elapsed, all slots fire simultaneously
    // (the legacy single-slot contract) so the pool appears in unison.
    const wasSpawned = this.slots[0]!.spawned
    if (!wasSpawned) {
      const nextTotal =
        (this.slots[0]!.totalElapsedSec + dtSec) * 1000
      if (nextTotal >= this.nextSpawnAtMs) {
        for (const slot of this.slots) {
          slot.spawned = true
          slot.active = true
          slot.sprite.visible = true
        }
      }
    }

    for (const slot of this.slots) {
      this.updateSlot(slot, dtSec)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const slot of this.slots) {
      if (slot.sprite.parent) {
        slot.sprite.parent.removeChild(slot.sprite)
      }
      slot.sprite.destroy()
    }
    this.slots.length = 0
    // We don't own the textures (the bake cache is shared across the
    // whole session), but if a caller passed in custom textures via
    // `butterflyTextures`, they keep ownership — the contract is
    // documented on the option.
    // Clear the bake cache so a subsequent re-bind in the same process
    // doesn't try to reuse stale textures owned by a destroyed
    // renderer. Production calls `bakeButterflyTextures` again before
    // constructing a new controller.
    clearButterflyTextureCache()
  }

  /* -------------------------------------------------------------------- */

  private buildSlot(
    typeId: ButterflyTypeId,
    config: ButterflyTypeConfig,
    textures: { up: Texture; down: Texture },
    slotIndex: number,
  ): ButterflySlot {
    const sprite = new Sprite(textures.up)
    sprite.label = `garden-butterfly-${slotIndex}-${config.name}`
    sprite.anchor.set(0.5, 0.5)
    const baseWidth = Math.max(1, textures.up.width)
    const baseHeight = Math.max(1, textures.up.height)
    sprite.scale.set(
      BUTTERFLY_SPRITE_WIDTH / baseWidth,
      BUTTERFLY_SPRITE_HEIGHT / baseHeight,
    )
    sprite.tint = config.bodyColor
    sprite.visible = false
    this.ambient.addChild(sprite)

    // Per-slot waypoint table — pre-pick 5 deterministic C3 endpoints.
    // Each slot has its own seeded RNG slice (the controller's main
    // RNG is consumed in order, so each slot's waypoints line up
    // deterministically against the seed).
    const wps: ButterflyWaypoint[] = []
    for (let i = 0; i < BUTTERFLY_WAYPOINT_COUNT; i += 1) {
      const xFrac = i / (BUTTERFLY_WAYPOINT_COUNT - 1)
      const x = 40 + xFrac * (ATMOSPHERE_WIDTH - 80)
      const y =
        ATMOSPHERE_HEIGHT *
        this.rng.range(BUTTERFLY_BASE_Y_RANGE[0], BUTTERFLY_BASE_Y_RANGE[1])
      wps.push({ x, y })
    }
    const segments: BezierSegment[] = []
    segments.push(buildInitialSegment(this.rng, wps[0]!))
    const baseY = randomBandY(this.rng)

    return {
      typeId,
      config,
      sprite,
      baseY,
      segments,
      waypoints: wps,
      textures,
      currentFrame: "up",
      totalElapsedSec: 0,
      wingSwapTimerSec: 0,
      nextSegmentAtSec: 0,
      spawned: false,
      active: false,
    }
  }

  private updateSlot(slot: ButterflySlot, dtSec: number): void {
    slot.totalElapsedSec += dtSec
    if (!slot.spawned) return
    const current = slot.segments[slot.segments.length - 1]!
    current.segmentElapsed += dtSec
    let t = current.segmentElapsed / current.segmentDuration
    if (t >= 1) {
      const next = buildContinuationSegment(this.rng, current)
      slot.segments.push(next)
      slot.wingSwapTimerSec = 0
      t = Math.min(1.05, current.segmentElapsed / current.segmentDuration)
    }
    const seg = slot.segments[slot.segments.length - 1]!
    const pos = cubicBezier(seg.C0, seg.C1, seg.C2, seg.C3, t)
    const heading = Math.atan2(pos.y - seg.C0.y, pos.x - seg.C0.x)
    // Use the per-type flap frequency. The fallback path
    // (wingSwapRangeMs override) uses the band's period instead.
    slot.wingSwapTimerSec += dtSec
    let swapPeriodSec = 1 / Math.max(0.001, slot.config.flapFreqHz)
    if (this.wingSwapOverrideMs) {
      swapPeriodSec =
        this.wingSwapOverrideMs[0] / 1000 +
        this.rng.next() *
          ((this.wingSwapOverrideMs[1] - this.wingSwapOverrideMs[0]) /
            1000)
    }
    if (slot.wingSwapTimerSec >= swapPeriodSec) {
      slot.wingSwapTimerSec = 0
      slot.currentFrame = slot.currentFrame === "up" ? "down" : "up"
      if (this.usedFallback) {
        slot.sprite.tint = tintFromType(slot.config, slot.currentFrame)
      } else {
        slot.sprite.texture =
          slot.currentFrame === "up"
            ? slot.textures.up
            : slot.textures.down
      }
    }
    const flapFreq = slot.config.flapFreqHz
    const bobY =
      Math.sin(slot.totalElapsedSec * flapFreq * (2 / 3)) * BUTTERFLY_BOB_AMP
    slot.sprite.x = pos.x
    slot.sprite.y = pos.y + bobY
    slot.sprite.rotation = heading
  }
}

function fallbackFramePair(): BakeFramePair {
  return { up: Texture.WHITE, down: Texture.WHITE }
}

function detectUsedFallback(
  cache: ReadonlyMap<ButterflyTypeId, BakeFramePair>,
): boolean {
  for (const entry of cache.values()) {
    if (entry.up === Texture.WHITE || entry.down === Texture.WHITE) {
      return true
    }
  }
  return false
}

// Backward-compat: legacy callers referenced `DEFAULT_BUTTERFLY_BODY_COLOR`
// via the class — keep it reachable on the class for the lifetime of the
// public API. (Tests can still probe it via reflection if needed.)
;(GardenButterflyController as unknown as {
  DEFAULT_BUTTERFLY_BODY_COLOR: number
}).DEFAULT_BUTTERFLY_BODY_COLOR = DEFAULT_BUTTERFLY_BODY_COLOR

// NOTE: ButterflyWaypoint, BezierPoint, BezierSegment are still exposed
// here because some pre-FU-Q tests probe the same type names via the
// controller's module re-exports. The single-slot -> pool refactor
// kept the type surface stable; consumers that imported these names
// directly continue to compile.
export type { ButterflyWaypoint, BezierPoint, BezierSegment }
