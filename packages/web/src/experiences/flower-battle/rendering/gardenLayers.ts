/**
 * Ordered garden layers (WP-PIX-05A + WP-PRESENTER-3 + WP-19-LAYER-REFACTOR).
 *
 * - Child order is the z-order contract tested by GardenScene tests.
 * - 13 atmosphere layers per User-P0 Art-Direction:
 *     sky → distant-hills → distant-bushes → mid-trees → fence → grass
 *     → soil-plots → flower-teams → weather → powerup → ambient
 *     → presenter-hud → event-banner
 *
 * Layer order is bumpy depth (lighter → darker → interactive foreground).
 * All colors are pulled from the resolved `GardenPalette` (no hex literals).
 * Anchors are stable across growth/phase — only `syncPlotSoil` redraws plots.
 *
 * Sprite hydration: each layer accepts an optional `LayerAssets` map. When the
 * underlying PixiJS `Texture` is provided, the builder mounts a `Sprite`
 * scaled/anchored to the logical viewport; otherwise it falls back to the
 * pre-refactor procedural `Graphics` rendering. The fallback preserves the
 *   existing test contract — `createGardenScene()` without assets keeps
 * the legacy look.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"

import {
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
  type LogicalRect,
} from "./gardenViewport"
import type { GardenPalette } from "./gardenPalette"
import type { PlotAnchor } from "./plotAnchors"

export const LAYER_LABELS = [
  "layer-sky",
  "layer-distant-hills",
  "layer-distant-bushes",
  // Lawn first, then trees (so trunks aren't buried under solid grass),
  // then fence in front of trunks, then plots/flowers.
  "layer-grass",
  "layer-mid-trees",
  "layer-fence",
  "layer-soil-plots",
  "layer-flower-teams",
  "layer-weather",
  "layer-powerup",
  "layer-ambient",
  // Foreground frame first, then HUD/banner so team meters stay readable
  // above corner bushes/leaves (not buried under foliage).
  "layer-foreground-frame",
  "layer-presenter-hud",
  "layer-event-banner",
] as const

export type LayerLabel = (typeof LAYER_LABELS)[number]

export interface GardenLayerSet {
  sky: Container
  distantHills: Container
  distantBushes: Container
  grass: Container
  midTrees: Container
  fence: Container
  soilPlots: Container
  flowerTeams: Container
  weather: Container
  powerup: Container
  ambient: Container
  presenterHud: Container
  eventBanner: Container
  /** Stable ordered list matching LAYER_LABELS. */
  ordered: Container[]
  /**
   * Backward-compatible alias for the inherited GardenScene.layers.plots
   * field (other tests reference `layers.plots` / `layers.actors`).
   */
  plots: Container
  actors: Container
}

/**
 * Sprite-hydration map for layered CC0 assets (WP-19-LAYER-REFACTOR).
 * Every entry is optional; missing entries fall back to procedural graphics.
 * Keys mirror the GARDEN_LAYER_ASSET_ALIASES map one-to-one.
 */
export interface LayerAssets {
  sky?: Texture
  sun?: Texture
  cloud01?: Texture
  cloud02?: Texture
  cloud03?: Texture
  cloud04?: Texture
  distantHills?: Texture
  distantBushes?: Texture
  /** Primary tree (compat). */
  midTrees?: Texture
  /** Individual Kenney tree variants for non-repeating mid-ground. */
  trees?: Texture[]
  fence?: Texture
  grass?: Texture
  grassDetail?: Texture
  grassDetails?: Texture[]
  soilPlots?: Texture
  foregroundLeafLeft?: Texture
  foregroundLeafRight?: Texture
  foregroundBush?: Texture
}

function fillRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
): void {
  g.rect(x, y, w, h)
  g.fill({ color, alpha })
}

/**
 * Mount a full-bleed underlay rect (always) so canvas never shows through,
 * then optionally a centred Sprite covering the logical viewport with
 * **uniform** scale (object-fit: cover) — no X/Y stretch distortion.
 */
function withFullBleedSprite(
  layer: Container,
  childLabel: string,
  texture: Texture | undefined,
  fallbackColor: number,
): void {
  // Solid underlay prevents white canvas gaps between layers.
  const underlay = new Graphics()
  underlay.label = `${childLabel}-underlay`
  fillRect(
    underlay,
    0,
    0,
    GARDEN_LOGICAL_WIDTH,
    GARDEN_LOGICAL_HEIGHT,
    fallbackColor,
  )
  layer.addChild(underlay)

  if (texture && texture.width > 0 && texture.height > 0) {
    const sprite = new Sprite(texture)
    sprite.label = childLabel
    sprite.anchor.set(0.5, 0.5)
    sprite.position.set(GARDEN_LOGICAL_WIDTH / 2, GARDEN_LOGICAL_HEIGHT / 2)
    // Cover: fill the logical frame, preserve aspect (may crop edges).
    const scale = Math.max(
      GARDEN_LOGICAL_WIDTH / texture.width,
      GARDEN_LOGICAL_HEIGHT / texture.height,
    )
    sprite.scale.set(scale)
    layer.addChild(sprite)
  }
}

