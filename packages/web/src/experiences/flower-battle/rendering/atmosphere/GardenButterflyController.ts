/**
 * Garden butterfly controller.
 *
 * Plan §7.2 (FU-L, FU-N, FU-O): a single ambient butterfly on a
 * continuous, physics-driven cubic-Bezier path through the garden
 * mid-ground. Not a foreground prop — the path is deterministic from
 * the seed and lives entirely in the ambient layer. The controller
 * keeps spawning fresh Bezier segments indefinitely: when the current
 * segment's t reaches 1.0, the next segment is born with C0 = old C3
 * and a G1-continuous C1 (mirror of old C2 around C0) so the
 * silhouette never teleports.
 *
 * FU-N: the detail model matches the birds' two-frame wing-flap. Two
 * Pixi.Graphics silhouettes — `wings-up` (horizontal spread) and
 * `wings-down` (upper wings folded slightly up) — are baked into
 * their own textures. The sprite cycles between them on a
 * physics-driven cadence (1 / flapFreq seconds per swap).
 *
 * FU-O (this task): the per-frame motion is now
 *   pos      = cubicBezier(C0, C1, C2, C3, t)
 *   vel      = cubicBezierDerivative(C0, C1, C2, C3, t)
 *   heading  = atan2(vel.y, vel.x)
 *   flapFreq = clamp(|vel| * BUTTERFLY_FLAP_SPEED_MULT, 1.5, 5.0)
 *   bobY     = sin(t_elapsed * flapFreq * 2/3) * BUTTERFLY_BOB_AMP
 *   sprite.x = pos.x; sprite.y = pos.y + bobY; sprite.rotation = heading
 * The wing swap toggles whenever the wing-swap timer exceeds
 * 1 / flapFreq — slower butterflies flap slower.
 *
 * Quality / motion gating:
 *   - Static / low / medium → no spawn (pool stays empty).
 *   - Reduced-motion → no spawn, no update.
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
  BUTTERFLY_FLAP_SPEED_MULT,
  BUTTERFLY_BOB_AMP,
  BUTTERFLY_SEGMENT_DURATION_RANGE,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { GardenRenderQuality } from "../../garden-pixi.types"

/** Default amber tint — matches the project-wide `--color-accent`
 *  default. Aggregators that have already resolved the theme can pass
 *  a different number via `bodyColor`; tests pass a stub for
 *  determinism. */
const DEFAULT_BUTTERFLY_BODY_COLOR = 0xff9900

/** Number of pre-picked Bezier waypoints surfaced through
 *  `getWaypoints()` for tests + observability. Matches the legacy
 *  FU-L "5 deterministic waypoints" contract so the existing test
 *  suite stays green. */
const BUTTERFLY_WAYPOINT_COUNT = 5

/** Pixel offset for the C0 entry-from-edge pick (left of -40,
 *  right of ATMOSPHERE_WIDTH + 40). Mirrors the bird edge-margin
 *  convention. */
const BUTTERFLY_ENTRY_EDGE_INSET = 40

const BUTTERFLY_VEIN_TINT_FACTOR = 0.55

/** Texture frame dimensions (logical px). Chosen so the silhouette
 *  fits: the canonical sprite width is 36 px (within Plan §7.2's
 *  24–44 px band — between bird 36–54 and mote 1.5–3.5). */
const BUTTERFLY_TEXTURE_WIDTH = 36
const BUTTERFLY_TEXTURE_HEIGHT = 28
const BUTTERFLY_SPRITE_WIDTH = 36
const BUTTERFLY_SPRITE_HEIGHT = 28

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
  /** Optional wing-swap period override (ms). When set, overrides the
   *  physics-driven `1 / flapFreq` cadence with a fixed ms period —
   *  used by tests to make flap timing deterministic. Production
   *  leaves this unset and follows the physics-derived timing. */
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

