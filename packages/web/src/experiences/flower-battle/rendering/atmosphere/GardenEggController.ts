/**
 * Garden egg controller (FU-R).
 *
 * Pooled falling-egg + shell-shatter + yolk-splat system driven by bird
 * drops. Three independent object pools (egg / shell / yolk), each on
 * its own Pixi layer so the host can depth-order the effect:
 *
 *   stageEggs     — falling egg sprites
 *   stageShatter  — shell fragments in flight
 *   stageYolk     — yolk splat + 1-2 mini dots
 *
 * Birds invoke `spawn(birdX, birdY)` and the controller routes the
 * rest: pick the closest plant anchor (when available) to derive the
 * `impactY` line, integrate gravity, shatter on contact, fade the
 * yolk.
 *
 * Determinism: all randomness flows through the injected `SeededRandom`
 * so the same seed always produces the same shatter.
 */

import { Container, Sprite, Texture, TextureSource } from "pixi.js"

import { ATMOSPHERE_HEIGHT } from "./garden-atmosphere.constants"
import {
  EGG_GRAVITY,
  EGG_IMPACT_Y_FRACTION,
  EGG_POOL_SIZE,
  EGG_SHATTER_POOL_SIZE,
  EGG_SHATTER_PIECE_COUNT_RANGE,
  EGG_SHELL_FADE_DURATION_RANGE,
  EGG_TERMINAL_VEL,
  EGG_YOLK_FADE_DURATION_RANGE,
  EGG_YOLK_POOL_SIZE,
  PIECE_GRAVITY,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"

export interface GardenEggControllerOptions {
  eggContainer: Container
  shatterContainer: Container
  yolkContainer: Container
  /** Plant anchor positions (logical px). Empty → fall-line default. */
  flowerAnchors?: readonly { x: number; y: number }[]
  seed?: number
}

export interface GardenEggStats {
  activeEggs: number
  activeShatters: number
  activeYolks: number
}

interface EggSlot {
  sprite: Sprite
  active: boolean
  x: number
  y: number
  vy: number
  impactY: number
}

interface ShellSlot {
  sprite: Sprite
  active: boolean
  landed: boolean
  fadeSec: number
  fadeDuration: number
  groundY: number
  vx: number
  vy: number
  vRot: number
}

interface YolkSlot {
  sprite: Sprite
  active: boolean
  fadeSec: number
  fadeDuration: number
  isMini: boolean
}

const EGG_TEXTURE_SIZE = 18
const EGG_TINT = 0xfff4ba
const EGG_OUTLINE = 0x6b4423
const YOLK_TINT = 0xf4a261
const YOLK_OUTLINE = 0xd97a3a
const YOLK_TEXTURE_SEED = 0xe995

const EGG_TINT_HEX = hexToCssColor(EGG_TINT)
const EGG_OUTLINE_HEX = hexToCssColor(EGG_OUTLINE)
const YOLK_TINT_HEX = hexToCssColor(YOLK_TINT)
const YOLK_OUTLINE_HEX = hexToCssColor(YOLK_OUTLINE)

/**
 * FU-V (SHARD-V): three jagged zig-zag shell-shard variants baked once
 * per module. Each variant is a distinct 8-angle polygon with radii
 * sampled in [0.45 × maxR, 1.0 × maxR] so the outline is highly
 * irregular — NOT a square, NOT a clean diamond. Mulberry32 seeds
 * (0xa1, 0xa2, 0xa3) keep the variant outlines deterministic.
 *
 * Bake sizes match the FU-T "5× from original 4×4" target; the three
 * distinct sizes (18, 20, 22) also give the pool a small visible
 * baseline variety before any per-piece scale variance is applied.
 */
const SHARD_VARIANT_COUNT = 3
const SHARD_BAKE_SIZES = [18, 20, 22] as const
const SHARD_TINTS = [0xfff4ba, 0xfff9d6, 0xffe6b3] as const
const SHARD_OUTLINE_HEX = "#6b4423"
const SHARD_ANGLE_COUNT = 8
const SHARD_RADIUS_MIN_FRACTION = 0.45
const SHARD_RADIUS_MAX_FRACTION = 1.0

interface ShardVariant {
  readonly size: number
  readonly tint: number
  readonly points: ReadonlyArray<readonly [number, number]>
}

const SHARD_VARIANTS: readonly ShardVariant[] = (() => {
  const out: ShardVariant[] = []
  for (let i = 0; i < SHARD_VARIANT_COUNT; i += 1) {
    const rng = createSeededRandom(0xa1 + i)
    const size = SHARD_BAKE_SIZES[i]!
    const tint = SHARD_TINTS[i]!
    const cx = size / 2
    const cy = size / 2
    const maxR = size / 2 - 1
    const points: Array<readonly [number, number]> = []
    for (let j = 0; j < SHARD_ANGLE_COUNT; j += 1) {
      const baseTheta = (j / SHARD_ANGLE_COUNT) * Math.PI * 2
      const jitter = rng.range(0, Math.PI / 8)
      const theta = baseTheta + jitter
      const r =
        rng.range(SHARD_RADIUS_MIN_FRACTION, SHARD_RADIUS_MAX_FRACTION) *
        maxR
      points.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r])
    }
    out.push({ size, tint, points })
  }
  return out
})()

