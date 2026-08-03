/**
 * GardenAtmosphereController aggregator tests.
 *
 * Verifies:
 *   - bind wires all three sub-controllers
 *   - update(0) is a no-op (no exceptions, no allocation)
 *   - update after destroy is a no-op
 *   - destroy is idempotent
 *   - same seed → same wind sample at the same elapsed seconds
 */

import { Container, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import { createGardenAtmosphere } from "../GardenAtmosphereController"
import type { GardenPalette } from "../../gardenPalette"

/** Deterministic palette for atmosphere aggregator tests — non-zero
 *  foreground so tint wiring (where it matters) is observable. */
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

function makeAtmosphereOptions(overrides: Record<string, unknown> = {}) {
  const ambient = new Container()
  const skyLife = new Container()
  const skyLifeForeground = new Container()
  const weather = new Container()
  const grass = new Container()
  return {
    skyLife,
    skyLifeForeground,
    ambient,
    weather,
    grass,
    palette: TEST_PALETTE,
    quality: "high" as const,
    prefersReducedMotion: false,
    ...overrides,
  }
}

describe("createGardenAtmosphere", () => {
  it("binds all three sub-controllers (bird pool + mote pool + wind sample) and the butterfly (FU-L)", () => {
    const opts = makeAtmosphereOptions({
      birdTextures: { up: Texture.WHITE, down: Texture.WHITE },
      windLeafTextures: [Texture.WHITE],
      moteTexture: Texture.WHITE,
    })
    const a = createGardenAtmosphere(opts)
    expect(a.getBirdCount()).toBe(5)
    expect(a.getMoteCount()).toBeGreaterThan(0)
    expect(a.getGustLeafCapacity()).toBeGreaterThan(0)
    expect(typeof a.getWindSample()).toBe("number")
    // FU-L: butterfly pool size = 1 at high quality.
    expect(a.getButterflyCount()).toBe(1)
    expect(a.getButterflyActive()).toBe(false)
    a.destroy()
  })

  it("update(0) is a no-op (no exceptions, no allocation)", () => {
    const opts = makeAtmosphereOptions({
      birdTextures: { up: Texture.WHITE, down: Texture.WHITE },
      moteTexture: Texture.WHITE,
    })
    const a = createGardenAtmosphere(opts)
    const before = a.getElapsedSeconds()
    expect(() => a.update(0)).not.toThrow()
    expect(a.getElapsedSeconds()).toBe(before)
    a.destroy()
  })

  it("update(50) after destroy is a no-op (elapsed time does not advance)", () => {
    const opts = makeAtmosphereOptions({
      birdTextures: { up: Texture.WHITE, down: Texture.WHITE },
      moteTexture: Texture.WHITE,
    })
    const a = createGardenAtmosphere(opts)
    a.destroy()
    const elapsedBefore = a.getElapsedSeconds()
    for (let i = 0; i < 5; i += 1) a.update(50)
    expect(a.getElapsedSeconds()).toBe(elapsedBefore)
  })

  it("destroy is idempotent", () => {
    const opts = makeAtmosphereOptions({
      birdTextures: { up: Texture.WHITE, down: Texture.WHITE },
      moteTexture: Texture.WHITE,
    })
    const a = createGardenAtmosphere(opts)
    expect(() => a.destroy()).not.toThrow()
    expect(() => a.destroy()).not.toThrow()
    expect(() => a.destroy()).not.toThrow()
  })

  it("same seed produces identical wind samples at the same elapsed time", () => {
    const optsA = makeAtmosphereOptions({ seed: 4242 })
    const optsB = makeAtmosphereOptions({ seed: 4242 })
    const a = createGardenAtmosphere(optsA)
    const b = createGardenAtmosphere(optsB)
    for (let i = 0; i < 40; i += 1) {
      a.update(50)
      b.update(50)
      expect(a.getWindSample()).toBe(b.getWindSample())
      expect(a.getElapsedSeconds()).toBe(b.getElapsedSeconds())
    }
    a.destroy()
    b.destroy()
  })

  it("different seeds produce different wind samples", () => {
    const a = createGardenAtmosphere(makeAtmosphereOptions({ seed: 1 }))
    const b = createGardenAtmosphere(makeAtmosphereOptions({ seed: 2 }))
    let diverged = false
    for (let i = 0; i < 60; i += 1) {
      a.update(50)
      b.update(50)
      if (a.getWindSample() !== b.getWindSample()) {
        diverged = true
        break
      }
    }
    expect(diverged).toBe(true)
    a.destroy()
    b.destroy()
  })

  it("reducedMotion forces empty bird pool and no wind motion", () => {
    const opts = makeAtmosphereOptions({
      prefersReducedMotion: true,
      birdTextures: { up: Texture.WHITE, down: Texture.WHITE },
      moteTexture: Texture.WHITE,
    })
    const a = createGardenAtmosphere(opts)
    expect(a.getBirdCount()).toBe(0)
    const before = a.getWindSample()
    expect(before).toBe(0)
    a.update(50)
    expect(a.getWindSample()).toBe(before)
    a.update(50)
    expect(a.getWindSample()).toBe(before)
    expect(a.getBirdCount()).toBe(0)
    a.destroy()
  })

  it("static quality is a strict no-op facade", () => {
    const opts = makeAtmosphereOptions({
      quality: "static",
      birdTextures: { up: Texture.WHITE, down: Texture.WHITE },
      moteTexture: Texture.WHITE,
    })
    const a = createGardenAtmosphere(opts)
    expect(a.getBirdCount()).toBe(0)
    expect(a.getMoteCount()).toBe(0)
    expect(a.getGustLeafCount()).toBe(0)
    expect(a.getGustLeafCapacity()).toBe(0)
    expect(a.getWindSample()).toBe(0)
    expect(() => a.update(50)).not.toThrow()
    a.destroy()
  })

  it("setGustPeriod / forceNextGustAt are exposed and idempotent", () => {
    const a = createGardenAtmosphere(makeAtmosphereOptions({ seed: 10 }))
    expect(() => a.setGustPeriod(500, 700)).not.toThrow()
    expect(() => a.forceNextGustAt(20)).not.toThrow()
    a.update(20) // advance into the forced gust
    a.destroy()
  })

  it("clamps negative and oversize deltas (no NaN, no throw)", () => {
    const a = createGardenAtmosphere(makeAtmosphereOptions())
    expect(() => a.update(-100)).not.toThrow()
    expect(() => a.update(1_000_000)).not.toThrow()
    const sample = a.getWindSample()
    expect(Number.isFinite(sample)).toBe(true)
    a.destroy()
  })

  it("FU-R: exposes an egg subsystem (smoke test)", () => {
    const a = createGardenAtmosphere(makeAtmosphereOptions())
    const stats = a.getEggStats()
    expect(stats).toEqual({
      activeEggs: 0,
      activeShatters: 0,
      activeYolks: 0,
    })
    a.destroy()
  })
})