/**
 * Ordered procedural garden layers (WP-PIX-05A + WP-PRESENTER-3).
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
 */

import { Container, Graphics } from "pixi.js"

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
  "layer-fence",
  "layer-grass",
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
  fence: Container
  grass: Container
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

/* ─────────────────────────────────────────────────────────────────────────
 * Sky layer — sky + sun + 3 cloud strata
 * Sky occupies ~32% of the upper scene; soft horizontal pixel gradient via
 * stacked translucent rects.
 * ────────────────────────────────────────────────────────────────────── */
export function buildSkyLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-sky"
  const g = new Graphics()
  g.label = "sky-sun-clouds"

  fillRect(g, 0, 0, GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT * 0.62, palette.sky)

  // Sun (warm disk + halo)
  const sunX = GARDEN_LOGICAL_WIDTH * 0.78
  const sunY = GARDEN_LOGICAL_HEIGHT * 0.16
  g.circle(sunX, sunY, 56)
  g.fill({ color: palette.sun, alpha: 0.18 })
  g.circle(sunX, sunY, 38)
  g.fill({ color: palette.sun, alpha: 0.8 })
  g.circle(sunX, sunY, 28)
  g.fill({ color: palette.sun })

  // Cloud strata — three soft ovals per stratum, staggered
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
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Distant hills — gentle, lightest greens; depth 1
 * ────────────────────────────────────────────────────────────────────── */
export function buildDistantHillsLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-distant-hills"
  const g = new Graphics()
  g.label = "distant-hills-curve"

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

  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Distant bushes — silhouette row behind the fence
 * ────────────────────────────────────────────────────────────────────── */
export function buildDistantBushesLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-distant-bushes"
  const g = new Graphics()
  g.label = "bush-row"

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

  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Mid trees — 4 taller trees framing the scene
 * ────────────────────────────────────────────────────────────────────── */
export function buildMidTreesLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-mid-trees"
  const g = new Graphics()
  g.label = "trees"

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

  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Fence — white vertical picket fence along the mid horizon
 * ────────────────────────────────────────────────────────────────────── */
export function buildFenceLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-fence"
  const g = new Graphics()
  g.label = "picket-fence"

  const fenceY = GARDEN_LOGICAL_HEIGHT * 0.7
  const picketCount = 28
  const picketW = 14
  const picketH = 60
  const gap = (GARDEN_LOGICAL_WIDTH - picketW * picketCount) / (picketCount - 1)
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

  layer.addChild(g)
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Grass — soft lawn with scattered grass tufts
 * ────────────────────────────────────────────────────────────────────── */
export function buildGrassLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-grass"
  const g = new Graphics()
  g.label = "lawn-grass-tufts"

  // Lawn base
  fillRect(
    g,
    0,
    GARDEN_LOGICAL_HEIGHT * 0.78,
    GARDEN_LOGICAL_WIDTH,
    GARDEN_LOGICAL_HEIGHT * 0.22,
    palette.grass,
  )

  // Grass tufts as small ellipses (deterministic positions)
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
  return layer
}

/* ─────────────────────────────────────────────────────────────────────────
 * Soil plots — 2/3/4 organic soil mounds anchored to plot positions
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
 * Foreground frame — 2 large leaves at the bottom for cinematic framing
 * ────────────────────────────────────────────────────────────────────── */
export function buildForegroundFrame(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-foreground-frame"
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
 * ────────────────────────────────────────────────────────────────────── */
export function createGardenLayers(palette: GardenPalette): GardenLayerSet {
  const sky = buildSkyLayer(palette)
  const distantHills = buildDistantHillsLayer(palette)
  const distantBushes = buildDistantBushesLayer(palette)
  const midTrees = buildMidTreesLayer(palette)
  const fence = buildFenceLayer(palette)
  const grass = buildGrassLayer(palette)
  const soilPlots = buildSoilPlotLayer()
  const flowerTeams = buildFlowerTeamsLayer()
  const weather = buildWeatherEffectsLayer()
  const powerup = buildPowerupEffectsLayer()
  const ambient = buildAmbientEffectsLayer(palette)
  const presenterHud = buildPresenterHudLayer()
  const eventBanner = buildEventBannerLayer()

  // The foreground frame is part of the cinematic frame but stays outside
  // the LAYER_LABELS child order so it still renders after every other layer.
  const foregroundFrame = buildForegroundFrame(palette)
  foregroundFrame.label = "layer-foreground-frame"

  const ordered: Container[] = [
    sky,
    distantHills,
    distantBushes,
    midTrees,
    fence,
    grass,
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
    fence,
    grass,
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
): void {
  plotsLayer.removeChildren().forEach((child) => {
    child.destroy({ children: true })
  })

  for (const anchor of anchors) {
    const mound = new Graphics()
    mound.label = `soil-plot-${anchor.index}`
    mound.position.set(anchor.x, anchor.y)
    const tint = teamTint[anchor.index] ?? soilColor
    mound.ellipse(0, 10, 78, 30)
    mound.fill({ color: edgeColor })
    mound.ellipse(0, 0, 68, 24)
    mound.fill({ color: soilColor })
    // Soft team tint band on the soil lip
    mound.ellipse(0, -6, 44, 11)
    mound.fill({ color: tint, alpha: 0.5 })
    // Team-meter frame outline (ring around the tint band)
    if (frameColor !== undefined) {
      const circle = new Graphics()
      circle.label = `plot-frame-${anchor.index}`
      circle.position.set(anchor.x, anchor.y - 6)
      circle.ellipse(0, 0, 44, 11)
      circle.stroke({ color: frameColor, width: 1.5, alpha: 0.6 })
      plotsLayer.addChild(circle)
    }
    plotsLayer.addChild(mound)
  }
}