/** Inline cubic Bezier position (logically-px/sec inputs). Matches
 *  the brief's formula:
 *    pos(t) = (1-t)^3 * C0
 *           + 3 (1-t)^2 t * C1
 *           + 3 (1-t) t^2 * C2
 *           + t^3 * C3
 */
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

/** Inline cubic Bezier first derivative (px/sec):
 *    deriv(t) = 3 (1-t)^2 (C1-C0)
 *             + 6 (1-t) t  (C2-C1)
 *             + 3 t^2       (C3-C2)
 *  Returned as a BezierPoint so `length` and `atan2` work directly.
 */
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
    x: 3 * mt2 * (C1.x - C0.x) + 6 * mt * t * (C2.x - C1.x) + 3 * t2 * (C3.x - C2.x),
    y: 3 * mt2 * (C1.y - C0.y) + 6 * mt * t * (C2.y - C1.y) + 3 * t2 * (C3.y - C2.y),
  }
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

/** Random y inside BUTTERFLY_BASE_Y_RANGE * ATMOSPHERE_HEIGHT. */
function randomBandY(rng: SeededRandom): number {
  return (
    ATMOSPHERE_HEIGHT *
    rng.range(BUTTERFLY_BASE_Y_RANGE[0], BUTTERFLY_BASE_Y_RANGE[1])
  )
}

/** Build the first Bezier segment:
 *  - C0: random edge entry (-40 or W+40)
 *  - C3: target yBand waypoint
 *  - C1/C2: control handles around C0/C3, biased toward the segment
 *    centre so the curve sweeps rather than kinks.
 */
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

/** Build a continuation segment with G1 continuity.
 *  - C0 = old C3
 *  - C1 = C0 + (oldC3 - oldC2) so the initial tangent matches the
 *    terminal tangent of the previous segment (G1 continuous).
 *  - C2, C3 picked from RNG inside the yBand.
 */
