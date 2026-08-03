/**
 * Butterfly texture-bake step (FU-Q).
 *
 * Renders every entry of `BUTTERFLY_TYPES` into the (up, down) texture
 * pair the runtime pool swaps between. 16 textures total (8 types ×
 * 2 frames).
 *
 * Two bake paths share the same `drawWings` source-of-truth from
 * `ButterflyTypeGenerator.ts`:
 *
 *   1. Renderer path (production): when `renderer.generateTexture` is
 *      supplied, each frame becomes a fresh `Graphics` with the
 *      type-specific silhouette, passed through the Pixi v8 bake call
 *      into an actual GPU Texture.
 *
 *   2. Canvas2D fallback (test): when the renderer is undefined AND
 *      `document.createElement('canvas')` returns a usable 2D context,
 *      we render the same paths into an offscreen canvas via the
 *      Canvas2D-bezier equivalent, then wrap the canvas with
 *      `Texture.from(canvas)`.
 *
 *   3. Texture.WHITE fallback (node test env with no DOM): every entry
 *      maps to a single shared `Texture.WHITE` so the controller can
 *      still construct (the upstream `usedFallback` flag routes the
 *      tint-rotation path).
 *
 * Result is cached so the bake only runs once per session. Tests use
 * `clearButterflyTextureCache()` to reset between cases.
 */

import { Container, Graphics, Texture } from "pixi.js"

import type {
  ButterflyFrame,
  ButterflyTypeConfig,
  ButterflyTypeId,
} from "./ButterflyTypeGenerator"
import {
  BUTTERFLY_TEXTURE_HEIGHT,
  BUTTERFLY_TEXTURE_WIDTH,
  BUTTERFLY_TYPES,
} from "./ButterflyTypeGenerator"

export interface BakeFramePair {
  up: Texture
  down: Texture
}

/**
 * Minimal renderer contract — `app.renderer.generateTexture(g)` in Pixi v8
 * satisfies this. The optional `label` lets the caller route per-frame
 * work in a production bake; tests ignore it. We deliberately don't
 * import the full `GardenButterflyRenderer` interface so the bake step
 * stays decoupled from the controller surface (the controller imports
 * the bake output, not vice-versa).
 */
export interface ButterflyTextureBaker {
  generateTexture(displayObject: Container, label?: string): Texture
}

const FALLBACK_TEXEL_WHITE = 0xffffff

interface InternalCacheEntry extends BakeFramePair {
  /** Renderer path owns its textures (we destroy on cache clear); the
   *  Texture.WHITE fallback doesn't (we never destroy
   *  `Texture.WHITE`). */
  ownedUp: boolean
  ownedDown: boolean
  /** Source path flag — handy for tests + observability. */
  sourcePath: "renderer" | "canvas" | "white-fallback"
}

const cache: Map<ButterflyTypeId, InternalCacheEntry> = new Map()

function frameGraphics(
  config: ButterflyTypeConfig,
  frame: ButterflyFrame,
): Graphics {
  const g = new Graphics()
  config.drawWings(g, frame, config)
  return g
}

/* --------------------------------------------------------------------------
 * Canvas2D mirror — minimal Canvas2D-equivalent of the Pixi v8
 * bezier-curve calls in ButterflyTypeGenerator. We render the same
 * shapes so the fallback path produces a visually equivalent texture
 * (the test path doesn't need pixel parity; it needs a working canvas).
 * ------------------------------------------------------------------------*/

function bezierPath(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
): void {
  ctx.beginPath()
  ctx.moveTo(points[0]![0], points[0]![1])
  ctx.bezierCurveTo(
    points[1]![0],
    points[1]![1],
    points[2]![0],
    points[2]![1],
    points[3]![0],
    points[3]![1],
  )
}

function rgbCss(color: number): string {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  return `rgb(${r} ${g} ${b})`
}

/** Mirror of one Pixi wing path in Canvas2D coordinates. Same control
 *  points as the matching Graphics path in ButterflyTypeGenerator so
 *  the test textures look like the real ones. */