/**
 * Bottom-anchored band sprite. Optionally paints a solid colour band first so
 * there is no transparent gap. Sprite uses **uniform** width-fit scale.
 * Set `paintUnderlay=false` for transparent props (fence pickets) so a cream
 * slab does not read as a white road.
 */
function withBottomSprite(
  layer: Container,
  childLabel: string,
  texture: Texture | undefined,
  bottomY: number,
  fallbackColor: number,
  fallbackTopRatio = 0.78,
  paintUnderlay = true,
): void {
  const bandTop = GARDEN_LOGICAL_HEIGHT * fallbackTopRatio
  const bandHeight = Math.max(1, bottomY - bandTop)

  if (paintUnderlay) {
    const underlay = new Graphics()
    underlay.label = `${childLabel}-underlay`
    fillRect(
      underlay,
      0,
      bandTop,
      GARDEN_LOGICAL_WIDTH,
      bandHeight,
      fallbackColor,
    )
    layer.addChild(underlay)
  }

  if (texture && texture.width > 0 && texture.height > 0) {
    const sprite = new Sprite(texture)
    sprite.label = childLabel
    sprite.anchor.set(0.5, 1.0)
    sprite.position.set(GARDEN_LOGICAL_WIDTH / 2, bottomY)
    // Uniform width-fit — never non-uniform stretch.
    const scale = GARDEN_LOGICAL_WIDTH / texture.width
    sprite.scale.set(scale)
    layer.addChild(sprite)
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sky layer — full-bleed sky + sun + soft cloud sprites (or procedural).
 * ────────────────────────────────────────────────────────────────────── */
export function buildSkyLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-sky"

  withFullBleedSprite(layer, "sky-sprite", assets?.sky, palette.sky)

  // Keep sun fully inside the top safe band (below floating presenter chips).
  // Sun lives in a repositionable holder so `layoutSkyForVisibleRect` can
  // pull it back into the visible band when a cover-crop host (4:3 crops
  // left/right, ultrawide crops top) would otherwise amputate it (§12.4).
  const sunX = GARDEN_LOGICAL_WIDTH * 0.86
  const sunY = GARDEN_LOGICAL_HEIGHT * 0.2

  const sunHolder = new Container()
  sunHolder.label = "sun-holder"
  sunHolder.position.set(sunX, sunY)

  // Always paint a warm glow (token colour) so Kenney's pale disc reads golden.
  {
    const glow = new Graphics()
    glow.label = "sun-glow"
    glow.circle(0, 0, 90)
    glow.fill({ color: palette.sun, alpha: 0.14 })
    glow.circle(0, 0, 58)
    glow.fill({ color: palette.sun, alpha: 0.28 })
    // Soft rays
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      const x0 = Math.cos(a) * 48
      const y0 = Math.sin(a) * 48
      const x1 = Math.cos(a) * 110
      const y1 = Math.sin(a) * 110
      glow.moveTo(x0, y0)
      glow.lineTo(x1, y1)
      glow.stroke({ color: palette.sun, width: 4, alpha: 0.35 })
    }
    sunHolder.addChild(glow)
  }
  if (assets?.sun && assets.sun.width > 0) {
    const sun = new Sprite(assets.sun)
    sun.label = "sun-sprite"
    sun.anchor.set(0.5, 0.5)
    sun.position.set(0, 0)
    const target = 160
    const s = target / Math.max(assets.sun.width, assets.sun.height)
    sun.scale.set(s)
    sun.tint = palette.sun
    sunHolder.addChild(sun)
  } else {
    const g = new Graphics()
    g.label = "sun-disc"
    g.circle(0, 0, 34)
    g.fill({ color: palette.sun })
    sunHolder.addChild(g)
  }
  layer.addChild(sunHolder)

  const cloudTextures = [
    assets?.cloud01,
    assets?.cloud02,
    assets?.cloud03,
    assets?.cloud04,
  ].filter((t): t is Texture => t != null && t.width > 0)
  if (cloudTextures.length > 0) {
    // Far (smaller, higher) + near (larger, lower) depth bands.
    // Clouds sit fully under the top control safe zone (y ≥ ~120 logical).
    const placements: Array<{
      x: number
      y: number
      scale: number
      alpha: number
      tex: number
      depth: "far" | "near"
    }> = [
      { x: 220, y: 140, scale: 0.85, alpha: 0.75, tex: 0, depth: "far" },
      { x: 620, y: 180, scale: 0.7, alpha: 0.7, tex: 1, depth: "far" },
      { x: 1100, y: 130, scale: 0.9, alpha: 0.72, tex: 2, depth: "far" },
      { x: 1500, y: 165, scale: 0.65, alpha: 0.68, tex: 3, depth: "far" },
      { x: 380, y: 250, scale: 1.25, alpha: 0.95, tex: 0, depth: "near" },
      { x: 900, y: 290, scale: 1.1, alpha: 0.9, tex: 1, depth: "near" },
      { x: 1400, y: 240, scale: 1.35, alpha: 0.92, tex: 2, depth: "near" },
      { x: 1700, y: 310, scale: 0.95, alpha: 0.85, tex: 3, depth: "near" },
    ]
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i]!
      const texture = cloudTextures[p.tex % cloudTextures.length]!
      const cloud = new Sprite(texture)
      cloud.label = `cloud-sprite-${p.depth}-${i}`
      cloud.anchor.set(0.5, 0.5)
      cloud.position.set(p.x, p.y)
      cloud.alpha = p.alpha
      const baseW = 300 * p.scale
      const s = baseW / texture.width
      cloud.scale.set(s)
      // Soft white/cream clouds; Kenney PNGs keep their shading.
      layer.addChild(cloud)
    }
  } else if (!assets?.sky) {
    const g = new Graphics()
    g.label = "cloud-fallback"
    const strata = [
      { y: GARDEN_LOGICAL_HEIGHT * 0.1, scale: 1.2, alpha: 0.85 },
      { y: GARDEN_LOGICAL_HEIGHT * 0.2, scale: 1.0, alpha: 0.7 },
      { y: GARDEN_LOGICAL_HEIGHT * 0.32, scale: 0.9, alpha: 0.55 },
    ]
    for (const stratum of strata) {
      for (const [cx, dx] of [
        [320, 0],
        [780, 60],
        [1280, -40],
        [1700, 80],
      ] as const) {
        g.ellipse(cx + dx, stratum.y, 90 * stratum.scale, 32 * stratum.scale)
        g.fill({ color: palette.cloud, alpha: stratum.alpha })
        g.ellipse(
          cx + dx + 50 * stratum.scale,
          stratum.y + 8,
          70 * stratum.scale,
          28 * stratum.scale,
        )
        g.fill({ color: palette.cloud, alpha: stratum.alpha * 0.85 })
      }
    }
    layer.addChild(g)
  }

  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sky safe-area relayout (WP immersive §11/§12.4).
 *
 * Cover-fit cropping can amputate sky objects on non-16:9 hosts (4:3 crops
 * left/right, ultrawide crops top). `layoutSkyForVisibleRect` pulls the sun
 * holder and every cloud sprite back inside the *visible* logical band so
 * they always render fully — never clipped by the canvas edge. Pure position
 * update: object identity, textures, and the parallax ticker are untouched
 * (the scene re-reads cloud base X after calling this).
 * ────────────────────────────────────────────────────────────────────── */

