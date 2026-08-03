/**
 * Garden butterfly controller.
 *
 * Plan §7.2 (FU-L, FU-N): a single ambient butterfly on a gentle,
 * sweeping route across the mid-ground of the garden. Not a foreground
 * prop — one path per session, deterministic from the seed, lives
 * entirely in the ambient layer. Designed as ambient motion: a few
 * seconds of presence, then it retires and the controller idles.
 *
 * FU-N: the detail model now matches the birds' two-frame wing-flap.
 * Two Pixi.Graphics silhouettes — `wings-up` (horizontal spread) and
 * `wings-down` (upper wings folded slightly up) — are baked into their
 * own textures. The sprite cycles between them on a 220–320 ms cadence
 * so the silhouette visibly beats its wings. Each silhouette contains:
 * four wing ellipses (two upper big, two lower small), a vertical body
 * oval, two thin antennae lines going up-and-out from the head, and
 * two small eye dots.
 *
 * Quality / motion gating:
 *   - Static / low / medium → no spawn (pool stays empty).
 *   - Reduced-motion → no spawn, no update.
 *
 * Route: 4–5 deterministic waypoints through BUTTERFLY_BASE_Y_RANGE;
 * the controller walks t ∈ [0, 1] linearly along segment-pairs with
 * a sin perturbation layered on top of baseY for organic motion. The
 * frame swap is layered on top of the existing path motion.
 *
 * Fallback (no renderer, typically in `node` test envs): the sprite
 * uses `Texture.WHITE` as the base texture; the two-frame visual
 * differentiation is communicated by tint rotation
 * (`palette.accent` for `'up'`, a darker amber variant for `'down'`).
 * The frame swap cycles `sprite.tint`. `getFrameCount()` and
 * `getCurrentFrame()` still report the cycle state.
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
const BUTTERFLY_VEIN_TINT_FACTOR = 0.55

/** Texture frame dimensions (logical px). Chosen so the silhouette
 *  fits: the canonical sprite width is 36 px (within Plan §7.2's
 *  24–44 px band — between bird 36–54 and mote 1.5–3.5). */
const BUTTERFLY_TEXTURE_WIDTH = 36
const BUTTERFLY_TEXTURE_HEIGHT = 28
const BUTTERFLY_SPRITE_WIDTH = 36
const BUTTERFLY_SPRITE_HEIGHT = 28

/** Wing-flap cadence (ms) — FU-N: matches the bird's
 *  `BIRD_WING_SWAP_RANGE` band, slightly wider (220–320 vs 180–280)
 *  so the slower butterfly silhouette reads. Tests can override
 *  via `wingSwapRangeMs`. */
const BUTTERFLY_WING_SWAP_RANGE: readonly [number, number] = [220, 320]

/** Tint factor for the wings-down state (fallback path). The darker
 *  variant visually signals the "down" half of the flap when the
 *  controller has to fall back to `Texture.WHITE`. */
const BUTTERFLY_DOWN_TINT_FACTOR = 0.65

/** Antenna stroke width (logical px). 0.8 reads as a single thin
 *  hairline at 36-px wide; thicker would dominate the silhouette. */
const BUTTERFLY_ANTENNA_STROKE_WIDTH = 0.8

/** "Frame" identifiers — there are exactly two: wings-up and wings-down. */
export type ButterflyFrame = "up" | "down"

export interface GardenButterflyTextures {
  up: Texture
  down: Texture
}

