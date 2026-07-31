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
} from "./gardenViewport"
import type { GardenPalette } from "./gardenPalette"
import type { PlotAnchor } from "./plotAnchors"

export const LAYER_LABELS = [
  "layer-sky",
  "layer-distant-hills",
  "layer-distant-bushes",
  "layer-mid-trees",
  // Grass under the fence: solid lawn strips must not paint over pickets.
  "layer-grass",
  "layer-fence",
  "layer-soil-plots",
  "layer-flower-teams",
  "layer-weather",
  "layer-powerup",
  "layer-ambient",
  "layer-presenter-hud",
  "layer-event-banner",
  "layer-foreground-frame",
] as const

export type LayerLabel = (typeof LAYER_LABELS)[number]

export interface GardenLayerSet {
  sky: Container
  distantHills: Container
  distantBushes: Container
  midTrees: Container
  grass: Container
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
  distantHills?: Texture
  distantBushes?: Texture
  midTrees?: Texture
  fence?: Texture
  grass?: Texture
  grassDetail?: Texture
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
 * Bottom-anchored band sprite. Always paints a solid colour band first so
 * there is no transparent gap to the canvas clear colour. Sprite uses
 * **uniform** width-fit scale so silhouettes keep their authored proportions.
 */
function withBottomSprite(
  layer: Container,
  childLabel: string,
  texture: Texture | undefined,
  bottomY: number,
  fallbackColor: number,
  fallbackTopRatio = 0.78,
): void {
  const bandTop = GARDEN_LOGICAL_HEIGHT * fallbackTopRatio
  const bandHeight = Math.max(1, bottomY - bandTop)

  const underlay = new Graphics()
  underlay.label = `${childLabel}-underlay`
  fillRect(underlay, 0, bandTop, GARDEN_LOGICAL_WIDTH, bandHeight, fallbackColor)
  layer.addChild(underlay)

  if (texture && texture.width > 0 && texture.height > 0) {
    const sprite = new Sprite(texture)
    sprite.label = childLabel
    sprite.anchor.set(0.5, 1.0)
    sprite.position.set(GARDEN_LOGICAL_WIDTH / 2, bottomY)
    // Uniform width-fit — never non-uniform stretch (that caused "scattered"/warped look).
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

  const sunX = GARDEN_LOGICAL_WIDTH * 0.82
  const sunY = GARDEN_LOGICAL_HEIGHT * 0.14

  if (assets?.sun && assets.sun.width > 0) {
    const sun = new Sprite(assets.sun)
    sun.label = "sun-sprite"
    sun.anchor.set(0.5, 0.5)
    sun.position.set(sunX, sunY)
    const target = 220
    const s = target / Math.max(assets.sun.width, assets.sun.height)
    sun.scale.set(s)
    layer.addChild(sun)
  } else if (!assets?.sky) {
    const g = new Graphics()
    g.label = "sun-fallback"
    g.circle(sunX, sunY, 56)
    g.fill({ color: palette.sun, alpha: 0.18 })
    g.circle(sunX, sunY, 38)
    g.fill({ color: palette.sun, alpha: 0.8 })
    g.circle(sunX, sunY, 28)
    g.fill({ color: palette.sun })
    layer.addChild(g)
  }

  const cloudTextures = [assets?.cloud01, assets?.cloud02, assets?.cloud03].filter(
    (t): t is Texture => t != null && t.width > 0,
  )
  if (cloudTextures.length > 0) {
    const placements: Array<{
      x: number
      y: number
      scale: number
      alpha: number
      tex: number
    }> = [
      { x: 280, y: 120, scale: 1.15, alpha: 0.95, tex: 0 },
      { x: 720, y: 200, scale: 0.95, alpha: 0.88, tex: 1 },
      { x: 1180, y: 140, scale: 1.05, alpha: 0.9, tex: 2 },
      { x: 1580, y: 240, scale: 0.85, alpha: 0.8, tex: 0 },
      { x: 480, y: 300, scale: 0.7, alpha: 0.7, tex: 2 },
    ]
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i]!
      const texture = cloudTextures[p.tex % cloudTextures.length]!
      const cloud = new Sprite(texture)
      cloud.label = `cloud-sprite-${i}`
      cloud.anchor.set(0.5, 0.5)
      cloud.position.set(p.x, p.y)
      cloud.alpha = p.alpha
      const baseW = 280 * p.scale
      const s = baseW / texture.width
      cloud.scale.set(s)
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
 * Distant hills — gentle, lightest greens; depth 1
 * ────────────────────────────────────────────────────────────────────── */
export function buildDistantHillsLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-distant-hills"

  // Sit just above the lawn line so the ridge reads as far horizon.
  withBottomSprite(
    layer,
    "distant-hills-sprite",
    assets?.distantHills,
    GARDEN_LOGICAL_HEIGHT * 0.7,
    palette.hillBack,
    0.48,
  )

  if (!assets?.distantHills) {
    const g = layer.children[0] as Graphics
    // Far hill (lightest)
    g.moveTo(0, GARDEN_LOGICAL_HEIGHT * 0.5)
    g.bezierCurveTo(
      GARDEN_LOGICAL_WIDTH * 0.2,
      GARDEN_LOGICAL_HEIGHT * 0.32,
      GARDEN_LOGICAL_WIDTH * 0.45,
      GARDEN_LOGICAL_HEIGHT * 0.55,
      GARDEN_LOGICAL_WIDTH * 0.7,
      GARDEN_LOGICAL_HEIGHT * 0.4,
    )
    g.lineTo(GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT * 0.5)
    g.lineTo(GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT * 0.62)
    g.lineTo(0, GARDEN_LOGICAL_HEIGHT * 0.62)
    g.closePath()
    g.fill({ color: palette.hillBack })

    // Mid-back hill (slightly darker)
    g.moveTo(0, GARDEN_LOGICAL_HEIGHT * 0.58)
    g.bezierCurveTo(
      GARDEN_LOGICAL_WIDTH * 0.25,
      GARDEN_LOGICAL_HEIGHT * 0.45,
      GARDEN_LOGICAL_WIDTH * 0.55,
      GARDEN_LOGICAL_HEIGHT * 0.62,
      GARDEN_LOGICAL_WIDTH,
      GARDEN_LOGICAL_HEIGHT * 0.52,
    )
    g.lineTo(GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT * 0.68)
    g.lineTo(0, GARDEN_LOGICAL_HEIGHT * 0.68)
    g.closePath()
    g.fill({ color: palette.hillMid })
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

  withBottomSprite(
    layer,
    "distant-bushes-sprite",
    assets?.distantBushes,
    GARDEN_LOGICAL_HEIGHT * 0.72,
    palette.bushBack,
    0.58,
  )

  if (!assets?.distantBushes) {
    const g = layer.children[0] as Graphics
    const groundY = GARDEN_LOGICAL_HEIGHT * 0.66
    for (const [x, w, h] of [
      [120, 110, 38],
      [320, 80, 30],
      [480, 130, 42],
      [780, 90, 32],
      [1050, 140, 44],
      [1320, 100, 34],
      [1550, 120, 40],
      [1820, 90, 30],
    ] as const) {
      g.ellipse(x, groundY, w, h)
      g.fill({ color: palette.bushBack, alpha: 0.85 })
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

  withBottomSprite(
    layer,
    "mid-trees-sprite",
    assets?.midTrees,
    GARDEN_LOGICAL_HEIGHT * 0.74,
    palette.midground,
    0.5,
  )

  if (!assets?.midTrees) {
    const g = layer.children[0] as Graphics
    for (const x of [180, 560, 1380, 1720]) {
      // Trunk
      g.roundRect(x - 8, GARDEN_LOGICAL_HEIGHT * 0.52, 16, 110, 4)
      g.fill({ color: palette.foreground, alpha: 0.85 })
      // Foliage cluster
      g.ellipse(x, GARDEN_LOGICAL_HEIGHT * 0.5, 56, 46)
      g.fill({ color: palette.midground })
      g.ellipse(x - 30, GARDEN_LOGICAL_HEIGHT * 0.52, 36, 30)
      g.fill({ color: palette.midground, alpha: 0.9 })
      g.ellipse(x + 28, GARDEN_LOGICAL_HEIGHT * 0.53, 36, 30)
      g.fill({ color: palette.midground, alpha: 0.9 })
    }
  }

  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Fence — white vertical picket fence along the mid horizon
 * ────────────────────────────────────────────────────────────────────── */
export function buildFenceLayer(
  palette: GardenPalette,
  assets?: LayerAssets,
): Container {
  const layer = new Container()
  layer.label = "layer-fence"

  withBottomSprite(
    layer,
    "fence-sprite",
    assets?.fence,
    GARDEN_LOGICAL_HEIGHT * 0.76,
    palette.fence,
    0.68,
  )

  if (!assets?.fence) {
    const g = layer.children[0] as Graphics
    const fenceY = GARDEN_LOGICAL_HEIGHT * 0.7
    const picketCount = 28
    const picketW = 14
    const picketH = 60
    const gap =
      (GARDEN_LOGICAL_WIDTH - picketW * picketCount) / (picketCount - 1)
    for (let i = 0; i < picketCount; i += 1) {
      const x = i * (picketW + gap)
      g.roundRect(x, fenceY, picketW, picketH, 3)
      g.fill({ color: palette.fence, alpha: 0.95 })
    }
    // Top rail
    g.rect(0, fenceY - 6, GARDEN_LOGICAL_WIDTH, 6)
    g.fill({ color: palette.fence, alpha: 0.9 })
    g.rect(0, fenceY + picketH - 4, GARDEN_LOGICAL_WIDTH, 4)
    g.fill({ color: palette.fence, alpha: 0.7 })
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

  // Lawn starts just below the fence line. Underlay must NOT start as high as
  // the horizon — that buried trees/fence under a solid green slab.
  withBottomSprite(
    layer,
    "grass-sprite",
    assets?.grass,
    GARDEN_LOGICAL_HEIGHT,
    palette.grass,
    0.72,
  )

  if (assets?.grassDetail && assets.grassDetail.width > 0) {
    for (const [x, yPct, s] of [
      [160, 0.88, 0.9],
      [480, 0.92, 1.0],
      [900, 0.86, 0.85],
      [1320, 0.9, 1.05],
      [1700, 0.94, 0.95],
    ] as const) {
      const tuft = new Sprite(assets.grassDetail)
      tuft.label = `grass-detail-${x}`
      tuft.anchor.set(0.5, 1)
      tuft.position.set(x, GARDEN_LOGICAL_HEIGHT * yPct)
      const w = 90 * s
      tuft.scale.set(w / assets.grassDetail.width)
      tuft.alpha = 0.85
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

  if (leftTexture || rightTexture) {
    if (leftTexture) {
      const left = new Sprite(leftTexture)
      left.label = "foreground-leaf-left-sprite"
      left.anchor.set(0, 1)
      left.position.set(0, GARDEN_LOGICAL_HEIGHT)
      // Uniform scale to ~380px tall frame leaves.
      left.scale.set(380 / leftTexture.height)
      layer.addChild(left)
    }
    if (rightTexture) {
      const right = new Sprite(rightTexture)
      right.label = "foreground-leaf-right-sprite"
      right.anchor.set(1, 1)
      right.position.set(GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT)
      right.scale.set(380 / rightTexture.height)
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
    midTrees,
    grass,
    fence,
    soilPlots,
    flowerTeams,
    weather,
    powerup,
    ambient,
    presenterHud,
    eventBanner,
    foregroundFrame,
  ]
  return {
    sky,
    distantHills,
    distantBushes,
    midTrees,
    grass,
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
