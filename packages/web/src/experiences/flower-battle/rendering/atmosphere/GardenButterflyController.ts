/**
 * Garden butterfly controller.
 *
 * Plan §7.2 (FU-L): a single ambient butterfly on a gentle, sweeping
 * route across the mid-ground of the garden. Not a foreground prop —
 * one path per session, deterministic from the seed, lives entirely in
 * the ambient layer. Designed as ambient motion: a few seconds of
 * presence, then it retires and the controller idles.
 *
 * Quality / motion gating:
 *   - Static / low / medium → no spawn (pool stays empty).
 *   - Reduced-motion → no spawn, no update.
 *
 *
 * Route: 4–5 deterministic waypoints through BUTTERFLY_BASE_Y_RANGE;
 * the controller walks t ∈ [0, 1] linearly along segment-pairs with
 * a sin perturbation layered on top of baseY for organic motion.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"

import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  BUTTERFLY_BASE_Y_RANGE,
  BUTTERFLY_FIRST_SPAWN_RANGE_MS,
  BUTTERFLY_SPEED_RANGE,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { GardenRenderQuality } from "../../garden-pixi.types"

/** Default amber tint — matches the project-wide `--color-accent`
 *  default. Aggregators that have already resolved the theme can pass
 *  a different number via `bodyColor`; tests pass a stub for
 *  determinism. */
const DEFAULT_BUTTERFLY_BODY_COLOR = 0xff9900

const BUTTERFLY_WAYPOINT_COUNT = 5
const BUTTERFLY_WAVE_AMP_PX = 6
const BUTTERFLY_TEXTURE_WIDTH = 24
const BUTTERFLY_TEXTURE_HEIGHT = 16
const BUTTERFLY_VEIN_TINT_FACTOR = 0.55

export interface GardenButterflyRenderer {
  generateTexture: (target: Container) => Texture
}

interface ButterflyTextureResult {
  texture: Texture
  owned: boolean
}

export interface GardenButterflyControllerOptions {
  seed?: number
  quality: GardenRenderQuality
  /** Layer to mount the sprite on. */
  ambient: Container
  /** Suppress all motion. */
  reducedMotion?: boolean
  /** Override the first-spawn band (ms). Tests tighten to make
   *  assertions deterministic. */
  firstSpawnRangeMs?: readonly [number, number]
  /** Resolved amber color — the aggregator passes the value from
   *  `--color-accent` so unit tests don't need a DOM. Defaults to
   *  `#ff9900` (the project's `--color-accent` default). */
  bodyColor?: number
  renderer?: GardenButterflyRenderer | null
}

interface ButterflyWaypoint {
  x: number
  y: number
}

function darkenColor(color: number, factor: number): number {
  const red = Math.round(((color >> 16) & 0xff) * factor)
  const green = Math.round(((color >> 8) & 0xff) * factor)
  const blue = Math.round((color & 0xff) * factor)
  return (red << 16) | (green << 8) | blue
}

function colorToCss(color: number): string {
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff
  return `rgb(${red} ${green} ${blue})`
}

function fillCanvasEllipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): void {
  context.beginPath()
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
  context.fill()
}

function createCanvasButterflyTexture(
  bodyColor: number,
): ButterflyTextureResult | null {
  if (typeof document === "undefined") return null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = BUTTERFLY_TEXTURE_WIDTH
    canvas.height = BUTTERFLY_TEXTURE_HEIGHT
    const context = canvas.getContext("2d")
    if (!context) return null
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = colorToCss(0xffffff)
    fillCanvasEllipse(context, 6, 8, 6, 7)
    fillCanvasEllipse(context, 18, 8, 6, 7)
    context.fillStyle = colorToCss(
      darkenColor(bodyColor, BUTTERFLY_VEIN_TINT_FACTOR),
    )
    fillCanvasEllipse(context, 12, 8, 1.5, 6)
    const texture = Texture.from(canvas, true)
    if (texture.width < 12 || texture.height < 8) {
      if (texture !== Texture.WHITE && texture !== Texture.EMPTY) {
        texture.destroy(true)
      }
      return null
    }
    return { texture, owned: true }
  } catch {
    return null
  }
}