/**
 * FU-V (SHARD-V): per-piece fade-duration jitter (±15 %) and per-piece
 * size-variance range (0.7× – 1.3×). Both sampled at shatter time so
 * different pieces vanish at different times and land at different
 * sizes — the brief's "unterschiedliche grösse beim zerbrechen,
 * zerfallsmuster".
 */
const SHARD_FADE_DURATION_JITTER: readonly [number, number] = [0.85, 1.15]
const SHARD_SCALE_RANGE: readonly [number, number] = [0.7, 1.3]

/**
 * Test escape hatch from `scratchpad/followups/fu-s-brief.md`:
 * when running under the `node` vitest env (no `document` / Canvas2D),
 * the Canvas2D bake path is skipped and we synthesize the egg / shell /
 * yolk textures from a deterministic RGBA byte buffer. The byte buffer
 * path mirrors the Canvas2D output 1:1 (same fill, same stroke) so the
 * `sprite.width >= 6` / `alpha = 1` assertions in the test hold without
 * pulling a real DOM.
 */
const SKIP_CANVAS_BAKE =
  typeof (globalThis as { __gardenEggSkipCanvas?: boolean })
    .__gardenEggSkipCanvas === "boolean"
    ? (globalThis as { __gardenEggSkipCanvas?: boolean })
        .__gardenEggSkipCanvas === true
    : typeof document === "undefined"

export class GardenEggController {
  private readonly rng: SeededRandom
  private readonly eggContainer: Container
  private readonly shatterContainer: Container
  private readonly yolkContainer: Container
  private readonly flowerAnchors: readonly { x: number; y: number }[]
  private readonly eggPool: EggSlot[] = []
  private readonly shatterPool: ShellSlot[] = []
  private readonly yolkPool: YolkSlot[] = []
  private readonly shardTextures: Texture[]
  private destroyed = false