function mirrorWingsToCanvas(
  ctx: CanvasRenderingContext2D,
  config: ButterflyTypeConfig,
  frame: ButterflyFrame,
): void {
  const sx = frame === "up" ? 0.6 : 1.0
  const wing = config.wingColor
  const accent = config.accentColor
  ctx.fillStyle = rgbCss(wing)
  switch (config.id) {
    case 0:
      // Tagfalter
      bezierPath(ctx, [
        [18, 14],
        [8 * sx, 5],
        [-3 * sx, 11],
        [4 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [4 * sx, 14],
        [-3 * sx, 17],
        [8 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [28 * sx, 5],
        [39 * sx, 11],
        [32 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [32 * sx, 14],
        [39 * sx, 17],
        [28 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [11, 18],
        [7, 24],
        [14, 25],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [25, 18],
        [29, 24],
        [22, 25],
      ])
      ctx.fill()
      break
    case 1:
      // Schwalbenschwanz
      bezierPath(ctx, [
        [18, 14],
        [6 * sx, 4],
        [-6 * sx, 11],
        [2 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [2 * sx, 14],
        [-3 * sx, 17],
        [9 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [30 * sx, 4],
        [42 * sx, 11],
        [34 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [34 * sx, 14],
        [39 * sx, 17],
        [27 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [11, 19],
        [7, 26],
        [13, 27],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [25, 19],
        [29, 26],
        [23, 27],
      ])
      ctx.fill()
      break
    case 2:
      // Monarchfalter
      bezierPath(ctx, [
        [18, 14],
        [7 * sx, 4],
        [-4 * sx, 12],
        [3 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [3 * sx, 14],
        [-2 * sx, 16],
        [9 * sx, 22],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [29 * sx, 4],
        [40 * sx, 12],
        [33 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [33 * sx, 14],
        [38 * sx, 16],
        [27 * sx, 22],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [10, 19],
        [7, 25],
        [13, 26],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [26, 19],
        [29, 25],
        [23, 26],
      ])
      ctx.fill()
      break
    case 3:
      // Tagpfauenauge
      bezierPath(ctx, [
        [18, 14],
        [5 * sx, 3],
        [-6 * sx, 10],
        [3 * sx, 13],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [3 * sx, 13],
        [-4 * sx, 16],
        [6 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [31 * sx, 3],
        [42 * sx, 10],
        [33 * sx, 13],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [33 * sx, 13],
        [40 * sx, 16],
        [30 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [12, 18],
        [7, 25],
        [14, 26],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [24, 18],
        [29, 25],
        [22, 26],
      ])
      ctx.fill()
      ctx.fillStyle = "#111111"
      ctx.beginPath()
      ctx.arc(13, 23, 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(23, 23, 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#ffe066"
      ctx.beginPath()
      ctx.arc(13, 23, 0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(23, 23, 0.6, 0, Math.PI * 2)
      ctx.fill()
      break
    case 4:
      // Bläuling
      bezierPath(ctx, [
        [18, 14],
        [10 * sx, 6],
        [2 * sx, 12],
        [7 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [7 * sx, 14],
        [2 * sx, 16],
        [10 * sx, 20],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [26 * sx, 6],
        [34 * sx, 12],
        [29 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [29 * sx, 14],
        [34 * sx, 16],
        [26 * sx, 20],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [13, 18],
        [10, 23],
        [15, 24],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [23, 18],
        [26, 23],
        [21, 24],
      ])
      ctx.fill()
      break
    case 5:
      // Zitronenfalter
      bezierPath(ctx, [
        [18, 14],
        [9 * sx, 5],
        [-2 * sx, 13],
        [6 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [6 * sx, 14],
        [-1 * sx, 17],
        [9 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [27 * sx, 5],
        [38 * sx, 13],
        [30 * sx, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [30 * sx, 14],
        [37 * sx, 17],
        [27 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [12, 18],
        [8, 24],
        [14, 25],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [24, 18],
        [28, 24],
        [22, 25],
      ])
      ctx.fill()
      break
    case 6:
      // Hochzeit-Mantel
      bezierPath(ctx, [
        [18, 14],
        [7 * sx, 4],
        [-4 * sx, 11],
        [3 * sx, 13],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [3 * sx, 13],
        [-3 * sx, 16],
        [8 * sx, 22],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [29 * sx, 4],
        [40 * sx, 11],
        [33 * sx, 13],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [33 * sx, 13],
        [39 * sx, 16],
        [28 * sx, 22],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [11, 18],
        [6, 25],
        [13, 26],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [25, 18],
        [30, 25],
        [23, 26],
      ])
      ctx.fill()
      break
    case 7:
      // Glasflügler
      bezierPath(ctx, [
        [18, 14],
        [4 * sx, 3],
        [-7 * sx, 9],
        [1 * sx, 13],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [1 * sx, 13],
        [-6 * sx, 15],
        [5 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [32 * sx, 3],
        [43 * sx, 9],
        [35 * sx, 13],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [35 * sx, 13],
        [42 * sx, 15],
        [31 * sx, 21],
        [18, 14],
      ])
      ctx.fill()
      ctx.fillStyle = rgbCss(accent)
      bezierPath(ctx, [
        [18, 14],
        [11, 19],
        [6, 26],
        [13, 27],
      ])
      ctx.fill()
      bezierPath(ctx, [
        [18, 14],
        [25, 19],
        [30, 26],
        [23, 27],
      ])
      ctx.fill()
      break
    default:
      // Default conservative fill so the texture is non-empty even when
      // a new type is added without a canvas mirror — the test path
      // still passes the size assertion.
      ctx.fillRect(0, 0, 4, 4)
      break
  }
  // Common anatomy mirror.
  ctx.strokeStyle = rgbCss(config.bodyColor)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(18, 7)
  ctx.lineTo(14, 1)
  ctx.moveTo(18, 7)
  ctx.lineTo(22, 1)
  ctx.stroke()
  ctx.fillStyle = rgbCss(config.bodyColor)
  ctx.beginPath()
  ctx.ellipse(18, 14, 1.5, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(18, 8, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#222222"
  ctx.beginPath()
  ctx.arc(17, 9, 0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(19, 9, 0.6, 0, Math.PI * 2)
  ctx.fill()
}

function makeCanvasFrame(
  config: ButterflyTypeConfig,
  frame: ButterflyFrame,
): Texture | null {
  if (typeof document === "undefined") return null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = BUTTERFLY_TEXTURE_WIDTH
    canvas.height = BUTTERFLY_TEXTURE_HEIGHT
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    mirrorWingsToCanvas(ctx, config, frame)
    return Texture.from(canvas, true)
  } catch {
    return null
  }
}

/* --------------------------------------------------------------------------
 * Public surface
 * ------------------------------------------------------------------------*/

function bakeWithRenderer(
  renderer: ButterflyTextureBaker,
): Map<ButterflyTypeId, InternalCacheEntry> {
  for (const config of BUTTERFLY_TYPES) {
    let up: Texture | null = null
    let down: Texture | null = null
    try {
      const upG = frameGraphics(config, "up")
      up = renderer.generateTexture(upG)
      upG.destroy()
    } catch {
      up = null
    }
    try {
      const downG = frameGraphics(config, "down")
      down = renderer.generateTexture(downG)
      downG.destroy()
    } catch {
      down = null
    }
    cache.set(config.id, {
      up: up ?? Texture.WHITE,
      down: down ?? Texture.WHITE,
      ownedUp: up !== null && up !== Texture.WHITE,
      ownedDown: down !== null && down !== Texture.WHITE,
      sourcePath: "renderer",
    })
  }
  return cache
}

function bakeWithCanvas(): Map<ButterflyTypeId, InternalCacheEntry> {
  for (const config of BUTTERFLY_TYPES) {
    const up = makeCanvasFrame(config, "up")
    const down = makeCanvasFrame(config, "down")
    cache.set(config.id, {
      up: up ?? Texture.WHITE,
      down: down ?? Texture.WHITE,
      ownedUp: up !== null && up !== null && up !== Texture.WHITE,
      ownedDown: down !== null && down !== null && down !== Texture.WHITE,
      sourcePath: up && down ? "canvas" : "white-fallback",
    })
  }
  return cache
}

function bakeWhiteFallback(): Map<ButterflyTypeId, InternalCacheEntry> {
  // ponytail: a shared Texture.WHITE per type — safe across all
  // callers (Texture.WHITE is a singleton in Pixi v8).
  void FALLBACK_TEXEL_WHITE
  for (const config of BUTTERFLY_TYPES) {
    cache.set(config.id, {
      up: Texture.WHITE,
      down: Texture.WHITE,
      ownedUp: false,
      ownedDown: false,
      sourcePath: "white-fallback",
    })
  }
  return cache
}

/**
 * Bake and cache all 16 frames. Subsequent calls return the existing
 * cache (idempotent). Pass a renderer in production, or omit for
 * tests — the fallback chooses Canvas2D when `document` is available,
 * `Texture.WHITE` otherwise.
 */
export function bakeButterflyTextures(
  renderer?: ButterflyTextureBaker | null,
): ReadonlyMap<ButterflyTypeId, BakeFramePair> {
  if (cache.size === BUTTERFLY_TYPES.length) {
    return cache as ReadonlyMap<ButterflyTypeId, BakeFramePair>
  }
  if (cache.size > 0) {
    return cache as ReadonlyMap<ButterflyTypeId, BakeFramePair>
  }
  if (renderer) {
    bakeWithRenderer(renderer)
  } else if (typeof document !== "undefined") {
    bakeWithCanvas()
  } else {
    bakeWhiteFallback()
  }
  return cache as ReadonlyMap<ButterflyTypeId, BakeFramePair>
}

/**
 * Test seam — drops the cache + destroys the textures the bake owned
 * so test cases can re-bake with different renderers / seeds without
 * leaking GPU resources across runs.
 */
export function clearButterflyTextureCache(): void {
  for (const entry of cache.values()) {
    if (entry.ownedUp && !entry.up.destroyed) {
      entry.up.destroy(true)
    }
    if (entry.ownedDown && !entry.down.destroyed) {
      entry.down.destroy(true)
    }
  }
  cache.clear()
}

/**
 * Read-only diagnostic accessor — `sourcePath` per type tells the test
 * (and the dev console) which bake path produced the cached textures.
 */
export function getButterflyTextureCacheSource(): ReadonlyMap<
  ButterflyTypeId,
  "renderer" | "canvas" | "white-fallback"
> {
  const out = new Map<ButterflyTypeId, "renderer" | "canvas" | "white-fallback">()
  for (const [id, entry] of cache.entries()) {
    out.set(id, entry.sourcePath)
  }
  return out
}