function createBufferButterflyTexture(
  bodyColor: number,
): ButterflyTextureResult | null {
  try {
    const pixels = new Uint8Array(
      BUTTERFLY_TEXTURE_WIDTH * BUTTERFLY_TEXTURE_HEIGHT * 4,
    )
    const bodyTint = darkenColor(bodyColor, BUTTERFLY_VEIN_TINT_FACTOR)
    for (let y = 0; y < BUTTERFLY_TEXTURE_HEIGHT; y += 1) {
      for (let x = 0; x < BUTTERFLY_TEXTURE_WIDTH; x += 1) {
        const leftWing =
          ((x - 6) / 6) ** 2 + ((y - 8) / 7) ** 2 <= 1
        const rightWing =
          ((x - 18) / 6) ** 2 + ((y - 8) / 7) ** 2 <= 1
        const body =
          ((x - 12) / 1.5) ** 2 + ((y - 8) / 6) ** 2 <= 1
        if (!leftWing && !rightWing && !body) continue
        const color = body ? bodyTint : 0xffffff
        const offset =
          (y * BUTTERFLY_TEXTURE_WIDTH + x) * 4
        pixels[offset] = (color >> 16) & 0xff
        pixels[offset + 1] = (color >> 8) & 0xff
        pixels[offset + 2] = color & 0xff
        pixels[offset + 3] = 255
      }
    }
    const texture = Texture.from(
      {
        resource: pixels,
        width: BUTTERFLY_TEXTURE_WIDTH,
        height: BUTTERFLY_TEXTURE_HEIGHT,
      },
      true,
    )
    return { texture, owned: true }
  } catch {
    return null
  }
}

function createButterflyTexture(
  renderer: GardenButterflyRenderer | null,
  bodyColor: number,
): ButterflyTextureResult {
  if (renderer) {
    const graphics = new Graphics()
      .ellipse(6, 8, 6, 7)
      .fill(0xffffff)
      .ellipse(18, 8, 6, 7)
      .fill(0xffffff)
      .ellipse(12, 8, 1.5, 6)
      .fill(darkenColor(bodyColor, BUTTERFLY_VEIN_TINT_FACTOR))
    let generated: Texture | null = null
    try {
      generated = renderer.generateTexture(graphics)
    } catch {
      generated = null
    }
    graphics.destroy()
    if (
      generated &&
      generated.width >= 12 &&
      generated.height >= 8
    ) {
      return { texture: generated, owned: true }
    }
    if (
      generated &&
      generated !== Texture.WHITE &&
      generated !== Texture.EMPTY &&
      !generated.destroyed
    ) {
      generated.destroy(true)
    }
  }
  return (
    createCanvasButterflyTexture(bodyColor) ??
    createBufferButterflyTexture(bodyColor) ??
    { texture: Texture.WHITE, owned: false }
  )
}

export class GardenButterflyController {
  private readonly rng: SeededRandom
  private readonly quality: GardenRenderQuality
  private readonly reducedMotion: boolean
  private readonly ambient: Container
  private readonly sprite: Sprite | null = null
  private readonly renderer: GardenButterflyRenderer | null
  private butterflyTexture: Texture | null = null
  private butterflyTextureOwned = false
  /** Resolved amber color (from `--color-accent` by default). */
  private readonly bodyColor: number
  private readonly firstSpawnRangeMs: readonly [number, number]
  private readonly nextSpawnAtMs: number
  private readonly waypoints: readonly ButterflyWaypoint[]
  private readonly segmentLengths: readonly number[]
  private readonly pathLength: number
  private readonly speed: number
  /** Time spent on the path (seconds). Drives the path progress. */
  private elapsedSec = 0
  private readonly pathDurationSec: number
  private spawned = false
  private retired = true
  private destroyed = false

  constructor(options: GardenButterflyControllerOptions) {
    this.quality = options.quality
    this.reducedMotion = options.reducedMotion ?? false
    this.ambient = options.ambient
    this.firstSpawnRangeMs =
      options.firstSpawnRangeMs ?? BUTTERFLY_FIRST_SPAWN_RANGE_MS
    this.renderer = options.renderer ?? null
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)
    // `--color-accent` (default #ff9900 — amber) is the project-wide
    // accent. The aggregator resolves it once at scene-bind time
    // (where getComputedStyle is available) and threads the value
    // through here so this controller stays DOM-free for tests. (FU-L.)
    this.bodyColor = options.bodyColor ?? DEFAULT_BUTTERFLY_BODY_COLOR

    // Gate: only "high" quality, no reduced motion. Lower qualities
    // leave the pool empty.
    if (this.reducedMotion || this.quality !== "high") {
      this.nextSpawnAtMs = Number.POSITIVE_INFINITY
      this.waypoints = []
      this.segmentLengths = []
      this.pathLength = 0
      this.speed = 0
      this.pathDurationSec = 0
      return
    }