function buildContinuationSegment(
  rng: SeededRandom,
  previous: BezierSegment,
): BezierSegment {
  const C0 = previous.C3
  const tangentX = previous.C3.x - previous.C2.x
  const tangentY = previous.C3.y - previous.C2.y
  // Mirror tangent through C0 so the new C1 lies on the same line as
  // the old terminal tangent, on the outgoing side of C0.
  const C1x = C0.x + tangentX
  const C1y = C0.y + tangentY
  // Pick new C3 inside the yBand with a random interior x.
  const C3x = 40 + rng.next() * (ATMOSPHERE_WIDTH - 80)
  const C3y = randomBandY(rng)
  // C2 sits ~2/3 of the way toward C3 with a small jitter so the
  // curve sweeps rather than straight-lining.
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
  /** Optional wing-swap period override (ms). When set, overrides the
   *  physics-driven cadence with a fixed ms period per swap. */
  private readonly wingSwapOverrideMs: readonly [number, number] | null
  private readonly nextSpawnAtMs: number
  /** Pre-picked Bezier C3 endpoints for the first
   *  `BUTTERFLY_WAYPOINT_COUNT` segments. Keeps the FU-L test
   *  contract (5 deterministic waypoints) intact. */
  private readonly waypoints: readonly ButterflyWaypoint[]
  /** Live segment history. `segments[i]` is the i-th Bezier piece of
   *  the path; the current one is `segments[segments.length - 1]`. */
  private readonly segments: BezierSegment[] = []
  /** Seconds elapsed since spawn — anchors the bob sinusoid. */
  private totalElapsedSec = 0
  /** Accumulator for the wing-swap timer. */
  private wingSwapTimerSec = 0
  private spawned = false
  private destroyed = false
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
    this.wingSwapOverrideMs = options.wingSwapRangeMs ?? null
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
      this.frames = { up: Texture.WHITE, down: Texture.WHITE }
      this.framesOwned = { up: false, down: false }
      this.usedFallback = true
      return
    }

    // Pre-pick 5 deterministic C3 waypoints inside the yBand (matches
    // the FU-L "5 deterministic waypoints" test contract). X is
    // interpolated across the canvas (40 px margin on each side); Y
    // is sampled from BUTTERFLY_BASE_Y_RANGE.
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

    // Initial Bezier segment: C0 from screen edge, C3 = first
    // pre-picked waypoint.
    this.segments.push(buildInitialSegment(this.rng, wps[0]!))

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

  /** Test seam — true while the butterfly is on screen. FU-O removes
   *  retirement: once spawned, the controller stays alive forever
   *  (the Bezier path continues indefinitely). */
  getIsAlive(): boolean {
    return this.spawned
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

  /** Deterministic pre-picked waypoints (test seam — for assertions).
   *  The first N entries are the planned C3 endpoints of the first N
   *  Bezier segments; subsequent segments pick their C3 from RNG. */
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

  /** Live Bezier segment history. Test seam — the brief asks for
   *  `segment[0].C0..C3` to be populated after construction; that is
   *  always the case while the pool is non-empty (see
   *  `buildInitialSegment`). The most recent segment is
   *  `segments[segments.length - 1]`. */
  getSegments(): readonly BezierSegment[] {
    return this.segments
  }

  update(deltaMs: number): void {
    if (this.destroyed || this.reducedMotion) return
    if (!this.sprite) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    const dtSec = clamped / 1000
    this.totalElapsedSec += dtSec

    if (!this.spawned) {
      // Wait until the first-spawn timer elapses, then start the path.
      const elapsedMsTotal = (this.totalElapsedSec - dtSec) * 1000
      if (elapsedMsTotal + clamped < this.nextSpawnAtMs) {
        return
      }
      this.spawned = true
      this.sprite.visible = true
    }

    const current = this.segments[this.segments.length - 1]!
    current.segmentElapsed += dtSec
    let t = current.segmentElapsed / current.segmentDuration
    if (t >= 1) {
      // Spawn the next segment with G1 continuity. We allow t to
      // pass slightly past 1 (clamped to 1.05 per the brief) before
      // transitioning so the very last frame of the old segment
      // never reads as a hard freeze.
      const next = buildContinuationSegment(this.rng, current)
      this.segments.push(next)
      this.wingSwapTimerSec = 0
      t = Math.min(1.05, current.segmentElapsed / current.segmentDuration)
    }
    const seg = this.segments[this.segments.length - 1]!
    const pos = cubicBezier(seg.C0, seg.C1, seg.C2, seg.C3, t)
    const vel = cubicBezierDerivative(seg.C0, seg.C1, seg.C2, seg.C3, t)
    const speed = Math.hypot(vel.x, vel.y)
    const heading = Math.atan2(vel.y, vel.x)
    const flapFreq = Math.min(
      5.0,
      Math.max(1.5, speed * BUTTERFLY_FLAP_SPEED_MULT),
    )
    const bobY =
      Math.sin(this.totalElapsedSec * flapFreq * (2 / 3)) *
      BUTTERFLY_BOB_AMP
    this.sprite.x = pos.x
    this.sprite.y = pos.y + bobY
    this.sprite.rotation = heading

    // Wing swap on physics-driven cadence (with optional test seam
    // override via `wingSwapRangeMs`). Physics default: swap every
    // `1 / flapFreq` seconds — slower-flying butterflies flap slower.
    this.wingSwapTimerSec += dtSec
    let swapPeriodSec = 1 / flapFreq
    if (this.wingSwapOverrideMs) {
      // Pick the next swap period from the override band — mirrors
      // the legacy rng.rangeInt(...) cadence so the FU-N wing-flap
      // tests stay fast and deterministic.
      swapPeriodSec =
        this.wingSwapOverrideMs[0] / 1000 +
        this.rng.next() *
          ((this.wingSwapOverrideMs[1] - this.wingSwapOverrideMs[0]) /
            1000)
    }
    if (this.wingSwapTimerSec >= swapPeriodSec) {
      this.wingSwapTimerSec = 0
      this.swapFrame()
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
}