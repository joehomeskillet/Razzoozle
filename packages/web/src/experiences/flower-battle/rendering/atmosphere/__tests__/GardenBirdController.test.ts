/**
 * Garden bird controller tests.
 *
 * - Quality-gated pool size.
 * - Tolerates missing bird textures.
 * - Birds travel in the configured direction (always +x or -x).
 * - Recycling returns birds to the pool without allocating new sprites.
 * - First spawn falls in the dedicated [2.5 s, 6 s] band. (FU-H.)
 */

import { Container, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenBirdController } from "../GardenBirdController"
import { BIRD_FIRST_SPAWN_RANGE_MS } from "../garden-atmosphere.constants"
import type { SeededRandom } from "../seededRandom"

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
    const skyLifeForeground = layers.high
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
    })
    expect(birds.getBirdCount()).toBe(2)
    birds.destroy()

    const medium = new GardenBirdController({
      quality: "medium",
      skyLifeForeground: layers.medium,
      birdTextures: makeBirdTextures(),
    })
    expect(medium.getBirdCount()).toBe(1)
    medium.destroy()

    const low = new GardenBirdController({
      quality: "low",
      skyLifeForeground: layers.low,
      birdTextures: makeBirdTextures(),
    })
    expect(low.getBirdCount()).toBe(0)
    low.destroy()

    const stat = new GardenBirdController({
      quality: "static",
      skyLifeForeground: layers.static,
      birdTextures: makeBirdTextures(),
    })
    expect(stat.getBirdCount()).toBe(0)
    stat.destroy()
  })

  it("leaves the pool empty when bird textures are null", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: null,
    })
    expect(birds.getBirdCount()).toBe(0)
    expect(skyLifeForeground.children.length).toBe(0)
    birds.destroy()
  })

  it("never activates more than 2 birds simultaneously", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [10, 20],
      firstSpawnRangeMs: [1, 2],
    })
    // Hammer updates to spawn many birds.
    for (let i = 0; i < 200; i += 1) {
      birds.update(20)
      expect(birds.getActiveBirdCount()).toBeLessThanOrEqual(2)
    }
    birds.destroy()
  })

  it("advances each active bird in +x or -x over time", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
    })
    // Spawn a bird immediately and capture its position at t1, then
    // again at t1+dt and verify x moved in a consistent direction.
    birds.update(20)
    const birdSprites = () =>
      skyLifeForeground.children.filter(
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

  it("applies vertical wave from stable base Y using configured amplitude", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "medium",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      seed: 123,
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        sprite: Sprite
        baseY: number
        waveAmp: number
        wavePhase: number
        elapsedSec: number
      }>
      trySpawn: () => void
    }
    internals.trySpawn()
    const slot = internals.pool[0]
    expect(slot.active).toBe(true)
    const baseY = slot.sprite.y
    let honorsAmplitude = false
    for (let i = 0; i < 10; i += 1) {
      birds.update(50)
      const expectedY =
        baseY + Math.sin(slot.elapsedSec * 4 + slot.wavePhase) * slot.waveAmp
      expect(slot.sprite.y).toBeCloseTo(expectedY, 6)
      if (Math.abs(slot.sprite.y - baseY) > 0.1) honorsAmplitude = true
    }
    expect(honorsAmplitude).toBe(true)
    birds.destroy()
  })

  it("returns retired birds to the pool without allocating new sprites", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
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
    const birdChildren = skyLifeForeground.children.filter(
      (c) => typeof c.label === "string" && c.label.startsWith("bird-"),
    )
    expect(birdChildren.length).toBe(poolSize)
    birds.destroy()
  })

  it("respects reduced-motion: pool size is 0 and update is a no-op", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      reducedMotion: true,
    })
    expect(birds.getBirdCount()).toBe(0)
    for (let i = 0; i < 100; i += 1) birds.update(50)
    expect(birds.getActiveBirdCount()).toBe(0)
    birds.destroy()
  })

  it("destroy is idempotent and detaches every sprite", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
    })
    birds.destroy()
    expect(() => birds.destroy()).not.toThrow()
    expect(skyLifeForeground.children.length).toBe(0)
  })

  it("rejects spawn candidates inside SUN_SAFE_RADIUS of the configured sunPosition", () => {
    // Replace the rng so every pickSafeDestination draw lands at (500, 200)
    // — the X and Y call signature is distinguished by the `min` argument
    // (X draws from [40, ~1880], Y from [yMin, yMax] which is ~[151, 346]).
    // Both fall inside SUN_SAFE_RADIUS of (500, 200), so after
    // BIRD_SPAWN_RETRY_LIMIT attempts the controller must give up.
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      sunPosition: { x: 500, y: 200 },
    })
    const internals = birds as unknown as {
      rng: SeededRandom
      trySpawn: () => void
      pool: Array<{ active: boolean; baseY: number; sprite: Sprite }>
    }
    internals.rng = {
      state: 0,
      next: () => 0,
      range: (min: number) => (min < 100 ? 500 : 200),
      rangeInt: (min: number) => min,
      signed: () => 0,
    }
    internals.trySpawn()
    expect(internals.pool[0]!.active).toBe(false)
    birds.destroy()
  })

  it("allows spawn candidates inside SUN_SAFE_RADIUS when sunPosition is null", () => {
    // Same deterministic rng as the rejection test — without a sun the same
    // draws must be accepted (no safe-zone rejection), proving the null
    // path is the only thing keeping the spawn alive.
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      sunPosition: null,
    })
    const internals = birds as unknown as {
      rng: SeededRandom
      trySpawn: () => void
      pool: Array<{ active: boolean; baseY: number; sprite: Sprite }>
    }
    internals.rng = {
      state: 0,
      next: () => 0,
      range: (min: number) => (min < 100 ? 500 : 200),
      rangeInt: (min: number) => min,
      signed: () => 0,
    }
    internals.trySpawn()
    expect(internals.pool[0]!.active).toBe(true)
    birds.destroy()
  })

  it("schedules the first spawn within the [2.5 s, 6 s] band (FU-H)", () => {
    // Walk several seeds — every one must place nextSpawnAtMs inside
    // [BIRD_FIRST_SPAWN_RANGE_MS[0], BIRD_FIRST_SPAWN_RANGE_MS[1]].
    // (rangeInt is inclusive on both ends, so allow the lower bound to
    // appear and the upper bound to appear.)
    for (const seed of [0xc0ffee, 1, 2, 42, 1234, 0xdeadbeef]) {
      const skyLifeForeground = new Container()
      const birds = new GardenBirdController({
        quality: "high",
        skyLifeForeground,
        birdTextures: makeBirdTextures(),
        seed,
      })
      const internals = birds as unknown as { nextSpawnAtMs: number }
      const next = internals.nextSpawnAtMs
      expect(next).toBeGreaterThanOrEqual(BIRD_FIRST_SPAWN_RANGE_MS[0])
      expect(next).toBeLessThanOrEqual(BIRD_FIRST_SPAWN_RANGE_MS[1])
      birds.destroy()
    }
  })
})

describe("FU-I: GardenBirdController skyLifeForeground back-compat", () => {
  it("prefers skyLifeForeground over the legacy skyLife option when both are passed", () => {
    const foreground = new Container()
    const legacy = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground: foreground,
      skyLife: legacy,
      birdTextures: makeBirdTextures(),
    })
    // Birds must mount into the foreground container, never the legacy one.
    expect(foreground.children.length).toBe(2)
    expect(legacy.children.length).toBe(0)
    birds.destroy()
  })

  it("falls back to the legacy skyLife option when skyLifeForeground is omitted", () => {
    const legacy = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLife: legacy,
      birdTextures: makeBirdTextures(),
    })
    // Pre-FU-I callers still get birds mounted in their legacy layer.
    expect(legacy.children.length).toBe(2)
    birds.destroy()
  })

  it("throws when neither skyLifeForeground nor skyLife is supplied", () => {
    expect(
      () =>
        new GardenBirdController({
          quality: "high",
          birdTextures: makeBirdTextures(),
        }),
    ).toThrow(/skyLifeForeground or skyLife/)
  })
})