/** Radius (logical px) of the sun incl. glow rays — clamp margin. */
const SUN_SAFE_RADIUS = 130
/** Half-width/height clamp margins for cloud sprites (largest ≈ 300×1.35). */
const CLOUD_SAFE_MARGIN_X = 220
const CLOUD_SAFE_MARGIN_Y = 90

const clampValue = (v: number, min: number, max: number): number =>
  min > max ? (min + max) / 2 : Math.min(Math.max(v, min), max)

export function layoutSkyForVisibleRect(
  skyLayer: Container,
  visible: LogicalRect,
): void {
  const sunHolder = skyLayer.children.find((c) => c.label === "sun-holder")
  if (sunHolder) {
    sunHolder.position.set(
      clampValue(
        sunHolder.x,
        visible.x + SUN_SAFE_RADIUS,
        visible.x + visible.width - SUN_SAFE_RADIUS,
      ),
      clampValue(
        sunHolder.y,
        visible.y + SUN_SAFE_RADIUS,
        visible.y + visible.height * 0.5,
      ),
    )
  }
  for (const child of skyLayer.children) {
    if (typeof child.label !== "string") continue
    if (!child.label.startsWith("cloud-sprite-")) continue
    child.position.set(
      clampValue(
        child.x,
        visible.x + CLOUD_SAFE_MARGIN_X,
        visible.x + visible.width - CLOUD_SAFE_MARGIN_X,
      ),
      clampValue(
        child.y,
        visible.y + CLOUD_SAFE_MARGIN_Y,
        visible.y + visible.height * 0.55,
      ),
    )
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Distant hills — gentle, lightest greens; depth 1
 * ────────────────────────────────────────────────────────────────────── */
export function buildDistantHillsLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-distant-hills"

  // Always draw two-tone ridge silhouettes for readable depth (sprite is optional
  // texture overlay). Hills must contrast against both sky and lawn — raise the
  // horizon so the mid-band is not a flat empty plate.
  const ridge = new Graphics()
  ridge.label = "distant-hills-ridges"
  const H = GARDEN_LOGICAL_HEIGHT
  const W = GARDEN_LOGICAL_WIDTH
  // Far ridge (lighter / higher) — soft horizon, not a hard line
  ridge.moveTo(0, H * 0.42)
  ridge.bezierCurveTo(W * 0.12, H * 0.28, W * 0.32, H * 0.46, W * 0.5, H * 0.3)
  ridge.bezierCurveTo(W * 0.68, H * 0.18, W * 0.86, H * 0.36, W, H * 0.32)
  ridge.lineTo(W, H * 0.72)
  ridge.lineTo(0, H * 0.72)
  ridge.closePath()
  ridge.fill({ color: palette.hillBack, alpha: 0.96 })
  // Near ridge (darker / lower) — fills more of the mid plate
  ridge.moveTo(0, H * 0.5)
  ridge.bezierCurveTo(W * 0.18, H * 0.38, W * 0.4, H * 0.54, W * 0.62, H * 0.4)
  ridge.bezierCurveTo(W * 0.8, H * 0.32, W * 0.92, H * 0.48, W, H * 0.46)
  ridge.lineTo(W, H * 0.74)
  ridge.lineTo(0, H * 0.74)
  ridge.closePath()
  ridge.fill({ color: palette.hillMid, alpha: 0.94 })
  layer.addChild(ridge)

  if (assets?.distantHills && assets.distantHills.width > 0) {
    // Dual-stamp hills so texture covers the full mid horizon, not one thin strip.
    for (const [label, yFrac, alpha, scaleMul] of [
      ["distant-hills-sprite-far", 0.68, 0.55, 1.05],
      ["distant-hills-sprite", 0.74, 0.78, 1.0],
    ] as const) {
      const sprite = new Sprite(assets.distantHills)
      sprite.label = label
      sprite.anchor.set(0.5, 1)
      sprite.position.set(W / 2, H * yFrac)
      const scale = (W / assets.distantHills.width) * scaleMul
      sprite.scale.set(scale)
      sprite.alpha = alpha
      sprite.tint = palette.hillMid
      layer.addChild(sprite)
    }
  }

  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Distant bushes — silhouette row behind the fence
 * ────────────────────────────────────────────────────────────────────── */
export function buildDistantBushesLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-distant-bushes"

  // Dual full-width bush bands (far + near) so the horizon never collapses
  // into a flat meadow plate between hills and fence.
  if (assets?.distantBushes && assets.distantBushes.width > 0) {
    const underlay = new Graphics()
    underlay.label = "distant-bushes-sprite-underlay"
    fillRect(
      underlay,
      0,
      GARDEN_LOGICAL_HEIGHT * 0.48,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT * 0.22,
      palette.bushBack,
    )
    layer.addChild(underlay)

    for (const [label, bottomY, alpha, scaleMul] of [
      ["distant-bushes-sprite-far", 0.62, 0.7, 1.0],
      ["distant-bushes-sprite", 0.7, 0.95, 1.05],
    ] as const) {
      const spr = new Sprite(assets.distantBushes)
      spr.label = label
      spr.anchor.set(0.5, 1)
      spr.position.set(GARDEN_LOGICAL_WIDTH / 2, GARDEN_LOGICAL_HEIGHT * bottomY)
      const scale = (GARDEN_LOGICAL_WIDTH / assets.distantBushes.width) * scaleMul
      spr.scale.set(scale)
      spr.alpha = alpha
      spr.tint = palette.bushMid
      layer.addChild(spr)
    }
  } else {
    withBottomSprite(
      layer,
      "distant-bushes-sprite",
      undefined,
      GARDEN_LOGICAL_HEIGHT * 0.68,
      palette.bushBack,
      0.48,
    )
    const g = layer.children[0] as Graphics
    const groundY = GARDEN_LOGICAL_HEIGHT * 0.58
    for (const [x, w, h] of [
      [80, 100, 40],
      [200, 120, 46],
      [360, 90, 34],
      [500, 140, 50],
      [680, 100, 38],
      [860, 120, 44],
      [1050, 140, 50],
      [1220, 90, 36],
      [1400, 130, 48],
      [1580, 100, 40],
      [1740, 110, 42],
      [1880, 80, 32],
    ] as const) {
      g.ellipse(x, groundY, w, h)
      g.fill({ color: palette.bushBack, alpha: 0.9 })
    }
  }

  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Mid trees — 4 taller trees framing the scene
 * ────────────────────────────────────────────────────────────────────── */
export function buildMidTreesLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-mid-trees"

  const trees =
    assets?.trees?.filter((t) => t && t.width > 0) ??
    (assets?.midTrees ? [assets.midTrees] : [])

  // Interleave deciduous (round) and conifer (triangle) variants so the
  // mid-ground never reads as a repeating row of identical shapes.
  // Manifest order is deciduous ×6 then conifer ×6 — zip them together.
  const deciduous = trees.slice(0, Math.ceil(trees.length / 2))
  const conifer = trees.slice(Math.ceil(trees.length / 2))
  const mixed: Texture[] = []
  for (let i = 0; i < deciduous.length || i < conifer.length; i += 1) {
    if (i < deciduous.length) mixed.push(deciduous[i]!)
    if (i < conifer.length) mixed.push(conifer[i]!)
  }
  const orderedTrees = mixed.length > 0 ? mixed : trees

  if (orderedTrees.length > 0) {
    // Dense, varied grove — never a single copy-paste row or sparse silhouette.
    // Far/smaller trees first (depth), then mid, then larger near-fence trees.
    // Feet sit just behind the fence line; crowns rise into the sky band.
    const placements: Array<{
      x: number
      y: number
      height: number
      flip: boolean
      alpha: number
      tint: number
      tree: number
    }> = [
      // Far band — soft midground/bush tints for depth (no pure-white wash).
      { x: 70, y: 0.7, height: 220, flip: false, alpha: 0.78, tint: palette.bushBack, tree: 2 },
      { x: 240, y: 0.69, height: 260, flip: true, alpha: 0.82, tint: palette.midground, tree: 4 },
      { x: 450, y: 0.71, height: 200, flip: false, alpha: 0.75, tint: palette.bushBack, tree: 1 },
      { x: 700, y: 0.68, height: 280, flip: true, alpha: 0.8, tint: palette.midground, tree: 3 },
      { x: 920, y: 0.7, height: 240, flip: false, alpha: 0.78, tint: palette.bushMid, tree: 5 },
      { x: 1150, y: 0.69, height: 250, flip: true, alpha: 0.8, tint: palette.midground, tree: 0 },
      { x: 1380, y: 0.71, height: 210, flip: false, alpha: 0.76, tint: palette.bushBack, tree: 2 },
      { x: 1620, y: 0.7, height: 230, flip: true, alpha: 0.78, tint: palette.midground, tree: 4 },
      { x: 1850, y: 0.69, height: 200, flip: false, alpha: 0.74, tint: palette.bushBack, tree: 1 },
      // Near-fence band — fuller foliage tints, keep crowns distinct
      { x: 140, y: 0.74, height: 380, flip: false, alpha: 0.95, tint: palette.foreground, tree: 0 },
      { x: 320, y: 0.73, height: 440, flip: true, alpha: 0.98, tint: palette.midground, tree: 1 },
      { x: 500, y: 0.75, height: 340, flip: false, alpha: 0.93, tint: palette.foreground, tree: 2 },
      { x: 680, y: 0.74, height: 300, flip: true, alpha: 0.9, tint: palette.bushMid, tree: 5 },
      { x: 860, y: 0.73, height: 400, flip: false, alpha: 0.96, tint: palette.midground, tree: 3 },
      { x: 1060, y: 0.75, height: 320, flip: true, alpha: 0.92, tint: palette.foreground, tree: 4 },
      { x: 1240, y: 0.74, height: 360, flip: false, alpha: 0.94, tint: palette.midground, tree: 0 },
      { x: 1440, y: 0.73, height: 420, flip: true, alpha: 0.97, tint: palette.foreground, tree: 1 },
      { x: 1620, y: 0.75, height: 340, flip: false, alpha: 0.91, tint: palette.bushMid, tree: 2 },
      { x: 1780, y: 0.74, height: 380, flip: true, alpha: 0.94, tint: palette.midground, tree: 5 },
    ]
    const treesArr = orderedTrees
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i]!
      const tex = treesArr[p.tree % treesArr.length]!
      const spr = new Sprite(tex)
      spr.label = `mid-tree-${i}`
      spr.anchor.set(0.5, 1)
      spr.position.set(p.x, GARDEN_LOGICAL_HEIGHT * p.y)
      const s = p.height / tex.height
      spr.scale.set(p.flip ? -s : s, s)
      spr.alpha = p.alpha
      spr.tint = p.tint
      layer.addChild(spr)
    }
    return layer
  }

  // Procedural fallback row — denser silhouette when no textures
  const g = new Graphics()
  g.label = "mid-trees-fallback"
  for (const x of [120, 300, 480, 700, 920, 1140, 1360, 1580, 1760]) {
    g.roundRect(x - 8, GARDEN_LOGICAL_HEIGHT * 0.52, 16, 110, 4)
    g.fill({ color: palette.foreground, alpha: 0.85 })
    g.ellipse(x, GARDEN_LOGICAL_HEIGHT * 0.5, 56, 46)
    g.fill({ color: palette.midground })
    g.ellipse(x - 30, GARDEN_LOGICAL_HEIGHT * 0.52, 36, 30)
    g.fill({ color: palette.midground, alpha: 0.9 })
    g.ellipse(x + 28, GARDEN_LOGICAL_HEIGHT * 0.53, 36, 30)
    g.fill({ color: palette.midground, alpha: 0.9 })
  }
  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Fence — white vertical picket fence along the mid horizon
 * Target height ≈ 8–10 % of scene so it never reads as a solid white slab.
 * It is a background separator: pickets must stay below the flower heads
 * (tallest stage tops out ~0.72 H) so it never obscures team flowers.
 * ────────────────────────────────────────────────────────────────────── */
