/**
 * Ordered procedural garden layers (WP-PIX-05A).
 * Child order is the z-order contract tested by GardenScene tests.
 */

import { Container, Graphics } from "pixi.js"

import {
  GARDEN_LOGICAL_HEIGHT,
  GARDEN_LOGICAL_WIDTH,
} from "./gardenViewport"
import type { GardenPalette } from "./gardenPalette"
import type { PlotAnchor } from "./plotAnchors"

export const LAYER_LABELS = [
  "layer-background",
  "layer-midground",
  "layer-plots",
  "layer-actors",
  "layer-foreground",
] as const

export type LayerLabel = (typeof LAYER_LABELS)[number]

export interface GardenLayerSet {
  background: Container
  midground: Container
  plots: Container
  actors: Container
  foreground: Container
  /** Stable ordered list matching LAYER_LABELS. */
  ordered: Container[]
}

function fillRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  g.rect(x, y, w, h)
  g.fill({ color })
}

/**
 * Sky + distant hills + simple cloud blobs (logical space).
 */
export function buildBackgroundLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-background"
  const g = new Graphics()
  g.label = "sky-hills-clouds"

  fillRect(g, 0, 0, GARDEN_LOGICAL_WIDTH, GARDEN_LOGICAL_HEIGHT * 0.62, palette.sky)

  // Far hills
  g.moveTo(0, GARDEN_LOGICAL_HEIGHT * 0.48)
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
  g.fill({ color: palette.hillsFar })

  // Near hills
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
  g.fill({ color: palette.hillsNear })

  // Clouds (three soft ovals)
  const cloudY = GARDEN_LOGICAL_HEIGHT * 0.18
  for (const [cx, scale] of [
    [320, 1.1],
    [900, 0.9],
    [1500, 1.2],
  ] as const) {
    g.ellipse(cx, cloudY, 90 * scale, 36 * scale)
    g.fill({ color: palette.clouds, alpha: 0.85 })
    g.ellipse(cx + 50 * scale, cloudY + 8, 70 * scale, 30 * scale)
    g.fill({ color: palette.clouds, alpha: 0.75 })
  }

  layer.addChild(g)
  return layer
}

export function buildMidgroundLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-midground"
  const g = new Graphics()
  g.label = "trees-fence"

  // Decorative tree silhouettes
  for (const x of [180, 520, 1400, 1720]) {
    g.roundRect(x - 8, GARDEN_LOGICAL_HEIGHT * 0.52, 16, 90, 4)
    g.fill({ color: palette.midground })
    g.ellipse(x, GARDEN_LOGICAL_HEIGHT * 0.5, 48, 40)
    g.fill({ color: palette.midground })
  }

  // Simple fence line
  g.rect(0, GARDEN_LOGICAL_HEIGHT * 0.7, GARDEN_LOGICAL_WIDTH, 6)
  g.fill({ color: palette.soilEdge })

  layer.addChild(g)
  return layer
}

export function buildPlotsLayer(): Container {
  const layer = new Container()
  layer.label = "layer-plots"
  return layer
}

export function buildActorsLayer(): Container {
  const layer = new Container()
  layer.label = "layer-actors"
  return layer
}

export function buildForegroundLayer(palette: GardenPalette): Container {
  const layer = new Container()
  layer.label = "layer-foreground"
  const g = new Graphics()
  g.label = "leaves-vignette"

  // Soft bottom grass strip
  fillRect(
    g,
    0,
    GARDEN_LOGICAL_HEIGHT * 0.9,
    GARDEN_LOGICAL_WIDTH,
    GARDEN_LOGICAL_HEIGHT * 0.1,
    palette.foreground,
  )

  // Corner leaf accents
  g.ellipse(80, GARDEN_LOGICAL_HEIGHT - 40, 70, 28)
  g.fill({ color: palette.hillsNear, alpha: 0.55 })
  g.ellipse(GARDEN_LOGICAL_WIDTH - 90, GARDEN_LOGICAL_HEIGHT - 36, 80, 30)
  g.fill({ color: palette.hillsNear, alpha: 0.55 })

  layer.addChild(g)
  return layer
}

export function createGardenLayers(palette: GardenPalette): GardenLayerSet {
  const background = buildBackgroundLayer(palette)
  const midground = buildMidgroundLayer(palette)
  const plots = buildPlotsLayer()
  const actors = buildActorsLayer()
  const foreground = buildForegroundLayer(palette)
  return {
    background,
    midground,
    plots,
    actors,
    foreground,
    ordered: [background, midground, plots, actors, foreground],
  }
}

/** Draw / refresh soil mounds at fixed anchors (does not move anchors). */
export function syncPlotSoil(
  plotsLayer: Container,
  anchors: readonly PlotAnchor[],
  soilColor: number,
  edgeColor: number,
  teamTint: readonly number[],
): void {
  plotsLayer.removeChildren().forEach((child) => {
    child.destroy({ children: true })
  })

  for (const anchor of anchors) {
    const mound = new Graphics()
    mound.label = `soil-plot-${anchor.index}`
    mound.position.set(anchor.x, anchor.y)
    const tint = teamTint[anchor.index] ?? soilColor
    mound.ellipse(0, 8, 70, 28)
    mound.fill({ color: edgeColor })
    mound.ellipse(0, 0, 60, 22)
    mound.fill({ color: soilColor })
    // Small team color band on the soil lip
    mound.ellipse(0, -6, 36, 10)
    mound.fill({ color: tint, alpha: 0.45 })
    plotsLayer.addChild(mound)
  }
}
