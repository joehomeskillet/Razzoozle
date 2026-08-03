/**
 * Tree-layering tests (FB-HUD4 / Gartenmodus-Korrektur).
 *
 * Verifies the SDD §7 contract:
 *  - Three independent depth layers (far / mid / near) are present.
 *  - Opacity is applied to the WHOLE layer, not to individual trees.
 *  - The near-trees layer is fully opaque (no inherited transparency).
 *  - Within a layer, trees are sorted by depth and then by x.
 *  - Per-tree alpha is 1 — no `opacity` per sprite.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import {
  buildFarTreesLayer,
  buildForegroundFrame,
  buildMidTreesLayer,
  buildNearTreesLayer,
  FAR_TREE_LAYER_OPACITY,
  LAYER_LABELS,
  MID_TREE_LAYER_OPACITY,
  NEAR_TREE_LAYER_OPACITY,
  buildSkyLifeLayer,
  createGardenLayers,
  type LayerAssets,
} from "../gardenLayers"
import type { GardenPalette } from "../gardenPalette"

const TEST_PALETTE: GardenPalette = {
  sky: 0x87b5e0,
  sun: 0xffd54a,
  cloud: 0xf5f5f5,
  hillBack: 0x4a8f4a,
  hillMid: 0x5aad5a,
  bushBack: 0x3d7a3d,
  bushMid: 0x3d7a3d,
  midground: 0x3d7a3d,
  fence: 0xfaf6e8,
  grass: 0x6bbf59,
  soil: 0xc4a574,
  soilEdge: 0x8b6914,
  foreground: 0x2f6b2f,
  plantStem: 0x2d6a2d,
  plantLeaf: 0x4caf50,
  plantPetal: 0xe57373,
  hillsFar: 0x4a8f4a,
  hillsNear: 0x5aad5a,
  clouds: 0xf5f5f5,
  teamMeterFrame: 0x222222,
}

const collectTreeSprites = (layer: Container): Sprite[] =>
  layer.children.filter(
    (c): c is Sprite =>
      c instanceof Sprite && typeof c.label === "string" &&
      (c.label.startsWith("far-tree-") ||
        c.label.startsWith("mid-tree-") ||
        c.label.startsWith("near-tree-")),
  )

/** Count any tree-shaped children (Sprite or Graphics fallback). */
const countTreeChildren = (layer: Container): number =>
  layer.children.filter((c) => {
    if (c instanceof Sprite) {
      return typeof c.label === "string" &&
        (c.label.startsWith("far-tree-") ||
          c.label.startsWith("mid-tree-") ||
          c.label.startsWith("near-tree-"))
    }
    if (c instanceof Graphics) {
      return typeof c.label === "string" &&
        (c.label.startsWith("far-trees-fallback") ||
          c.label.startsWith("mid-trees-fallback") ||
          c.label.startsWith("near-trees-fallback"))
    }
    return false
  }).length

describe("FB-HUD4: tree layering (far / mid / near)", () => {
  it("createGardenLayers includes the three tree layers in the right z-order", () => {
    const layers = createGardenLayers(TEST_PALETTE)
    const labels = LAYER_LABELS
    expect(labels).toContain("layer-far-trees")
    expect(labels).toContain("layer-mid-trees")
    expect(labels).toContain("layer-near-trees")
    // far → mid → near back-to-front in the ordered list.
    const order = layers.ordered.map((c) => c.label)
    const farIdx = order.indexOf("layer-far-trees")
    const midIdx = order.indexOf("layer-mid-trees")
    const nearIdx = order.indexOf("layer-near-trees")
    expect(farIdx).toBeGreaterThan(-1)
    expect(midIdx).toBeGreaterThan(-1)
    expect(nearIdx).toBeGreaterThan(-1)
    expect(farIdx).toBeLessThan(midIdx)
    expect(midIdx).toBeLessThan(nearIdx)
  })

  it("far-trees layer uses layer-level alpha, not per-tree alpha (sprite alpha = 1)", () => {
    const layer = buildFarTreesLayer(TEST_PALETTE)
    expect(layer.alpha).toBeCloseTo(FAR_TREE_LAYER_OPACITY, 5)
    // Without textures, the layer falls back to a procedural Graphics row —
    // either way the layer must carry alpha, and per-element alpha stays 1.
    expect(countTreeChildren(layer)).toBeGreaterThan(0)
    for (const child of layer.children) {
      if (child instanceof Sprite) expect(child.alpha).toBe(1)
    }
  })

  it("mid-trees layer uses layer-level alpha, not per-tree alpha", () => {
    const layer = buildMidTreesLayer(TEST_PALETTE)
    expect(layer.alpha).toBeCloseTo(MID_TREE_LAYER_OPACITY, 5)
    expect(countTreeChildren(layer)).toBeGreaterThan(0)
    for (const child of layer.children) {
      if (child instanceof Sprite) expect(child.alpha).toBe(1)
    }
  })

  it("near-trees layer is fully opaque (alpha = 1) and per-tree alpha = 1", () => {
    const layer = buildNearTreesLayer(TEST_PALETTE)
    expect(layer.alpha).toBe(NEAR_TREE_LAYER_OPACITY)
    expect(layer.alpha).toBe(1)
    expect(countTreeChildren(layer)).toBeGreaterThan(0)
    for (const child of layer.children) {
      if (child instanceof Sprite) expect(child.alpha).toBe(1)
    }
  })

  it("within a layer, trees are sorted by x (stable, reproducible order)", () => {
    const farLayer = buildFarTreesLayer(TEST_PALETTE)
    const farSprites = collectTreeSprites(farLayer)
    for (let i = 1; i < farSprites.length; i += 1) {
      expect(farSprites[i]!.x).toBeGreaterThanOrEqual(farSprites[i - 1]!.x)
    }

    const nearLayer = buildNearTreesLayer(TEST_PALETTE)
    const nearSprites = collectTreeSprites(nearLayer)
    for (let i = 1; i < nearSprites.length; i += 1) {
      expect(nearSprites[i]!.x).toBeGreaterThanOrEqual(nearSprites[i - 1]!.x)
    }
  })

  it("layer-far-trees is rendered BEFORE layer-near-trees so near trees occlude far trees", () => {
    const layers = createGardenLayers(TEST_PALETTE)
    const ordered = layers.ordered.map((c) => c.label)
    const farIdx = ordered.indexOf("layer-far-trees")
    const nearIdx = ordered.indexOf("layer-near-trees")
    expect(farIdx).toBeLessThan(nearIdx)
  })

  it("procedural fallback (no textures) still produces a labeled far/mid/near layer with children", () => {
    const farLayer = buildFarTreesLayer(TEST_PALETTE)
    const midLayer = buildMidTreesLayer(TEST_PALETTE)
    const nearLayer = buildNearTreesLayer(TEST_PALETTE)
    expect(farLayer.label).toBe("layer-far-trees")
    expect(midLayer.label).toBe("layer-mid-trees")
    expect(nearLayer.label).toBe("layer-near-trees")
    // No assets → procedural Graphics fallback still rendered.
    expect(farLayer.children.length).toBeGreaterThan(0)
    expect(midLayer.children.length).toBeGreaterThan(0)
    expect(nearLayer.children.length).toBeGreaterThan(0)
    // All children of the fallback are Graphics (not Sprites).
    for (const child of farLayer.children) {
      expect(child).toBeInstanceOf(Graphics)
    }
  })

  it("textured layer keeps the same per-tree alpha = 1 rule", () => {
    // Build two synthetic textures so each layer can render at least one
    // tree. We use the Texture.WHITE shared resource as the backing — it
    // exists in node env and has the expected width/height > 0 so the
    // texture-loading branch is hit without needing a canvas.
    const texA = Texture.WHITE
    const texB = Texture.WHITE
    const assets: LayerAssets = { trees: [texA, texB] }
    const farLayer = buildFarTreesLayer(TEST_PALETTE, assets)
    const nearLayer = buildNearTreesLayer(TEST_PALETTE, assets)
    for (const sprite of collectTreeSprites(farLayer)) {
      expect(sprite.alpha).toBe(1)
    }
    for (const sprite of collectTreeSprites(nearLayer)) {
      expect(sprite.alpha).toBe(1)
    }
  })
})