/** Max fence band height as a fraction of logical scene height. */
export const FENCE_MAX_HEIGHT_RATIO = 0.095

export function buildFenceLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-fence"

  // Sit fence just behind plant feet (PLOT_GROUND_Y_RATIO = 0.80).
  const fenceBottomY = GARDEN_LOGICAL_HEIGHT * 0.76
  const maxFenceH = GARDEN_LOGICAL_HEIGHT * FENCE_MAX_HEIGHT_RATIO

  // No cream underlay — pickets only, grass shows through gaps.
  if (assets?.fence && assets.fence.width > 0 && assets.fence.height > 0) {
    const sprite = new Sprite(assets.fence)
    sprite.label = "fence-sprite"
    sprite.anchor.set(0.5, 1.0)
    sprite.position.set(GARDEN_LOGICAL_WIDTH / 2, fenceBottomY)
    // Width-fit first, then clamp height so oversized assets never dominate.
    let scale = GARDEN_LOGICAL_WIDTH / assets.fence.width
    if (assets.fence.height * scale > maxFenceH) {
      scale = maxFenceH / assets.fence.height
    }
    sprite.scale.set(scale)
    layer.addChild(sprite)
  } else {
    const g = new Graphics()
    g.label = "fence-fallback"
    const picketH = Math.min(70, maxFenceH * 0.85)
    const fenceY = fenceBottomY - picketH
    const picketCount = 28
    const picketW = 14
    const gap =
      (GARDEN_LOGICAL_WIDTH - picketW * picketCount) / (picketCount - 1)
    for (let i = 0; i < picketCount; i += 1) {
      const x = i * (picketW + gap)
      g.roundRect(x, fenceY, picketW, picketH, 3)
      g.fill({ color: palette.fence, alpha: 0.95 })
    }
    g.rect(0, fenceY - 6, GARDEN_LOGICAL_WIDTH, 6)
    g.fill({ color: palette.fence, alpha: 0.9 })
    g.rect(0, fenceY + picketH - 4, GARDEN_LOGICAL_WIDTH, 4)
    g.fill({ color: palette.fence, alpha: 0.7 })
    layer.addChild(g)
  }

  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Grass — soft lawn with scattered grass tufts
 * ────────────────────────────────────────────────────────────────────── */
