/**
 * AssetPlantView contract tests (Fluent-derived production plant path).
 * Node env + real Pixi Containers/Sprites; no WebGL Application required.
 */

import { Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import {
  plantMacroStageForGrowth,
  TEAM_PLANT_KEYS,
  type PlantStageTextures,
} from "../../assets/loadGardenSceneAssets"
import { AssetPlantView } from "../AssetPlantView"

function makeTexture(label: string): Texture {
  return new Texture({ source: Texture.WHITE.source, label })
}

function makeStages(prefix = "plant"): PlantStageTextures {
  return {
    seedling: makeTexture(`${prefix}-seedling`),
    sprout: makeTexture(`${prefix}-sprout`),
    bud: makeTexture(`${prefix}-bud`),
    halfBloom: makeTexture(`${prefix}-half-bloom`),
    fullBloom: makeTexture(`${prefix}-full-bloom`),
  }
}

describe("TEAM_PLANT_KEYS", () => {
  it("maps team slots 0-3 to the fixed species order", () => {
    expect([...TEAM_PLANT_KEYS]).toEqual(["violet", "blue", "orange", "green"])
  })
})

describe("plantMacroStageForGrowth", () => {
  it.each([
    [0, "seedling"],
    [1, "seedling"],
    [2, "sprout"],
    [3, "sprout"],
    [4, "sprout"],
    [5, "bud"],
    [6, "bud"],
    [7, "halfBloom"],
    [8, "halfBloom"],
    [9, "fullBloom"],
    [10, "fullBloom"],
  ] as const)("growth %i -> %s", (growth, expected) => {
    expect(plantMacroStageForGrowth(growth)).toBe(expected)
  })

  it("clamps out-of-range values", () => {
    expect(plantMacroStageForGrowth(-3)).toBe("seedling")
    expect(plantMacroStageForGrowth(99)).toBe("fullBloom")
  })
})

describe("AssetPlantView", () => {
  it("keeps the same root container across stage changes", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    const root = plant.root
    plant.setGrowthStage(1)
    plant.setGrowthStage(5)
    plant.setGrowthStage(9)
    plant.setGrowthStage(10)
    expect(plant.root).toBe(root)
  })

  it("swaps distinct stage textures on one stable sprite", () => {
    const stages = makeStages()
    const plant = new AssetPlantView({ stages })
    const sprite = plant.root.children[0] as Sprite

    const stableSprite = sprite
    for (const [growth, expected] of [
      [1, stages.seedling],
      [2, stages.sprout],
      [5, stages.bud],
      [7, stages.halfBloom],
      [9, stages.fullBloom],
    ] as const) {
      plant.setGrowthStage(growth)
      expect(plant.root.children[0]).toBe(stableSprite)
      expect(sprite.texture).toBe(expected)
      expect(sprite.visible).toBe(true)
    }
  })

  it("hides the sprite at growth 0, shows it from growth 1", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    const sprite = plant.root.children[0]!
    plant.setGrowthStage(0)
    expect(sprite.visible).toBe(false)
    plant.setGrowthStage(1)
    expect(sprite.visible).toBe(true)
  })

  it("never applies a team tint to the full-color sprite", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    plant.setGrowthStage(10)
    const sprite = plant.root.children[0]!
    expect((sprite as { tint: number }).tint).toBe(0xffffff)
  })

  it("advances the macro stage with growth", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    expect(plant.getMacroStage()).toBe("seedling")
    plant.setGrowthStage(3)
    expect(plant.getMacroStage()).toBe("sprout")
    plant.setGrowthStage(5)
    expect(plant.getMacroStage()).toBe("bud")
    plant.setGrowthStage(8)
    expect(plant.getMacroStage()).toBe("halfBloom")
    plant.setGrowthStage(10)
    expect(plant.getMacroStage()).toBe("fullBloom")
  })

  it("reducedMotion settles the transition immediately without update ticks", () => {
    const plant = new AssetPlantView({
      stages: makeStages(),
      reducedMotion: true,
    })
    plant.setGrowthStage(10)
    // No update() call — with reducedMotion the transition is already done.
    const sprite = plant.root.children[0] as { alpha: number }
    expect(sprite.alpha).toBe(1)
  })

  it("destroy is idempotent", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    plant.setGrowthStage(10)
    plant.destroy()
    expect(() => plant.destroy()).not.toThrow()
  })

  it("does not destroy shared loaded textures with the view", () => {
    const stages = makeStages("shared")
    const plant = new AssetPlantView({ stages })
    plant.setGrowthStage(10)

    plant.destroy()

    for (const texture of Object.values(stages)) {
      expect(texture.destroyed, texture.label).toBe(false)
    }
  })
})