describe("P0 opacity: foreground-bush and per-tree alpha = 1", () => {
  function collectForegroundBushes(layer: Container): Sprite[] {
    return layer.children.filter(
      (c): c is Sprite =>
        c instanceof Sprite &&
        typeof c.label === "string" &&
        c.label.startsWith("foreground-bush-"),
    )
  }

  it("every foreground-bush Sprite has alpha = 1 in the textured branch", () => {
    const tex = Texture.WHITE
    const layer = buildForegroundFrame(TEST_PALETTE, {
      foregroundBush: tex,
    })
    const bushes = collectForegroundBushes(layer)
    expect(bushes.length).toBeGreaterThan(0)
    for (const bush of bushes) {
      expect(bush.alpha).toBe(1)
    }
  })

  it("every mid-tree Sprite has alpha = 1 (depth fade lives on the layer)", () => {
    const texA = Texture.WHITE
    const texB = Texture.WHITE
    const assets: LayerAssets = { trees: [texA, texB] }
    const midLayer = buildMidTreesLayer(TEST_PALETTE, assets)
    const midSprites = collectTreeSprites(midLayer)
    expect(midSprites.length).toBeGreaterThan(0)
    for (const sprite of midSprites) {
      expect(sprite.alpha).toBe(1)
    }
  })

  it("every far-tree Sprite has alpha = 1 (depth fade lives on the layer)", () => {
    const texA = Texture.WHITE
    const texB = Texture.WHITE
    const assets: LayerAssets = { trees: [texA, texB] }
    const farLayer = buildFarTreesLayer(TEST_PALETTE, assets)
    const farSprites = collectTreeSprites(farLayer)
    expect(farSprites.length).toBeGreaterThan(0)
    for (const sprite of farSprites) {
      expect(sprite.alpha).toBe(1)
    }
  })
})

describe("sky-life layer container (atmosphere hook point)", () => {
  it("buildSkyLifeLayer produces a labeled, empty container", () => {
    const layer = buildSkyLifeLayer()
    expect(layer.label).toBe("layer-sky-life")
    expect(layer.children).toHaveLength(0)
  })

  it("createGardenLayers exposes skyLife and orders it between sky and distant-hills", () => {
    const layers = createGardenLayers(TEST_PALETTE)
    expect(layers.skyLife.label).toBe("layer-sky-life")
    const ordered = layers.ordered.map((c) => c.label)
    const skyIdx = ordered.indexOf("layer-sky")
    const lifeIdx = ordered.indexOf("layer-sky-life")
    const hillsIdx = ordered.indexOf("layer-distant-hills")
    expect(skyIdx).toBeGreaterThanOrEqual(0)
    expect(lifeIdx).toBeGreaterThanOrEqual(0)
    expect(hillsIdx).toBeGreaterThanOrEqual(0)
    expect(skyIdx).toBeLessThan(lifeIdx)
    expect(lifeIdx).toBeLessThan(hillsIdx)
    expect(LAYER_LABELS).toContain("layer-sky-life")
  })
})
