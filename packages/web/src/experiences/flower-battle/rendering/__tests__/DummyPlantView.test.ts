/**
 * DummyPlantView — growth clamp, texture head, face overlay (no WebGL).
 */

import { Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import {
  DummyPlantView,
  plantHeadKeyForIndex,
  type DummyPlantColors,
} from "../DummyPlantView"

const COLORS: DummyPlantColors = {
  stem: 0x2d6a2d,
  leaf: 0x4caf50,
  petal: 0xe57373,
}

function findByLabel(root: { children: readonly { label?: string }[] }, label: string) {
  return root.children.find((c) => c.label === label)
}

describe("DummyPlantView", () => {
  it("clamps growth stage to 0..10 (floor)", () => {
    const plant = new DummyPlantView(COLORS)
    try {
      expect(plant.getGrowthStage()).toBe(0)

      plant.setGrowthStage(-5)
      expect(plant.getGrowthStage()).toBe(0)

      plant.setGrowthStage(3.9)
      expect(plant.getGrowthStage()).toBe(3)

      plant.setGrowthStage(10)
      expect(plant.getGrowthStage()).toBe(10)

      plant.setGrowthStage(99)
      expect(plant.getGrowthStage()).toBe(10)
    } finally {
      plant.destroy()
    }
  })

  it("uses head Sprite when headTexture is usable; hides at growth 0", () => {
    const plant = new DummyPlantView({
      colors: COLORS,
      headTexture: Texture.WHITE,
    })
    try {
      const head = findByLabel(plant.root, "plant-head-sprite") as Sprite | undefined
      expect(head).toBeDefined()
      expect(head).toBeInstanceOf(Sprite)

      // Stage 0: no blossom yet.
      expect(head!.visible).toBe(false)

      plant.setGrowthStage(5)
      expect(head!.visible).toBe(true)
      expect(head!.tint).toBe(COLORS.petal)
      // Stem height + head scale grow with stage (position.y = -stemH).
      const yAt5 = head!.position.y
      plant.setGrowthStage(10)
      expect(head!.position.y).toBeLessThan(yAt5)
      expect(Math.abs(head!.scale.x)).toBeGreaterThan(0)
    } finally {
      plant.destroy()
    }
  })

  it("overlays face Sprite untinted when faceTexture is provided with head", () => {
    const plant = new DummyPlantView({
      colors: COLORS,
      headTexture: Texture.WHITE,
      faceTexture: Texture.WHITE,
    })
    try {
      const face = findByLabel(plant.root, "plant-face-sprite") as Sprite | undefined
      const head = findByLabel(plant.root, "plant-head-sprite") as Sprite | undefined
      expect(face).toBeDefined()
      expect(head).toBeDefined()

      plant.setGrowthStage(7)
      expect(face!.visible).toBe(true)
      expect(head!.visible).toBe(true)
      // Face must not inherit team petal tint.
      expect(face!.tint).toBe(0xffffff)
      expect(head!.tint).toBe(COLORS.petal)
      // Face sits with the head (same x, slight y nudge into the bloom).
      expect(face!.position.x).toBe(0)
      expect(Math.abs(face!.position.y - head!.position.y)).toBeLessThan(20)
    } finally {
      plant.destroy()
    }
  })

  it("does not create face Sprite without headTexture (Graphics fallback path)", () => {
    const plant = new DummyPlantView({
      colors: COLORS,
      faceTexture: Texture.WHITE,
    })
    try {
      expect(findByLabel(plant.root, "plant-face-sprite")).toBeUndefined()
      expect(findByLabel(plant.root, "plant-head-sprite")).toBeUndefined()
      plant.setGrowthStage(4)
      // Still no face/head sprites — only Graphics children.
      expect(findByLabel(plant.root, "plant-face-sprite")).toBeUndefined()
    } finally {
      plant.destroy()
    }
  })

  it("setFaceTexture / setHeadTexture swap overlays at runtime", () => {
    const plant = new DummyPlantView({ colors: COLORS })
    try {
      expect(findByLabel(plant.root, "plant-head-sprite")).toBeUndefined()

      plant.setHeadTexture(Texture.WHITE)
      expect(findByLabel(plant.root, "plant-head-sprite")).toBeDefined()

      plant.setFaceTexture(Texture.WHITE)
      const face = findByLabel(plant.root, "plant-face-sprite") as Sprite
      expect(face).toBeDefined()
      plant.setGrowthStage(2)
      expect(face.visible).toBe(true)

      plant.setFaceTexture(undefined)
      expect(findByLabel(plant.root, "plant-face-sprite")).toBeUndefined()
    } finally {
      plant.destroy()
    }
  })

  it("plantHeadKeyForIndex cycles 4 distinct styles", () => {
    expect(plantHeadKeyForIndex(0)).toBe("round")
    expect(plantHeadKeyForIndex(1)).toBe("bell")
    expect(plantHeadKeyForIndex(2)).toBe("sun")
    expect(plantHeadKeyForIndex(3)).toBe("tulip")
    expect(plantHeadKeyForIndex(4)).toBe("round")
    const keys = [0, 1, 2, 3].map(plantHeadKeyForIndex)
    expect(new Set(keys).size).toBe(4)
  })
})