export function buildGrassLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-grass"

  // Lawn full-bleed to bottom edge; start below hill ridges so depth stays
  // readable. Fence/plants sit on top later in z-order.
  withBottomSprite(
    layer,
    "grass-sprite",
    assets?.grass,
    GARDEN_LOGICAL_HEIGHT,
    palette.grass,
    0.62,
  )

  const tuftTextures = (
    assets?.grassDetails?.length
      ? assets.grassDetails
      : assets?.grassDetail
        ? [assets.grassDetail]
        : []
  ).filter((t): t is Texture => t != null && t.width > 0)
  if (tuftTextures.length > 0) {
    // Dense lawn detail — mid band + near camera + between plots so the
    // meadow never reads as a flat green plate under the plants.
    const spots = [
      // Mid lawn (behind fence feet / between tree trunks)
      [60, 0.78, 0.85, 0],
      [180, 0.8, 0.95, 1],
      [300, 0.79, 0.9, 2],
      [420, 0.81, 1.0, 0],
      [540, 0.78, 0.88, 1],
      [660, 0.8, 0.92, 2],
      [780, 0.79, 0.86, 0],
      [900, 0.81, 0.98, 1],
      [1020, 0.78, 0.9, 2],
      [1140, 0.8, 0.94, 0],
      [1260, 0.79, 0.88, 1],
      [1380, 0.81, 0.96, 2],
      [1500, 0.78, 0.9, 0],
      [1620, 0.8, 0.92, 1],
      [1740, 0.79, 0.86, 2],
      [1860, 0.8, 0.94, 0],
      // Plot band
      [80, 0.84, 1.1, 0],
      [200, 0.88, 1.2, 1],
      [320, 0.86, 0.95, 2],
      [440, 0.91, 1.15, 0],
      [560, 0.87, 1.3, 1],
      [680, 0.9, 1.0, 2],
      [800, 0.85, 1.2, 0],
      [920, 0.93, 0.95, 1],
      [1040, 0.88, 1.25, 2],
      [1160, 0.91, 1.05, 0],
      [1280, 0.86, 1.15, 1],
      [1400, 0.92, 1.0, 2],
      [1520, 0.89, 1.2, 0],
      [1640, 0.94, 1.1, 1],
      [1760, 0.87, 1.05, 2],
      [1860, 0.91, 0.95, 0],
      // Near-camera band
      [100, 0.96, 1.25, 1],
      [240, 0.97, 1.15, 2],
      [380, 0.96, 1.2, 0],
      [520, 0.98, 1.35, 1],
      [660, 0.95, 1.1, 2],
      [800, 0.97, 1.3, 0],
      [940, 0.96, 1.2, 1],
      [1080, 0.98, 1.4, 2],
      [1220, 0.95, 1.15, 0],
      [1360, 0.97, 1.25, 1],
      [1500, 0.96, 1.2, 2],
      [1640, 0.98, 1.3, 0],
      [1780, 0.95, 1.15, 1],
      [1900, 0.97, 1.1, 2],
    ] as const
    for (const [x, yPct, sc, ti] of spots) {
      const tex = tuftTextures[ti % tuftTextures.length]!
      const tuft = new Sprite(tex)
      tuft.label = `grass-detail-${x}-${yPct}`
      tuft.anchor.set(0.5, 1)
      tuft.position.set(x, GARDEN_LOGICAL_HEIGHT * yPct)
      const h = 52 * sc
      tuft.scale.set(h / tex.height)
      tuft.alpha = 0.88
      tuft.tint = palette.foreground
      layer.addChild(tuft)
    }
  } else if (!assets?.grass) {
    const g = new Graphics()
    g.label = "grass-tufts-fallback"
    const tufts = [
      [80, 0.82], [220, 0.85], [380, 0.83], [560, 0.86], [740, 0.84],
      [920, 0.87], [1100, 0.83], [1280, 0.85], [1460, 0.82], [1640, 0.86],
      [1820, 0.84], [120, 0.92], [420, 0.94], [820, 0.93], [1220, 0.92],
      [1620, 0.95], [60, 0.97], [340, 0.96], [1020, 0.97], [1700, 0.96],
      [250, 0.89], [700, 0.9], [1350, 0.88], [1550, 0.93],
    ] as const
    for (const [x, yPct] of tufts) {
      g.ellipse(x, GARDEN_LOGICAL_HEIGHT * yPct, 18, 6)
      g.fill({ color: palette.foreground, alpha: 0.65 })
    }
    layer.addChild(g)
  }

  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Soil plots — empty anchor container; per-plot mounds are managed by
 * `syncPlotSoil` (procedural). A `soilPlots` Texture would be a full-bleed
 * soil bed (currently we keep the procedural per-plot mounds).
 * ────────────────────────────────────────────────────────────────────── */
