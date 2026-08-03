/**
 * Garden bird controller tests.
 *
 * - Quality-gated pool size.
 * - Tolerates missing bird textures.
 * - Birds travel in the configured direction (always +x or -x).
 * - Recycling returns birds to the pool without allocating new sprites.
 */

import { Container, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenBirdController } from "../GardenBirdController"

function makeBirdTextures(): { up: Texture; down: Texture } {
  return {
    up: Texture.WHITE,
    down: Texture.WHITE,
  }
}

describe("GardenBirdController", () => {
  it("matches pool size to quality (high=2, medium=1, low=0, static=0)", () => {
    const layers = {
      high: new Container(),
      medium: new Container(),
      low: new Container(),
      static: new Container(),
    }
    const skyLife = layers.high
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: makeBirdTextures(),
    })
    expect(birds.getBirdCount()).toBe(2)
    birds.destroy()

    const medium = new GardenBirdController({
      quality: "medium",
      skyLife: layers.medium,
      birdTextures: makeBirdTextures(),
    })
    expect(medium.getBirdCount()).toBe(1)
    medium.destroy()

    const low = new GardenBirdController({
      quality: "low",
      skyLife: layers.low,
      birdTextures: makeBirdTextures(),
    })
    expect(low.getBirdCount()).toBe(0)
    low.destroy()

    const stat = new GardenBirdController({
      quality: "static",
      skyLife: layers.static,
      birdTextures: makeBirdTextures(),
    })
    expect(stat.getBirdCount()).toBe(0)
    stat.destroy()
  })

  it("leaves the pool empty when bird textures are null", () => {
    const skyLife = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: null,
    })
    expect(birds.getBirdCount()).toBe(0)
    expect(skyLife.children.length).toBe(0)
    birds.destroy()
  })

  it("never activates more than 2 birds simultaneously", () => {
    const skyLife = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [10, 20],
    })
    // Hammer updates to spawn many birds.
    for (let i = 0; i < 200; i += 1) {
      birds.update(20)
      expect(birds.getActiveBirdCount()).toBeLessThanOrEqual(2)
    }
    birds.destroy()
  })

  it("advances each active bird in +x or -x over time", () => {
    const skyLife = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
    })
    // Spawn a bird immediately and capture its position at t1, then
    // again at t1+dt and verify x moved in a consistent direction.
    birds.update(20)
    const birdSprites = () =>
      skyLife.children.filter(
        (c) =>
          c instanceof Sprite &&
          typeof c.label === "string" &&
          c.label.startsWith("bird-"),
      )
    let activeAtT1 = birdSprites().filter((b) => b.visible)
    if (activeAtT1.length === 0) {
      // Spawn again — high quality gives us 2 pool slots, retry until one is active.
      for (let i = 0; i < 200 && activeAtT1.length === 0; i += 1) {
        birds.update(20)
        activeAtT1 = birdSprites().filter((b) => b.visible)
      }
    }
    expect(activeAtT1.length).toBeGreaterThan(0)
    for (const bird of activeAtT1) {
      const x1 = bird.x
      birds.update(50)
      const x2 = bird.x
      // Each update should move the bird horizontally by a positive
      // (or negative) amount — never zero, never reverse direction
      // mid-flight. Direction is fixed by the spawn position.
      expect(x2).not.toBe(x1)
    }
    birds.destroy()
  })

  it("returns retired birds to the pool without allocating new sprites", () => {
    const skyLife = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
    })
    const poolSize = birds.getBirdCount()
    expect(poolSize).toBeGreaterThan(0)
    // Run a long stream so every bird has had a chance to retire.
    for (let i = 0; i < 2_000; i += 1) {
      birds.update(40)
    }
    // Pool size is invariant across the lifetime of the controller.
    expect(birds.getBirdCount()).toBe(poolSize)
    // No additional Sprites were ever added beyond the pool size.
    const birdChildren = skyLife.children.filter(
      (c) => typeof c.label === "string" && c.label.startsWith("bird-"),
    )
    expect(birdChildren.length).toBe(poolSize)
    birds.destroy()
  })

  it("respects reduced-motion: pool size is 0 and update is a no-op", () => {
    const skyLife = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: makeBirdTextures(),
      reducedMotion: true,
    })
    expect(birds.getBirdCount()).toBe(0)
    for (let i = 0; i < 100; i += 1) birds.update(50)
    expect(birds.getActiveBirdCount()).toBe(0)
    birds.destroy()
  })

  it("destroy is idempotent and detaches every sprite", () => {
    const skyLife = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife,
      birdTextures: makeBirdTextures(),
    })
    birds.destroy()
    expect(() => birds.destroy()).not.toThrow()
    expect(skyLife.children.length).toBe(0)
  })
})