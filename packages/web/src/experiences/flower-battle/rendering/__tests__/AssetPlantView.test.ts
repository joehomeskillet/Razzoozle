/**
 * AssetPlantView contract tests (Fluent-derived production plant path).
 * Node env + real Pixi Containers/Sprites; no WebGL Application required.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"
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

function makePlantWithPot(prefix = "plant") {
  const stages = makeStages(prefix)
  const potTexture = makeTexture(`${prefix}-pot`)
  const options = { stages, potTexture, reducedMotion: true }
  return {
    plant: new AssetPlantView(options),
    potTexture,
    stages,
  }
}

function requireSprite(root: Container, label: string): Sprite {
  const child = root.getChildByLabel(label, true)
  expect(child, label).toBeInstanceOf(Sprite)
  if (!(child instanceof Sprite)) {
    throw new Error(`expected ${label} to be a Sprite`)
  }
  return child
}

function descendants(root: Container): Container[] {
  const result: Container[] = []
  const visit = (parent: Container): void => {
    for (const child of parent.children) {
      result.push(child)
      visit(child)
    }
  }
  visit(root)
  return result
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
    const sprite = requireSprite(plant.root, "plant-sprite")

    const stableSprite = sprite
    for (const [growth, expected] of [
      [1, stages.seedling],
      [2, stages.sprout],
      [5, stages.bud],
      [7, stages.halfBloom],
      [9, stages.fullBloom],
    ] as const) {
      plant.setGrowthStage(growth)
      expect(requireSprite(plant.root, "plant-sprite")).toBe(stableSprite)
      expect(sprite.texture).toBe(expected)
      expect(sprite.visible).toBe(true)
    }
  })

  it("hides the sprite at growth 0, shows it from growth 1", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    const sprite = requireSprite(plant.root, "plant-sprite")
    plant.setGrowthStage(0)
    expect(sprite.visible).toBe(false)
    plant.setGrowthStage(1)
    expect(sprite.visible).toBe(true)
  })

  it("never applies a team tint to the full-color sprite", () => {
    const plant = new AssetPlantView({ stages: makeStages() })
    plant.setGrowthStage(10)
    const sprite = requireSprite(plant.root, "plant-sprite")
    expect(sprite.tint).toBe(0xffffff)
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
    const sprite = requireSprite(plant.root, "plant-sprite")
    expect(sprite.alpha).toBe(1)
  })

  it("uses stable semantic pot and body sprites in render order", () => {
    const { plant } = makePlantWithPot()
    const pot = requireSprite(plant.root, "plant-pot-sprite")
    const body = requireSprite(plant.root, "plant-sprite")

    expect(plant.root.children.indexOf(pot)).toBeLessThan(
      plant.root.children.indexOf(body),
    )
  })

  it("contains no face sprite in the high-quality path", () => {
    const { plant } = makePlantWithPot()
    plant.setGrowthStage(10)

    const faceSprites = plant.root
      .getChildrenByLabel(/face/i, true)
      .filter((child) => child instanceof Sprite)
    expect(faceSprites).toEqual([])
  })

  it("uses no Graphics parts for the pot or plant body", () => {
    const { plant } = makePlantWithPot()
    plant.setGrowthStage(10)

    expect(
      descendants(plant.root).filter((node) => node instanceof Graphics),
    ).toEqual([])
  })

  it("hides the pot at growth 0 and shows it at every visible stage", () => {
    const { plant } = makePlantWithPot()
    const pot = requireSprite(plant.root, "plant-pot-sprite")

    expect(pot.visible).toBe(false)
    for (let growth = 1; growth <= 10; growth += 1) {
      plant.setGrowthStage(growth)
      expect(pot.visible, `growth ${growth}`).toBe(true)
    }
  })

  it("keeps pot identity and transform stable while the body grows", () => {
    const { plant, stages } = makePlantWithPot()
    const root = plant.root
    const pot = requireSprite(root, "plant-pot-sprite")
    const body = requireSprite(root, "plant-sprite")
    plant.setGrowthStage(1)

    const stableRootTransform = {
      pivotX: root.pivot.x,
      pivotY: root.pivot.y,
      scaleX: root.scale.x,
      scaleY: root.scale.y,
      x: root.position.x,
      y: root.position.y,
    }
    const stablePotTransform = {
      anchorX: pot.anchor.x,
      anchorY: pot.anchor.y,
      scaleX: pot.scale.x,
      scaleY: pot.scale.y,
      x: pot.position.x,
      y: pot.position.y,
    }
    const stableBody = body
    const stableBodyAnchor = { x: body.anchor.x, y: body.anchor.y }
    const initialBodyScale = body.scale.x
    const initialBodyTexture = body.texture

    for (const growth of [5, 8, 10]) {
      plant.setGrowthStage(growth)
      expect(plant.root, `growth ${growth}`).toBe(root)
      expect(requireSprite(root, "plant-pot-sprite"), `growth ${growth}`).toBe(
        pot,
      )
      expect(requireSprite(root, "plant-sprite"), `growth ${growth}`).toBe(
        stableBody,
      )
      expect(
        { x: body.anchor.x, y: body.anchor.y },
        `body anchor growth ${growth}`,
      ).toEqual(stableBodyAnchor)
      expect(
        {
          pivotX: root.pivot.x,
          pivotY: root.pivot.y,
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x,
          y: root.position.y,
        },
        `root growth ${growth}`,
      ).toEqual(stableRootTransform)
      expect(
        {
          anchorX: pot.anchor.x,
          anchorY: pot.anchor.y,
          scaleX: pot.scale.x,
          scaleY: pot.scale.y,
          x: pot.position.x,
          y: pot.position.y,
        },
        `pot growth ${growth}`,
      ).toEqual(stablePotTransform)
    }

    expect(body.scale.x).toBeGreaterThan(initialBodyScale)
    expect(body.texture).not.toBe(initialBodyTexture)
    expect(body.texture).toBe(stages.fullBloom)
  })

  it("destroy is idempotent", () => {
    const { plant } = makePlantWithPot()
    plant.setGrowthStage(10)
    requireSprite(plant.root, "plant-pot-sprite")
    plant.destroy()
    expect(() => plant.destroy()).not.toThrow()
  })

  it("does not destroy shared loaded textures with the view", () => {
    const { plant, potTexture, stages } = makePlantWithPot("shared")
    plant.setGrowthStage(10)
    expect(requireSprite(plant.root, "plant-pot-sprite").texture).toBe(
      potTexture,
    )

    plant.destroy()

    for (const texture of [...Object.values(stages), potTexture]) {
      expect(texture.destroyed, texture.label).toBe(false)
    }
  })
})