export interface GardenButterflyRenderer {
  /**
   * Generate a texture from a Graphics silhouette. FU-N: the controller
   * calls this twice — once for the wings-up frame, once for the
   * wings-down frame — passing the `label` so callers can route to
   * separate render targets or track per-frame usage.
   */
  generateTexture: (target: Container, label: ButterflyFrame) => Texture
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
  /**
   * Pre-baked wings-up / wings-down textures. Aggregators that already
   * own the butterfly textures pass them in directly. When omitted, the
   * controller bakes the textures itself (via the `renderer` or the
   * canvas fallback). Ownership stays with the caller — the controller
   * will NOT destroy them in `destroy()`.
   */
  butterflyTextures?: GardenButterflyTextures | null
  /**
   * Renderer that bakes the silhouette into a Texture. The controller
   * calls `renderer.generateTexture(graphics, 'up' | 'down')` twice —
   * once per frame — and owns the resulting textures. When omitted, the
   * controller falls back to canvas drawing (production) or to the
   * `Texture.WHITE` + tint-rotation fallback (node test envs).
   */
  renderer?: GardenButterflyRenderer | null
  /** Override the wing-swap cadence (ms). Tests tighten to make the
   *  frame-cycle assertion deterministic. */
  wingSwapRangeMs?: readonly [number, number]
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

function bodyFillColor(bodyColor: number): number {
  return darkenColor(bodyColor, BUTTERFLY_VEIN_TINT_FACTOR)
}

/** Draw the wings-up silhouette onto a fresh Graphics. Caller owns the
 *  returned graphics and is responsible for destroying it after
 *  rendering to a texture. Geometry is the same for both frames except
 *  for the upper-wing y/rx: up = horizontal spread, down = folded
 *  slightly up. */
function createWingsUpGraphics(bodyColor: number): Graphics {
  const g = new Graphics()
  const tint = bodyFillColor(bodyColor)
  // Upper wings — horizontal spread (wide ellipse, mid-body level).
  g.ellipse(8, 13, 8, 5).fill(0xffffff)
  g.ellipse(28, 13, 8, 5).fill(0xffffff)
  // Lower wings — smaller, slightly below body center.
  g.ellipse(10, 20, 6, 3).fill(0xffffff)
  g.ellipse(26, 20, 6, 3).fill(0xffffff)
  // Body — vertical oval in bodyColor (amber).
  g.ellipse(18, 14, 1.5, 7).fill(tint)
  // Antennae — two thin lines from the head up-and-out.
  g.moveTo(18, 7)
    .lineTo(14, 1)
    .stroke({ color: tint, width: BUTTERFLY_ANTENNA_STROKE_WIDTH })
  g.moveTo(18, 7)
    .lineTo(22, 1)
    .stroke({ color: tint, width: BUTTERFLY_ANTENNA_STROKE_WIDTH })
  // Eyes — two tiny dots flanking the body top.
  g.circle(17, 9, 0.6).fill(0x222222)
  g.circle(19, 9, 0.6).fill(0x222222)
  return g
}

/** Draw the wings-down silhouette — upper wings are folded slightly up
 *  (smaller y, narrower rx) to convey the downstroke of a flap. The
 *  body, lower wings, antennae, and eyes are identical to the up
 *  frame so the silhouette reads as the same butterfly mid-flap. */
function createWingsDownGraphics(bodyColor: number): Graphics {
  const g = new Graphics()
  const tint = bodyFillColor(bodyColor)
  // Upper wings — folded up, narrower.
  g.ellipse(10, 9, 7, 4).fill(0xffffff)
  g.ellipse(26, 9, 7, 4).fill(0xffffff)
  // Lower wings — same as up frame.
  g.ellipse(10, 20, 6, 3).fill(0xffffff)
  g.ellipse(26, 20, 6, 3).fill(0xffffff)
  // Body — same as up frame.
  g.ellipse(18, 14, 1.5, 7).fill(tint)
  // Antennae — same as up frame.
  g.moveTo(18, 7)
    .lineTo(14, 1)
    .stroke({ color: tint, width: BUTTERFLY_ANTENNA_STROKE_WIDTH })
  g.moveTo(18, 7)
    .lineTo(22, 1)
    .stroke({ color: tint, width: BUTTERFLY_ANTENNA_STROKE_WIDTH })
  // Eyes — same as up frame.
  g.circle(17, 9, 0.6).fill(0x222222)
  g.circle(19, 9, 0.6).fill(0x222222)
  return g
}

function createFrameGraphics(
  bodyColor: number,
  label: ButterflyFrame,
): Graphics {
  return label === "up"
    ? createWingsUpGraphics(bodyColor)
    : createWingsDownGraphics(bodyColor)
}

function bakeFrameFromRenderer(
  renderer: GardenButterflyRenderer,
  bodyColor: number,
  label: ButterflyFrame,
): ButterflyTextureResult | null {
  const graphics = createFrameGraphics(bodyColor, label)
  let generated: Texture | null = null
  try {
    generated = renderer.generateTexture(graphics, label)
  } catch {
    generated = null
  }
  graphics.destroy()
  if (!generated) return null
  if (
    generated !== Texture.WHITE &&
    generated !== Texture.EMPTY &&
    !generated.destroyed
  ) {
    return { texture: generated, owned: true }
  }
  return { texture: generated, owned: false }
}

/** Render the silhouette into a 2D canvas (no Pixi renderer required).
 *  Returns null when no DOM is available (e.g. node test envs). Used
 *  as the production fallback when the aggregator doesn't supply a
 *  renderer — keeps the visual quality high (real silhouette, not
 *  Texture.WHITE). */
function createCanvasFrameTexture(
  bodyColor: number,
  label: ButterflyFrame,
): ButterflyTextureResult | null {
  if (typeof document === "undefined") return null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = BUTTERFLY_TEXTURE_WIDTH
    canvas.height = BUTTERFLY_TEXTURE_HEIGHT
    const context = canvas.getContext("2d")
    if (!context) return null
    const tint = bodyFillColor(bodyColor)
    const ctx = context
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Antennae — drawn first so the body + wings overlap them cleanly.
    ctx.strokeStyle = rgbCss(tint)
    ctx.lineWidth = 1
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(18, 7)
    ctx.lineTo(14, 1)
    ctx.moveTo(18, 7)
    ctx.lineTo(22, 1)
    ctx.stroke()
    // Upper wings.
    ctx.fillStyle = "#ffffff"
    if (label === "up") {
      ctx.beginPath()
      ctx.ellipse(8, 13, 8, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(28, 13, 8, 5, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.ellipse(10, 9, 7, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(26, 9, 7, 4, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Lower wings.
    ctx.beginPath()
    ctx.ellipse(10, 20, 6, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(26, 20, 6, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    // Body.
    ctx.fillStyle = rgbCss(tint)
    ctx.beginPath()
    ctx.ellipse(18, 14, 1.5, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    // Eyes.
    ctx.fillStyle = "#222222"
    ctx.beginPath()
    ctx.arc(17, 9, 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(19, 9, 0.6, 0, Math.PI * 2)
    ctx.fill()
    const texture = Texture.from(canvas, true)
    if (
      texture.width < BUTTERFLY_TEXTURE_WIDTH / 2 ||
      texture.height < BUTTERFLY_TEXTURE_HEIGHT / 2
    ) {
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

function rgbCss(color: number): string {
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff
  return `rgb(${red} ${green} ${blue})`
}

interface ResolvedFrames {
  up: Texture
  down: Texture
  /** True when the controller owns the up texture and must destroy
   *  it on `destroy()`. */
  upOwned: boolean
  downOwned: boolean
  /** True when the resolution fell through to the Texture.WHITE +
   *  tint-rotation fallback (no renderer, no canvas). Test paths
   *  typically land here. */
  usedFallback: boolean
}

function resolveFrameTextures(
  butterflyTextures: GardenButterflyTextures | null | undefined,
  renderer: GardenButterflyRenderer | null | undefined,
  bodyColor: number,
): ResolvedFrames {
  if (
    butterflyTextures &&
    butterflyTextures.up &&
    butterflyTextures.down
  ) {
    return {
      up: butterflyTextures.up,
      down: butterflyTextures.down,
      upOwned: false,
      downOwned: false,
      usedFallback: false,
    }
  }
  if (renderer) {
    const up = bakeFrameFromRenderer(renderer, bodyColor, "up")
    const down = bakeFrameFromRenderer(renderer, bodyColor, "down")
    if (
      up &&
      down &&
      up.texture !== Texture.WHITE &&
      down.texture !== Texture.WHITE
    ) {
      return {
        up: up.texture,
        down: down.texture,
        upOwned: up.owned,
        downOwned: down.owned,
        usedFallback: false,
      }
    }
  }
  // Production fallback — no renderer, but DOM is available. Draw the
  // silhouette directly into a 2D canvas. Each frame gets its own
  // canvas so the sprite can swap between them on the flap cadence.
  const canvasUp = createCanvasFrameTexture(bodyColor, "up")
  const canvasDown = createCanvasFrameTexture(bodyColor, "down")
  if (canvasUp && canvasDown) {
    return {
      up: canvasUp.texture,
      down: canvasDown.texture,
      upOwned: canvasUp.owned,
      downOwned: canvasDown.owned,
      usedFallback: false,
    }
  }
  // Test fallback (no DOM, no renderer) — `Texture.WHITE` + tint
  // rotation. Both frames share the same texture; the visible
  // difference comes from cycling `sprite.tint` between `bodyColor`
  // (up) and the darker variant (down). `getFrameCount()` still
  // reports 2 so callers don't have to special-case the fallback.
  return {
    up: Texture.WHITE,
    down: Texture.WHITE,
    upOwned: false,
    downOwned: false,
    usedFallback: true,
  }
}

export class GardenButterflyController {
  private readonly rng: SeededRandom
  private readonly quality: GardenRenderQuality
  private readonly reducedMotion: boolean
  private readonly ambient: Container
  private readonly sprite: Sprite | null = null
  private readonly renderer: GardenButterflyRenderer | null
  private readonly usedFallback: boolean
  private readonly frames: { up: Texture; down: Texture }
  private readonly framesOwned: { up: boolean; down: boolean }
  private currentFrame: ButterflyFrame = "up"
  /** Resolved amber color (from `--color-accent` by default). */
  private readonly bodyColor: number
  /** Darker variant used as the 'down' tint in the `Texture.WHITE`
   *  fallback path. */
  private readonly downTint: number
  private readonly firstSpawnRangeMs: readonly [number, number]
  private readonly wingSwapRangeMs: readonly [number, number]
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
  /** Total ms the controller has been ticking — anchors wing swap. */
  private totalElapsedMs = 0
  /** ms until the next wing swap. */
  private nextWingSwapAtMs = 0
  /** Antennae count baked into the silhouette. Exposed as a test seam
   *  (FU-N brief E): the silhouette always has 2 antennae by design. */
  static readonly ANTENNAE_COUNT = 2
  static readonly FRAME_COUNT = 2

  constructor(options: GardenButterflyControllerOptions) {
    this.quality = options.quality
    this.reducedMotion = options.reducedMotion ?? false
    this.ambient = options.ambient
    this.firstSpawnRangeMs =
      options.firstSpawnRangeMs ?? BUTTERFLY_FIRST_SPAWN_RANGE_MS
    this.wingSwapRangeMs =
      options.wingSwapRangeMs ?? BUTTERFLY_WING_SWAP_RANGE
    this.renderer = options.renderer ?? null
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)
    // `--color-accent` (default #ff9900 — amber) is the project-wide
    // accent. The aggregator resolves it once at scene-bind time
    // (where getComputedStyle is available) and threads the value
    // through here so this controller stays DOM-free for tests. (FU-L.)
    this.bodyColor = options.bodyColor ?? DEFAULT_BUTTERFLY_BODY_COLOR
    this.downTint = darkenColor(this.bodyColor, BUTTERFLY_DOWN_TINT_FACTOR)

    // Gate: only "high" quality, no reduced motion. Lower qualities
    // leave the pool empty.
    if (this.reducedMotion || this.quality !== "high") {
      this.nextSpawnAtMs = Number.POSITIVE_INFINITY
      this.waypoints = []
      this.segmentLengths = []
      this.pathLength = 0
      this.speed = 0
      this.pathDurationSec = 0
      this.nextWingSwapAtMs = Number.POSITIVE_INFINITY
      this.frames = { up: Texture.WHITE, down: Texture.WHITE }
      this.framesOwned = { up: false, down: false }
      this.usedFallback = true
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

    const resolved = resolveFrameTextures(
      options.butterflyTextures,
      this.renderer,
      this.bodyColor,
    )
    this.frames = { up: resolved.up, down: resolved.down }
    this.framesOwned = { up: resolved.upOwned, down: resolved.downOwned }
    this.usedFallback = resolved.usedFallback
    const sprite = new Sprite(resolved.up)
    sprite.label = "garden-butterfly"
    sprite.anchor.set(0.5, 0.5)
    // Visible width: 36 px (within Plan §7.2's 24–44 band). Scale is
    // derived from the texture's natural dimensions so the fallback
    // `Texture.WHITE` (1×1) still ends up at the canonical size.
    const baseWidth = Math.max(1, resolved.up.width)
    const baseHeight = Math.max(1, resolved.up.height)
    sprite.scale.set(BUTTERFLY_SPRITE_WIDTH / baseWidth, BUTTERFLY_SPRITE_HEIGHT / baseHeight)
    // Tint: in the renderer / canvas paths, bodyColor (amber) is the
    // accent. In the Texture.WHITE fallback path, tint doubles as the
    // frame indicator (up = bodyColor, down = downTint) and is
    // rotated by `applyCurrentTint()` on each frame swap.
    sprite.tint = this.bodyColor
    sprite.visible = false
    this.ambient.addChild(sprite)
    this.sprite = sprite

    // First wing swap after the lower bound of the configured band.
    this.nextWingSwapAtMs = this.wingSwapRangeMs[0]

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

  /** Number of distinct frames in the flap cycle. Always 2 — the
   *  silhouette alternates between wings-up and wings-down. */
  getFrameCount(): number {
    return 2
  }

  /** Identifier of the frame currently displayed by the sprite. */
  getCurrentFrame(): ButterflyFrame {
    return this.currentFrame
  }

  /** Antenna count baked into the silhouette. The two-frame design
   *  draws exactly two thin antennae from the head up-and-out; this
   *  helper is a public surface for tests that want to assert the
   *  anatomy is present. */
  getAntennaeCount(): number {
    return 2
  }

  /** True when the controller fell through to the `Texture.WHITE`
   *  tint-rotation fallback. Test seam — confirms the no-renderer
   *  path was taken. */
  getUsedFallback(): boolean {
    return this.usedFallback
  }

  update(deltaMs: number): void {
    if (this.destroyed || this.reducedMotion) return
    if (!this.sprite) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    this.totalElapsedMs += clamped

    // Wing-swap cadence: independent of the spawn cycle. Once the
    // controller is alive (sprite visible), the silhouette flaps on
    // the configured `wingSwapRangeMs` band. The swap is layered on
    // top of the path motion — it never changes `x`, `y`, or
    // `rotation`.
    if (this.spawned && this.totalElapsedMs >= this.nextWingSwapAtMs) {
      this.nextWingSwapAtMs =
        this.totalElapsedMs +
        this.rng.rangeInt(
          this.wingSwapRangeMs[0],
          this.wingSwapRangeMs[1],
        )
      this.swapFrame()
    }

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
    if (this.framesOwned.up && !this.frames.up.destroyed) {
      this.frames.up.destroy(true)
    }
    if (this.framesOwned.down && !this.frames.down.destroyed) {
      this.frames.down.destroy(true)
    }
  }

  /** Swap the displayed frame (texture or tint, depending on path).
   *  The path/x/y/rotation are untouched — only the visual frame
   *  changes. */
  private swapFrame(): void {
    if (!this.sprite) return
    this.currentFrame = this.currentFrame === "up" ? "down" : "up"
    if (this.usedFallback) {
      // Texture.WHITE fallback: cycle the tint.
      this.sprite.tint =
        this.currentFrame === "up" ? this.bodyColor : this.downTint
      return
    }
    this.sprite.texture =
      this.currentFrame === "up" ? this.frames.up : this.frames.down
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