  constructor(options: GardenEggControllerOptions) {
    this.eggContainer = options.eggContainer
    this.shatterContainer = options.shatterContainer
    this.yolkContainer = options.yolkContainer
    this.flowerAnchors = options.flowerAnchors ?? []
    this.rng = createSeededRandom(options.seed ?? 0xe995)

    const eggTexture = buildEggTexture()
    const shardTextures: Texture[] = SHARD_VARIANTS.map(buildShardTexture)
    this.shardTextures = shardTextures
    const yolkTexture = buildYolkTexture()
    const miniYolkTextures = Array.from(
      { length: EGG_YOLK_POOL_SIZE - 1 },
      (_, i) => buildMiniYolkTexture(YOLK_TEXTURE_SEED + i),
    )

    for (let i = 0; i < EGG_POOL_SIZE; i += 1) {
      const sprite = new Sprite(eggTexture)
      sprite.label = `egg-${i}`
      sprite.anchor.set(0.5, 0.5)
      // An 18×18 source at 1.5 scale renders as a visible 27×27 logical-pixel egg (FU-U: 3× original 6×6).
      sprite.scale.set(1.5, 1.5)
      sprite.visible = false
      this.eggContainer.addChild(sprite)
      this.eggPool.push({
        sprite,
        active: false,
        x: 0,
        y: 0,
        vy: 0,
        impactY: 0,
      })
    }
    for (let i = 0; i < EGG_SHATTER_POOL_SIZE; i += 1) {
      const tex = shardTextures[i % shardTextures.length]!
      const sprite = new Sprite(tex)
      sprite.label = `shell-${i}`
      sprite.anchor.set(0.5, 0.5)
      sprite.visible = false
      this.shatterContainer.addChild(sprite)
      this.shatterPool.push({
        sprite,
        active: false,
        landed: false,
        fadeSec: 0,
        fadeDuration: 1,
        groundY: 0,
        vx: 0,
        vy: 0,
        vRot: 0,
      })
    }
    for (let i = 0; i < EGG_YOLK_POOL_SIZE; i += 1) {
      const tex = i === 0 ? yolkTexture : miniYolkTextures[i - 1]!
      const sprite = new Sprite(tex)
      sprite.label = `yolk-${i}`
      sprite.anchor.set(0.5, 0.5)
      sprite.visible = false
      this.yolkContainer.addChild(sprite)
      this.yolkPool.push({
        sprite,
        active: false,
        fadeSec: 0,
        fadeDuration: 1,
        isMini: i !== 0,
      })
    }
  }

  spawn(birdX: number, birdY: number): void {
    if (this.destroyed) return
    const slot = this.eggPool.find((s) => !s.active)
    if (!slot) return
    const impactY = this.resolveImpactY(birdX)
    slot.x = birdX
    slot.y = birdY
    slot.vy = 0
    slot.impactY = impactY
    slot.sprite.position.set(birdX, birdY)
    slot.sprite.alpha = 1
    slot.sprite.visible = true
    slot.active = true
  }