    // Build the deterministic waypoint path. X is interpolated across
    // the canvas; Y stays inside BUTTERFLY_BASE_Y_RANGE.
    const wps: ButterflyWaypoint[] = []
    for (let i = 0; i < BUTTERFLY_WAYPOINT_COUNT; i += 1) {
      const xFrac = i / (BUTTERFLY_WAYPOINT_COUNT - 1)
      const x = 40 + xFrac * (ATMOSPHERE_WIDTH - 80)
      const y =
        ATMOSPHERE_HEIGHT *
        this.rng.range(
          BUTTERFLY_BASE_Y_RANGE[0],
          BUTTERFLY_BASE_Y_RANGE[1],
        )
      wps.push({ x, y })
    }
    this.waypoints = wps
    const segs: number[] = []
    let totalLen = 0
    for (let i = 0; i < wps.length - 1; i += 1) {
      const a = wps[i]!
      const b = wps[i + 1]!
      const segLen = Math.hypot(b.x - a.x, b.y - a.y)
      segs.push(segLen)
      totalLen += segLen
    }
    this.segmentLengths = segs
    this.pathLength = Math.max(1, totalLen)
    this.speed = this.rng.range(
      BUTTERFLY_SPEED_RANGE[0],
      BUTTERFLY_SPEED_RANGE[1],
    )
    this.pathDurationSec = this.pathLength / Math.max(1, this.speed)

    const generatedTexture = createButterflyTexture(
      this.renderer,
      this.bodyColor,
    )
    const sprite = new Sprite(generatedTexture.texture)
    sprite.label = "garden-butterfly"
    sprite.anchor.set(0.5, 0.5)
    sprite.tint = this.bodyColor
    sprite.visible = false
    this.ambient.addChild(sprite)
    this.sprite = sprite
    this.butterflyTexture = generatedTexture.texture
    this.butterflyTextureOwned = generatedTexture.owned

    // Schedule first spawn from the dedicated band.
    this.nextSpawnAtMs = this.rng.rangeInt(
      this.firstSpawnRangeMs[0],
      this.firstSpawnRangeMs[1],
    )
  }

  /** Test seam. */
  getControllerName(): string {
    return "butterfly"
  }

  /** Test seam — true while the butterfly is on screen. */
  getIsAlive(): boolean {
    return this.spawned && !this.retired
  }

  /** Pool capacity (1 by Plan §7.2). */
  getCapacity(): number {
    return this.quality === "high" && !this.reducedMotion ? 1 : 0
  }

  /** Current active count (0 or 1). */
  getActiveCount(): number {
    return this.getIsAlive() ? 1 : 0
  }

  /** The mounted sprite, or null when the pool is empty. */
  getSprite(): Sprite | null {
    return this.sprite
  }

  /** Deterministic waypoints (test seam — for assertions). */
  getWaypoints(): readonly ButterflyWaypoint[] {
    return this.waypoints
  }

  update(deltaMs: number): void {
    if (this.destroyed || this.reducedMotion) return
    if (!this.sprite) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    if (!this.spawned) {
      // Wait until the first-spawn timer elapses, then start the path.
      const elapsedMsTotal = this.elapsedSec * 1000
      if (elapsedMsTotal + clamped < this.nextSpawnAtMs) {
        this.elapsedSec += clamped / 1000
        return
      }
      this.spawned = true
      this.retired = false
      this.elapsedSec = 0
      this.sprite.visible = true
    }
    if (this.retired) return
    this.elapsedSec += clamped / 1000
    const progress = Math.min(this.pathLength, this.speed * this.elapsedSec)
    const point = this.samplePath(progress)
    // Wave perturbation on top of the path.
    const wave = Math.sin(this.elapsedSec * 3) * BUTTERFLY_WAVE_AMP_PX
    this.sprite.x = point.x
    this.sprite.y = point.y + wave
    // Subtle rotation nudge — orient the butterfly along the path so
    // the silhouette looks like it's actually travelling.
    this.sprite.rotation = point.tangent
    if (progress >= this.pathLength) {
      this.retired = true
      this.sprite.visible = false
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.sprite) {
      if (this.sprite.parent) {
        this.sprite.parent.removeChild(this.sprite)
      }
      this.sprite.destroy()
    }
    if (
      this.butterflyTextureOwned &&
      this.butterflyTexture &&
      !this.butterflyTexture.destroyed
    ) {
      this.butterflyTexture.destroy(true)
    }
    this.butterflyTexture = null
    this.butterflyTextureOwned = false
  }

  private samplePath(progress: number): {
    x: number
    y: number
    tangent: number
  } {
    let remaining = progress
    for (let i = 0; i < this.waypoints.length - 1; i += 1) {
      const segLen = this.segmentLengths[i]!
      if (remaining <= segLen || i === this.waypoints.length - 2) {
        const t = segLen > 0 ? remaining / segLen : 0
        const a = this.waypoints[i]!
        const b = this.waypoints[i + 1]!
        const x = a.x + (b.x - a.x) * t
        const y = a.y + (b.y - a.y) * t
        const tangent = Math.atan2(b.y - a.y, b.x - a.x)
        return { x, y, tangent }
      }
      remaining -= segLen
    }
    const last = this.waypoints[this.waypoints.length - 1]!
    return { x: last.x, y: last.y, tangent: 0 }
  }
}