export function buildSoilPlotLayer(): Container {
  const layer = new Container()
  layer.label = "layer-soil-plots"
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Flower teams — plant containers (anchors driven by scene, not by this fn)
 * ────────────────────────────────────────────────────────────────────── */
export function buildFlowerTeamsLayer(): Container {
  const layer = new Container()
  layer.label = "layer-flower-teams"
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Weather effects — sun glints + drifting leaves (mostly empty stub layer;
 * hosted effects append children here via the public weather container).
 * ────────────────────────────────────────────────────────────────────── */
export function buildWeatherEffectsLayer(): Container {
  const layer = new Container()
  layer.label = "layer-weather"
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Powerup effects — overlay container for collectible activation effects
 * (managed by FlowerPowerupEffects in host code; this layer is the anchor).
 * ────────────────────────────────────────────────────────────────────── */
export function buildPowerupEffectsLayer(): Container {
  const layer = new Container()
  layer.label = "layer-powerup"
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Ambient effects — slow drifting particles (pollen, dust)
 * ────────────────────────────────────────────────────────────────────── */
export function buildAmbientEffectsLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-ambient"
  const g = new Graphics()
  g.label = "ambient-particles"

  // Soft ambient dust motes (deterministic positions; presumed animated by host)
  const motes = [
    [200, 0.45], [560, 0.5], [880, 0.42], [1280, 0.48], [1620, 0.52],
    [340, 0.65], [780, 0.62], [1180, 0.66], [1480, 0.6],
  ] as const
  for (const [x, yPct] of motes) {
    g.circle(x, GARDEN_LOGICAL_HEIGHT * yPct, 3)
    g.fill({ color: palette.cloud, alpha: 0.55 })
  }

  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Presenter HUD — top score strip + countdown tracker (hook for DOM HUD)
 * Layer is intentionally empty; the DOM `FlowerBattlePresenterHud` overlays
 * the canvas with the same vertical band.
 * ────────────────────────────────────────────────────────────────────── */
export function buildPresenterHudLayer(): Container {
  const layer = new Container()
  layer.label = "layer-presenter-hud"
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Event banner — temporary comic speech-bubble anchors for power-up events
 * Children are appended by the host when a powerup fires (e.g. "x2!").
 * ────────────────────────────────────────────────────────────────────── */
export function buildEventBannerLayer(): Container {
  const layer = new Container()
  layer.label = "layer-event-banner"
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Foreground frame — 2 large leaves at the bottom for cinematic framing.
 * Sprite path mounts the leaf SVGs at the bottom corners with anchor (1, 1)
 * and (0, 1) so they tile into the canvas edges.
 * ────────────────────────────────────────────────────────────────────── */
export function buildForegroundFrame(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-foreground-frame"

  const leftTexture = assets?.foregroundLeafLeft
  const rightTexture = assets?.foregroundLeafRight
  const bushTexture = assets?.foregroundBush

  if (leftTexture || rightTexture || bushTexture) {
    // Soft bushes along the bottom edge for cinematic depth (behind leaves).
    if (bushTexture && bushTexture.width > 0) {
      const bushPlacements: Array<{
        x: number
        scale: number
        flip: boolean
        alpha: number
      }> = [
        { x: 220, scale: 0.55, flip: false, alpha: 0.85 },
        { x: 520, scale: 0.45, flip: true, alpha: 0.75 },
        { x: 1400, scale: 0.5, flip: false, alpha: 0.8 },
        { x: 1700, scale: 0.55, flip: true, alpha: 0.85 },
      ]
      for (let i = 0; i < bushPlacements.length; i += 1) {
        const p = bushPlacements[i]!
        const bush = new Sprite(bushTexture)
        bush.label = `foreground-bush-${i}`
        bush.anchor.set(0.5, 1)
        bush.position.set(p.x, GARDEN_LOGICAL_HEIGHT)
        const s = (220 * p.scale) / bushTexture.height
        bush.scale.set(p.flip ? -s : s, s)
        bush.alpha = p.alpha
        bush.tint = palette.foreground
        layer.addChild(bush)
      }
    }
    if (leftTexture) {
      const left = new Sprite(leftTexture)
      left.label = "foreground-leaf-left-sprite"
      left.anchor.set(0, 1)
      left.position.set(0, GARDEN_LOGICAL_HEIGHT)
      // Uniform scale to ~420px tall frame leaves (stronger vignette).
      left.scale.set(420 / leftTexture.height)
      layer.addChild(left)
    }
    if (rightTexture) {
      const right = new Sprite(rightTexture)
      right.label = "foreground-leaf-right-sprite"
      right.anchor.set(1, 1)
      right.position.set(GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT)
      right.scale.set(420 / rightTexture.height)
      layer.addChild(right)
    }
    return layer
  }

  // Procedural fallback
  const g = new Graphics()
  g.label = "foreground-leaves"

  // Left foreground leaf cluster
  g.ellipse(80, GARDEN_LOGICAL_HEIGHT - 40, 90, 36)
  g.fill({ color: palette.hillMid, alpha: 0.65 })
  g.ellipse(140, GARDEN_LOGICAL_HEIGHT - 60, 70, 28)
  g.fill({ color: palette.foreground, alpha: 0.7 })

  // Right foreground leaf cluster
  g.ellipse(GARDEN_LOGICAL_WIDTH - 90, GARDEN_LOGICAL_HEIGHT - 36, 100, 38)
  g.fill({ color: palette.hillMid, alpha: 0.65 })
  g.ellipse(GARDEN_LOGICAL_WIDTH - 160, GARDEN_LOGICAL_HEIGHT - 56, 70, 28)
  g.fill({ color: palette.foreground, alpha: 0.7 })

  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Public layer set factory — returns the 13-layer ordered container set.
 * Backward-compatible aliases (`plots`, `actors`) preserve the
 * inherited GardenScene.layers.plots / layers.actors test contract.
 *
 * `assets` is optional; when provided, the relevant layers swap their
 * procedural Graphics for a Sprite. Layers without an asset entry keep
 * the procedural fallback so existing tests remain stable.
 * ────────────────────────────────────────────────────────────────────── */
export function createGardenLayers(
  palette: GardenPalette,
  assets?: LayerAssets,
): GardenLayerSet {
  const sky = buildSkyLayer(palette, assets)
  const distantHills = buildDistantHillsLayer(palette, assets)
  const distantBushes = buildDistantBushesLayer(palette, assets)
  const midTrees = buildMidTreesLayer(palette, assets)
  const grass = buildGrassLayer(palette, assets)
  const fence = buildFenceLayer(palette, assets)
  const soilPlots = buildSoilPlotLayer()
  const flowerTeams = buildFlowerTeamsLayer()
  const weather = buildWeatherEffectsLayer()
  const powerup = buildPowerupEffectsLayer()
  const ambient = buildAmbientEffectsLayer(palette)
  const presenterHud = buildPresenterHudLayer()
  const eventBanner = buildEventBannerLayer()

  const foregroundFrame = buildForegroundFrame(palette, assets)
  foregroundFrame.label = "layer-foreground-frame"

  const ordered: Container[] = [
    sky,
    distantHills,
    distantBushes,
    grass,
    midTrees,
    fence,
    soilPlots,
    flowerTeams,
    weather,
    powerup,
    ambient,
    foregroundFrame,
    // HUD + banner above foliage so plot meters/names are never occluded.
    presenterHud,
    eventBanner,
  ]
  return {
    sky,
    distantHills,
    distantBushes,
    grass,
    midTrees,
    fence,
    soilPlots,
    flowerTeams,
    weather,
    powerup,
    ambient,
    presenterHud,
    eventBanner,
    ordered,
    // Backward-compatible aliases
    plots: soilPlots,
    actors: flowerTeams,
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Plot soil sync — draws soft circular mounds at fixed anchors.
 * Called whenever the team count changes (not on growth/phase updates).
 * ────────────────────────────────────────────────────────────────────── */
export function syncPlotSoil(
  plotsLayer: Container,
  anchors: readonly PlotAnchor[],
  soilColor: number,
  edgeColor: number,
  teamTint: readonly number[],
  frameColor?: number,
  soilTexture?: Texture,
): void {
  plotsLayer.removeChildren().forEach((child) => {
    child.destroy({ children: true })
  })

  for (const anchor of anchors) {
    const tint = teamTint[anchor.index] ?? soilColor
    const holder = new Container()
    holder.label = `soil-plot-${anchor.index}`
    holder.position.set(anchor.x, anchor.y)

    if (soilTexture && soilTexture.width > 0) {
      const sprite = new Sprite(soilTexture)
      sprite.label = `soil-sprite-${anchor.index}`
      sprite.anchor.set(0.5, 0.85)
      const targetW = 200
      sprite.scale.set(targetW / soilTexture.width)
      holder.addChild(sprite)
      // Soft team-tint lip above the mound
      const lip = new Graphics()
      lip.label = `soil-tint-${anchor.index}`
      lip.ellipse(0, -8, 48, 12)
      lip.fill({ color: tint, alpha: 0.45 })
      holder.addChild(lip)
    } else {
      const mound = new Graphics()
      mound.label = `soil-graphics-${anchor.index}`
      mound.ellipse(0, 10, 78, 30)
      mound.fill({ color: edgeColor })
      mound.ellipse(0, 0, 68, 24)
      mound.fill({ color: soilColor })
      mound.ellipse(0, -6, 44, 11)
      mound.fill({ color: tint, alpha: 0.5 })
      holder.addChild(mound)
    }

    if (frameColor !== undefined) {
      const circle = new Graphics()
      circle.label = `plot-frame-${anchor.index}`
      circle.ellipse(0, -6, 48, 12)
      circle.stroke({ color: frameColor, width: 1.5, alpha: 0.55 })
      holder.addChild(circle)
    }
    plotsLayer.addChild(holder)
  }
}