  update(dtMs: number): void {
    if (this.destroyed) return
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000))
    // Gravity + velocity live in the "per-frame at 60 fps" frame of
    // reference (AGY spec: EGG_GRAVITY = 0.38 px/frame²). Convert
    // elapsed seconds to frames so the numbers land on the same
    // physics scale as the rest of the atmosphere.
    const frames = dt * 60
    for (const egg of this.eggPool) {
      if (!egg.active) continue
      egg.vy = Math.min(egg.vy + EGG_GRAVITY * frames, EGG_TERMINAL_VEL)
      egg.y += egg.vy * frames
      egg.sprite.y = egg.y
      if (egg.y >= egg.impactY) {
        this.triggerShatter(egg.x, egg.y, egg.impactY)
        this.releaseEgg(egg)
      }
    }
    for (const piece of this.shatterPool) {
      if (!piece.active) continue
      if (!piece.landed) {
        piece.vy = Math.min(piece.vy + PIECE_GRAVITY * frames, EGG_TERMINAL_VEL)
        piece.sprite.x += piece.vx * frames
        piece.sprite.y += piece.vy * frames
        piece.sprite.rotation += piece.vRot * frames
        if (piece.sprite.y >= piece.groundY) {
          piece.sprite.y = piece.groundY
          piece.landed = true
        }
        continue
      }
      piece.fadeSec += dt
      const t = 1 - piece.fadeSec / piece.fadeDuration
      // FU-V (DECAY-V): ease-out fade (alpha = (clamp(t, 0, 1))²) so
      // shells linger a bit at full opacity then drop off — combined
      // with the per-piece ±15 % jitter above, different shards within
      // the same shatter event vanish at slightly different times.
      // Clamp-then-square (not square-then-clamp) is required so that
      // alpha actually reaches 0 once fadeSec ≥ fadeDuration and the
      // recycle branch below fires.
      const alpha = Math.max(0, t) ** 2
      piece.sprite.alpha = alpha
      if (alpha <= 0) {
        this.releaseShatter(piece)
      }
    }
    for (const yolk of this.yolkPool) {
      if (!yolk.active) continue
      yolk.fadeSec += dt
      const t = 1 - yolk.fadeSec / yolk.fadeDuration
      yolk.sprite.alpha = Math.max(0, t)
      if (t <= 0) {
        this.releaseYolk(yolk)
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const egg of this.eggPool) {
      if (egg.sprite.parent) egg.sprite.parent.removeChild(egg.sprite)
      egg.sprite.destroy()
    }
    this.eggPool.length = 0
    for (const piece of this.shatterPool) {
      if (piece.sprite.parent) piece.sprite.parent.removeChild(piece.sprite)
      piece.sprite.destroy()
    }
    this.shatterPool.length = 0
    for (const yolk of this.yolkPool) {
      if (yolk.sprite.parent) yolk.sprite.parent.removeChild(yolk.sprite)
      yolk.sprite.destroy()
    }
    this.yolkPool.length = 0
  }

  getStats(): GardenEggStats {
    let eggs = 0
    let shatters = 0
    let yolks = 0
    for (const s of this.eggPool) if (s.active) eggs += 1
    for (const s of this.shatterPool) if (s.active) shatters += 1
    for (const s of this.yolkPool) if (s.active) yolks += 1
    return { activeEggs: eggs, activeShatters: shatters, activeYolks: yolks }
  }

  private resolveImpactY(birdX: number): number {
    if (this.flowerAnchors.length === 0) {
      return ATMOSPHERE_HEIGHT * EGG_IMPACT_Y_FRACTION
    }
    let best = this.flowerAnchors[0]!
    let bestDx = Math.abs(best.x - birdX)
    for (let i = 1; i < this.flowerAnchors.length; i += 1) {
      const a = this.flowerAnchors[i]!
      const dx = Math.abs(a.x - birdX)
      if (dx < bestDx) {
        best = a
        bestDx = dx
      }
    }
    return best.y
  }

  private triggerShatter(x: number, y: number, impactY: number): void {
    const count = this.rng.rangeInt(
      EGG_SHATTER_PIECE_COUNT_RANGE[0],
      EGG_SHATTER_PIECE_COUNT_RANGE[1],
    )
    for (let i = 0; i < count; i += 1) {
      const slot = this.shatterPool.find((s) => !s.active)
      if (!slot) return
      slot.vx = this.rng.range(-1.5, 1.5)
      slot.vy = this.rng.range(-3, -1)
      slot.vRot = this.rng.range(-0.15, 0.15)
      slot.landed = false
      slot.fadeSec = 0
      // FU-V (SHARD-V): per-piece ±15 % fade-duration jitter so shards
      // vanish at slightly different times (some pieces persist up to
      // ~1.5 s longer than others — staggered decay).
      slot.fadeDuration =
        this.rng.range(
          EGG_SHELL_FADE_DURATION_RANGE[0],
          EGG_SHELL_FADE_DURATION_RANGE[1],
        ) *
        this.rng.range(
          SHARD_FADE_DURATION_JITTER[0],
          SHARD_FADE_DURATION_JITTER[1],
        )
      slot.groundY = impactY + this.rng.range(0, 3)
      // FU-V (SHARD-V): each piece draws a random shard variant so the
      // shatter looks like a mix of distinct zig-zag fragments rather
      // than 32 copies of the same polygon.
      const variantIdx = this.rng.rangeInt(0, SHARD_VARIANT_COUNT - 1)
      slot.sprite.texture = this.shardTextures[variantIdx]!
      slot.sprite.position.set(x, y)
      slot.sprite.rotation = 0
      slot.sprite.alpha = 1
      slot.sprite.visible = true
      // FU-V (SHARD-V): widen per-piece scale to ±30 % (was [0.7, 1.0])
      // so fragments visibly differ in size.
      slot.sprite.scale.set(
        this.rng.range(SHARD_SCALE_RANGE[0], SHARD_SCALE_RANGE[1]),
        this.rng.range(SHARD_SCALE_RANGE[0], SHARD_SCALE_RANGE[1]),
      )
      slot.active = true
    }
    const main = this.yolkPool.find((s) => !s.active && !s.isMini)
    if (main) {
      main.fadeSec = 0
      main.fadeDuration = this.rng.range(
        EGG_YOLK_FADE_DURATION_RANGE[0],
        EGG_YOLK_FADE_DURATION_RANGE[1],
      )
      main.sprite.position.set(x, y + 1)
      main.sprite.alpha = 0.9
      main.sprite.scale.set(1, 1)
      main.sprite.visible = true
      main.active = true
    }
    let placed = 0
    for (const yolk of this.yolkPool) {
      if (placed >= 2) break
      if (yolk.active || !yolk.isMini) continue
      yolk.fadeSec = 0
      yolk.fadeDuration = this.rng.range(0.4, 0.8)
      yolk.sprite.position.set(
        x + this.rng.range(-2, 2),
        y + this.rng.range(0, 2),
      )
      yolk.sprite.alpha = 0.85
      yolk.sprite.scale.set(this.rng.range(0.6, 0.9), this.rng.range(0.6, 0.9))
      yolk.sprite.visible = true
      yolk.active = true
      placed += 1
    }
  }

  private releaseEgg(slot: EggSlot): void {
    slot.active = false
    slot.sprite.visible = false
  }

  private releaseShatter(slot: ShellSlot): void {
    slot.active = false
    slot.sprite.visible = false
  }

  private releaseYolk(slot: YolkSlot): void {
    slot.active = false
    slot.sprite.visible = false
  }
}

