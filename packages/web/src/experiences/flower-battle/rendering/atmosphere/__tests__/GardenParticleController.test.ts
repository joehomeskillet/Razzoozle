/**
 * Garden particle controller tests (motes + gust leaves + grass sweep).
 */

import { Container, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenParticleController } from "../GardenParticleController"
import type { GardenPalette } from "../../gardenPalette"

/** Deterministic palette — particle tests only assert tint wiring, not colors. */
const TEST_PALETTE: GardenPalette = {
  sky: 0,
  sun: 0,
  cloud: 0,
  hillBack: 0,
  hillMid: 0,
  bushBack: 0,
  bushMid: 0,
  midground: 0,
  fence: 0,
  grass: 0,
  soil: 0,
  soilEdge: 0,
  foreground: 0x2f6b2f,
  plantStem: 0,
  plantLeaf: 0,
  plantPetal: 0,
  hillsFar: 0,
  hillsNear: 0,
  clouds: 0,
  teamMeterFrame: 0,
}

function makeMoteTexture(): Texture {
  return Texture.WHITE
}

function makeLeafTexture(): Texture {
  return Texture.WHITE
}

describe("GardenParticleController", () => {
  it("scales mote pool size with quality", () => {
    const layers = {
      high: new Container(),
      medium: new Container(),
      low: new Container(),
      static: new Container(),
    }
    const make = (quality: "high" | "medium" | "low" | "static") => {
      const c = new GardenParticleController({
        quality,
        ambient: layers[quality],
        grass: new Container(),
        moteTexture: makeMoteTexture(),
        palette: TEST_PALETTE,
      })
      const expected =
        quality === "high"
          ? 11
          : quality === "medium"
            ? 7
            : quality === "low"
              ? 4
              : 0
      expect(c.getMoteCount()).toBe(expected)
      c.destroy()
    }
    make("high")
    make("medium")
    make("low")
    make("static")
  })

  it("assigns every mote an alpha within the configured range", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      palette: TEST_PALETTE,
    })
    const moteSprites = ambient.children.filter(
      (child): child is Sprite =>
        child instanceof Sprite &&
        typeof child.label === "string" &&
        child.label.startsWith("atmosphere-mote-"),
    )
    expect(moteSprites).toHaveLength(controller.getMoteCount())
    for (const sprite of moteSprites) {
      expect(sprite.alpha).toBeGreaterThanOrEqual(0.15)
      expect(sprite.alpha).toBeLessThanOrEqual(0.42)
    }
    controller.destroy()
  })

  it("mote pool size stays stable across many updates", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      palette: TEST_PALETTE,
    })
    const initial = controller.getMoteCount()
    const ambientChildCount = () =>
      ambient.children.filter(
        (c) => typeof c.label === "string" && c.label.startsWith("atmosphere-mote-"),
      ).length
    expect(ambientChildCount()).toBe(initial)
    for (let i = 0; i < 500; i += 1) {
      controller.update(33, Math.sin(i * 0.1))
    }
    expect(controller.getMoteCount()).toBe(initial)
    expect(ambientChildCount()).toBe(initial)
    controller.destroy()
  })

  it("never allocates more sprites than the configured pool size", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "medium",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    const moteChildren = () =>
      ambient.children.filter(
        (c) => typeof c.label === "string" && c.label.startsWith("atmosphere-mote-"),
      )
    const leafChildren = () =>
      ambient.children.filter(
        (c) => typeof c.label === "string" && c.label.startsWith("gust-leaf-"),
      )
    const moteBefore = moteChildren().length
    const leafBefore = leafChildren().length
    for (let i = 0; i < 1_000; i += 1) {
      // Hammer the controller with strong wind to keep spawning leaves.
      controller.update(50, 1)
    }
    expect(moteChildren().length).toBe(moteBefore)
    expect(leafChildren().length).toBe(leafBefore)
    controller.destroy()
  })

  it("zero gust leaves when reducedMotion is true", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      windLeafTextures: [makeLeafTexture()],
      reducedMotion: true,
      palette: TEST_PALETTE,
    })
    for (let i = 0; i < 100; i += 1) controller.update(50, 1)
    expect(controller.getGustLeafCount()).toBe(0)
    controller.destroy()
  })

  it("zero gust leaves at quality=low regardless of wind", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "low",
      ambient,
      grass: new Container(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    for (let i = 0; i < 100; i += 1) controller.update(50, 1)
    expect(controller.getGustLeafCount()).toBe(0)
    expect(controller.getGustLeafCapacity()).toBe(0)
    controller.destroy()
  })

  it("caps gust leaves at the configured per-quality maximum", () => {
    for (const quality of ["high", "medium"] as const) {
      const ambient = new Container()
      const controller = new GardenParticleController({
        quality,
        ambient,
        grass: new Container(),
        windLeafTextures: [makeLeafTexture(), makeLeafTexture()],
        palette: TEST_PALETTE,
      })
      for (let i = 0; i < 200; i += 1) controller.update(50, 1)
      const expected = quality === "high" ? 2 : 1
      expect(controller.getGustLeafCapacity()).toBe(expected)
      // Never exceeds the configured maximum even under sustained wind.
      expect(controller.getGustLeafCount()).toBeLessThanOrEqual(expected)
      controller.destroy()
    }
  })

  it("a single update during an active gust spawns at most N leaves per tier", () => {
    for (const quality of ["high", "medium"] as const) {
      const ambient = new Container()
      const controller = new GardenParticleController({
        quality,
        ambient,
        grass: new Container(),
        windLeafTextures: [makeLeafTexture()],
        palette: TEST_PALETTE,
      })
      const before = controller.getGustLeafCount()
      controller.update(50, 1) // strong positive wind — activates gust
      const after = controller.getGustLeafCount()
      const expected = quality === "high" ? 2 : 1
      expect(after - before).toBeLessThanOrEqual(expected)
      controller.destroy()
    }
  })

  it("rotates grass-detail tufts on update when wind is non-zero", () => {
    const grass = new Container()
    const tex = Texture.WHITE
    for (let i = 0; i < 5; i += 1) {
      const tuft = new Sprite(tex)
      tuft.label = `grass-detail-${i}-0.8`
      tuft.anchor.set(0.5, 1)
      tuft.rotation = 0
      grass.addChild(tuft)
    }
    const controller = new GardenParticleController({
      quality: "high",
      ambient: new Container(),
      grass,
      moteTexture: makeMoteTexture(),
      palette: TEST_PALETTE,
    })
    const before = grass.children.map((c) => (c as Sprite).rotation)
    controller.update(100, 0.8)
    const after = grass.children.map((c) => (c as Sprite).rotation)
    // At least one tuft must have changed rotation.
    expect(after.some((rot, i) => rot !== before[i])).toBe(true)
    controller.destroy()
  })

  it("destroy is idempotent and clears ambient children", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.destroy()
    expect(() => controller.destroy()).not.toThrow()
    expect(
      ambient.children.filter(
        (c) => typeof c.label === "string" && c.label.startsWith("atmosphere-"),
      ).length,
    ).toBe(0)
  })

  it("reducedMotion update is a no-op (no rotation, no spawns)", () => {
    const grass = new Container()
    for (let i = 0; i < 3; i += 1) {
      const tuft = new Sprite(Texture.WHITE)
      tuft.label = `grass-detail-${i}-0.8`
      tuft.anchor.set(0.5, 1)
      grass.addChild(tuft)
    }
    const controller = new GardenParticleController({
      quality: "high",
      ambient: new Container(),
      grass,
      moteTexture: makeMoteTexture(),
      reducedMotion: true,
      palette: TEST_PALETTE,
    })
    const before = grass.children.map((c) => (c as Sprite).rotation)
    controller.update(500, 1)
    const after = grass.children.map((c) => (c as Sprite).rotation)
    expect(after).toEqual(before)
    controller.destroy()
  })

  it("does not allocate any gust-leaf sprites in ambient when reducedMotion is true", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture(), makeLeafTexture()],
      reducedMotion: true,
      palette: TEST_PALETTE,
    })
    const leafSprites = ambient.children.filter(
      (c) => typeof c.label === "string" && c.label.startsWith("gust-leaf-"),
    )
    expect(leafSprites).toHaveLength(0)
    expect(controller.getGustLeafCapacity()).toBe(0)
    controller.destroy()
  })

  it("restores grass tuft rotations on destroy so re-binding reads the original baseline", () => {
    const grass = new Container()
    const tex = Texture.WHITE
    const baseRotations = [0, 0.1, -0.2, 0.3, 0.05]
    for (let i = 0; i < baseRotations.length; i += 1) {
      const tuft = new Sprite(tex)
      tuft.label = `grass-detail-${i}-0.8`
      tuft.anchor.set(0.5, 1)
      tuft.rotation = baseRotations[i]!
      grass.addChild(tuft)
    }
    const controller = new GardenParticleController({
      quality: "high",
      ambient: new Container(),
      grass,
      moteTexture: makeMoteTexture(),
      palette: TEST_PALETTE,
    })
    controller.update(100, 0.8)
    controller.update(100, 0.8)
    const drifted = grass.children.map((c) => (c as Sprite).rotation)
    expect(drifted.some((rot, i) => rot !== baseRotations[i])).toBe(true)
    controller.destroy()
    for (let i = 0; i < baseRotations.length; i += 1) {
      expect(grass.children[i]!.rotation).toBeCloseTo(baseRotations[i]!)
    }
    const controller2 = new GardenParticleController({
      quality: "high",
      ambient: new Container(),
      grass,
      moteTexture: makeMoteTexture(),
      palette: TEST_PALETTE,
    })
    controller2.destroy()
    for (let i = 0; i < baseRotations.length; i += 1) {
      expect(grass.children[i]!.rotation).toBeCloseTo(baseRotations[i]!)
    }
  })
})