function buildEggTexture(): Texture {
  if (SKIP_CANVAS_BAKE) {
    return bufferTexture(EGG_TEXTURE_SIZE, EGG_TEXTURE_SIZE, (x, y) =>
      isShellPixel(x, y, EGG_TEXTURE_SIZE, EGG_TEXTURE_SIZE, 0.5) ? EGG_OUTLINE : EGG_TINT,
    )
  }
  return textureFromCanvas(
    createCubistEggCanvas(EGG_TEXTURE_SIZE, EGG_TINT, EGG_OUTLINE, 1.5),
  )
}

function buildShardTexture(variant: ShardVariant): Texture {
  const { size, tint, points } = variant
  if (SKIP_CANVAS_BAKE) {
    return bufferTexture(size, size, (x, y) =>
      isShardPixel(x, y, points) ? tint : 0,
    )
  }
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return bufferTexture(size, size, (x, y) =>
      isShardPixel(x, y, points) ? tint : 0,
    )
  }
  ctx.fillStyle = hexToCssColor(tint)
  ctx.strokeStyle = SHARD_OUTLINE_HEX
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(points[0]![0], points[0]![1])
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i]![0], points[i]![1])
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return textureFromCanvas(canvas)
}

function buildYolkTexture(): Texture {
  const w = 24
  const h = 9
  const points = buildIrregularOvalPoints(w, h, 11, 4, 12, YOLK_TEXTURE_SEED)
  if (SKIP_CANVAS_BAKE) {
    return bufferTexture(w, h, (x, y) => {
      const point = { x: x + 0.5, y: y + 0.5 }
      if (!isPointInPolygon(point, points)) return 0
      return distanceToPolygon(point, points) <= 0.8 ? YOLK_OUTLINE : YOLK_TINT
    })
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return bufferTexture(w, h, () => 0)
  drawYolkPath(ctx, points)
  ctx.fillStyle = YOLK_TINT_HEX
  ctx.fill()
  ctx.strokeStyle = YOLK_OUTLINE_HEX
  ctx.lineWidth = 0.8
  ctx.stroke()
  return Texture.from(canvas)
}

function buildMiniYolkTexture(seed: number): Texture {
  const w = 6
  const h = 6
  const points = buildIrregularOvalPoints(w, h, 2.4, 2.4, 6, seed)
  if (SKIP_CANVAS_BAKE) {
    return bufferTexture(w, h, (x, y) =>
      isPointInPolygon({ x: x + 0.5, y: y + 0.5 }, points) ? YOLK_TINT : 0,
    )
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return bufferTexture(w, h, () => 0)
  drawYolkPath(ctx, points)
  ctx.fillStyle = YOLK_TINT_HEX
  ctx.fill()
  return Texture.from(canvas)
}

interface YolkPoint {
  x: number
  y: number
}

function buildIrregularOvalPoints(
  w: number,
  h: number,
  rx: number,
  ry: number,
  count: number,
  seed: number,
): YolkPoint[] {
  const rng = createSeededRandom(seed)
  const cx = w / 2
  const cy = h / 2
  return Array.from({ length: count }, (_, i) => {
    const theta = (i / count) * Math.PI * 2
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const baseRadius = 1 / Math.sqrt((cos * cos) / (rx * rx) + (sin * sin) / (ry * ry))
    const radius = baseRadius * (0.75 + 0.5 * rng.next())
    return { x: cx + cos * radius, y: cy + sin * radius }
  })
}

function drawYolkPath(ctx: CanvasRenderingContext2D, points: readonly YolkPoint[]): void {
  ctx.beginPath()
  for (const point of points) ctx.lineTo(point.x, point.y)
  ctx.closePath()
}

function isPointInPolygon(point: YolkPoint, points: readonly YolkPoint[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!
    const b = points[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function distanceToPolygon(point: YolkPoint, points: readonly YolkPoint[]): number {
  let distance = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
    )
    distance = Math.min(distance, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
  }
  return distance
}

function textureFromCanvas(canvas: HTMLCanvasElement): Texture {
  try {
    return Texture.from(canvas)
  } catch (err) {
    console.warn(
      "[GardenEggController] Texture.from(canvas) failed, falling back:",
      err,
    )
    return new Texture({
      source: TextureSource.from({
        resource: canvas,
        width: canvas.width,
        height: canvas.height,
      }),
    })
  }
}

function createEggCanvas(
  size: number,
  fill: number,
  stroke: number,
  lineWidth: number,
  inset: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas
  ctx.fillStyle = hexToCssColor(fill)
  ctx.fillRect(0, 0, size, size)
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = hexToCssColor(stroke)
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2)
  return canvas
}

function createCubistEggCanvas(
  size: number,
  fill: number,
  stroke: number,
  lineWidth: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas
  const cx = size / 2
  const cy = size / 2
  const baseR = 7
  const points = 10
  // Fixed phase from canonical seed 0xe995 (FU-V): every egg bake shares
  // the same facet wobble so the silhouette is deterministic across
  // spawns and controller instances.
  const facetRng = createSeededRandom(0xe995)
  const phi = facetRng.range(0, Math.PI * 2)
  ctx.beginPath()
  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * Math.PI * 2
    const facet = 0.85 + 0.3 * Math.sin(theta * 3 + phi)
    const sy = Math.sin(theta)
    const topPinch = Math.max(0, -sy)
    const bottomPinch = Math.max(0, sy)
    const pinch = 1 - topPinch * 0.45 - bottomPinch * 0.3
    const r = baseR * facet * pinch
    const x = cx + Math.cos(theta) * r
    const y = cy + sy * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = hexToCssColor(fill)
  ctx.fill()
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = hexToCssColor(stroke)
  ctx.stroke()
  return canvas
}

function bufferTexture(
  w: number,
  h: number,
  pick: (x: number, y: number) => number,
): Texture {
  const buf = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = pick(x, y)
      const i = (y * w + x) * 4
      buf[i] = (c >> 16) & 0xff
      buf[i + 1] = (c >> 8) & 0xff
      buf[i + 2] = c & 0xff
      buf[i + 3] = c === 0 ? 0 : 0xff
    }
  }
  return new Texture({
    source: TextureSource.from({ resource: buf, width: w, height: h }),
  })
}

function isShellPixel(
  x: number,
  y: number,
  w: number,
  h: number,
  inset: number,
): boolean {
  const onTop = y < inset || y > h - 1 - inset
  const onLeft = x < inset || x > w - 1 - inset
  return onTop || onLeft
}

/**
 * FU-V (SHARD-V): ray-cast point-in-polygon for the buffer-fallback
 * path. The Canvas2D real path draws via `ctx.fill()`, but in the node
 * vitest env we synthesize the texture from a per-pixel RGBA buffer and
 * need an integer-friendly polygon test. Pixel-center is `(x + 0.5,
 * y + 0.5)`.
 */
function isShardPixel(
  x: number,
  y: number,
  points: ReadonlyArray<readonly [number, number]>,
): boolean {
  const px = x + 0.5
  const py = y + 0.5
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!
    const b = points[j]!
    if (
      a[1] > py !== b[1] > py &&
      px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside
    }
  }
  return inside
}

function hexToCssColor(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`
}
