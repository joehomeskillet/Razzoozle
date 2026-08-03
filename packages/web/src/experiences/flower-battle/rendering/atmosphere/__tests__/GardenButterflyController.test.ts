/**
 * Garden butterfly controller tests (FU-Q — 6-slot procedural pool).
 *
 * Pool size = 6 (was 1). Each slot draws its `typeId` from a
 * Fisher-Yates-shuffled bag of all 8 butterfly types (Tagfalter,
 * Schwalbenschwanz, Monarchfalter, Tagpfauenauge, Bläuling,
 * Zitronenfalter, Hochzeit-Mantel, Glasflügler). The first 6 picks
 * are 6 distinct types (Fisher-Yates over a deck of unique items).
 * Each slot runs the FU-O cubic-Bezier path with a per-type
 * `flapFreqHz` driving the texture-swap cadence.
 */

import { Container, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import {
  GardenButterflyController,
  type ButterflySlot,
} from "../GardenButterflyController"
import {
  type BakeFramePair,
  bakeButterflyTextures,
  clearButterflyTextureCache,
  getButterflyTextureCacheSource,
} from "../ButterflyTypeBake"
import { BUTTERFLY_TYPES } from "../ButterflyTypeGenerator"
import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  BUTTERFLY_BASE_Y_RANGE,
  BUTTERFLY_POOL_SIZE,
  BUTTERFLY_TYPE_POOL,
} from "../garden-atmosphere.constants"

const STUB_BODY_COLOR = 0xff9900

function makeButterfly(quality: "high" | "medium" | "low" | "static") {
  return new GardenButterflyController({
    quality,
    ambient: new Container(),
    bodyColor: STUB_BODY_COLOR,
  })
}

describe("GardenButterflyController (FU-Q 6-slot pool)", () => {
  it("exposes capacity = BUTTERFLY_POOL_SIZE (6) at high quality", () => {
    const c = makeButterfly("high")
    expect(BUTTERFLY_POOL_SIZE).toBe(6)
    expect(c.getCapacity()).toBe(6)
    expect(c.getActiveCount()).toBe(0)
    c.destroy()
  })

  it("leaves the pool empty at lower qualities (FU-Q gate)", () => {
    for (const q of ["medium", "low", "static"] as const) {
      const c = makeButterfly(q)
      expect(c.getCapacity()).toBe(0)
      expect(c.getActiveCount()).toBe(0)
      expect(c.getSprites().length).toBe(0)
      c.destroy()
    }
  })

  it("leaves the pool empty under reducedMotion", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      reducedMotion: true,
      bodyColor: STUB_BODY_COLOR,
    })
    expect(c.getCapacity()).toBe(0)
    expect(c.getSprites().length).toBe(0)
    c.destroy()
  })

  it("BUTTERFLY_TYPE_POOL is 8 (FU-Q schema size)", () => {
    expect(BUTTERFLY_TYPE_POOL).toBe(8)
    expect(BUTTERFLY_TYPES).toHaveLength(8)
  })

  it("mounts 6 sprites in the ambient container at high quality", () => {
    const ambient = new Container()
    const c = new GardenButterflyController({
      quality: "high",
      ambient,
      bodyColor: STUB_BODY_COLOR,
    })
    const sprites = c.getSprites()
    expect(sprites).toHaveLength(6)
    for (let i = 0; i < sprites.length; i += 1) {
      const spr = sprites[i]!
      expect(ambient.children).toContain(spr)
      expect(spr).toBeInstanceOf(Sprite)
      // Tint matches the slot's type-config body color (from
      // BUTTERFLY_TYPES[i].bodyColor) — the per-type colours are
      // baked into the silhouette; the legacy single-color body
      // option is only used as the Texture.WHITE tint-rotation
      // fallback.
      const slot = c.getSlots()[i]!
      expect(spr.tint).toBe(slot.config.bodyColor)
      // Visible sprite width must land in Plan §7.2's 24–44 px band.
      expect(spr.width).toBeGreaterThanOrEqual(24)
      expect(spr.width).toBeLessThanOrEqual(44)
    }
    c.destroy()
  })

  it("BUTTERFLY_TYPES — 8 entries with valid drawWings", () => {
    for (const config of BUTTERFLY_TYPES) {
      expect(typeof config.drawWings).toBe("function")
      // id is one of 0..7.
      expect(config.id).toBeGreaterThanOrEqual(0)
      expect(config.id).toBeLessThan(8)
      // Each entry has a name, color triple, and frequency.
      expect(config.name.length).toBeGreaterThan(0)
      expect(config.flapFreqHz).toBeGreaterThan(0)
      expect(config.bodyColor).toBeGreaterThan(0)
      expect(config.wingColor).toBeGreaterThan(0)
    }
  })

  it("renders each type's drawWings via the renderer without throwing", () => {
    const calls: { id: number; label: string }[] = []
    const upTex = Texture.from(
      { resource: new Uint8Array(36 * 28 * 4), width: 36, height: 28 },
      true,
    )
    const downTex = Texture.from(
      { resource: new Uint8Array(36 * 28 * 4), width: 36, height: 28 },
      true,
    )
    clearButterflyTextureCache()
    const renderer = {
      generateTexture(_g: Container, label: string): Texture {
        calls.push({ id: calls.length, label })
        return label === "up" ? upTex : downTex
      },
    }
    bakeButterflyTextures(renderer)
    // 16 frames baked: 8 types × 2 frames.
    expect(calls).toHaveLength(16)
    const sourceMap = getButterflyTextureCacheSource()
    for (const config of BUTTERFLY_TYPES) {
      expect(sourceMap.get(config.id)).toBe("renderer")
    }
    expect(clearButterflyTextureCache).toBeDefined()
  })

  it("slot.typeId variety — Fisher-Yates guarantees at least 4 distinct types in pool of 6 (seed 0xC0FFEE)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      seed: 0xc0ffee,
      bodyColor: STUB_BODY_COLOR,
    })
    const typeIds = c.getSlotTypeIds()
    expect(typeIds).toHaveLength(6)
    const distinct = new Set(typeIds)
    // First 6 draws from a Fisher-Yates shuffle of [0..7] yield 6
    // distinct ids. The brief asks for ≥ 4 distinct; we assert the
    // full 6 because the deck is unique.
    expect(distinct.size).toBeGreaterThanOrEqual(4)
    expect(distinct.size).toBe(6)
    c.destroy()
  })

  it("slot variety is invariant across seeds (Bag-RNG guarantees 6 distinct ids regardless of seed)", () => {
    for (const seed of [0xc0ffee, 1, 2, 42, 1234, 99_999]) {
      const c = new GardenButterflyController({
        quality: "high",
        ambient: new Container(),
        seed,
        bodyColor: STUB_BODY_COLOR,
      })
      const distinct = new Set(c.getSlotTypeIds())
      expect(distinct.size).toBe(6)
      c.destroy()
    }
  })

  it("each slot's config matches its typeId", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      seed: 0xc0ffee,
      bodyColor: STUB_BODY_COLOR,
    })
    for (const slot of c.getSlots()) {
      expect(slot.config.id).toBe(slot.typeId)
      expect(BUTTERFLY_TYPES[slot.typeId]).toBe(slot.config)
    }
    c.destroy()
  })

  it("getSlots() returns 6 slots with distinct sprites", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
    })
    const slots = c.getSlots() as readonly ButterflySlot[]
    expect(slots).toHaveLength(6)
    const sprites = new Set(slots.map((s) => s.sprite))
    expect(sprites.size).toBe(6)
    for (const slot of slots) {
      expect(slot.sprite).toBeInstanceOf(Sprite)
      expect(slot.segments.length).toBeGreaterThanOrEqual(1)
      expect(slot.waypoints.length).toBeGreaterThanOrEqual(1)
    }
    c.destroy()
  })

  it("clears every sprite from ambient on destroy", () => {
    const ambient = new Container()
    const c = new GardenButterflyController({
      quality: "high",
      ambient,
      bodyColor: STUB_BODY_COLOR,
    })
    expect(ambient.children.length).toBe(6)
    c.destroy()
    expect(ambient.children).toHaveLength(0)
  })

  it("destroy is idempotent", () => {
    const c = makeButterfly("high")
    c.destroy()
    expect(() => c.destroy()).not.toThrow()
  })

  it("fallback path — every slot uses Texture.WHITE in the no-DOM test env", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
    })
    expect(c.getUsedFallback()).toBe(true)
    for (const slot of c.getSlots()) {
      expect(slot.textures.up).toBe(Texture.WHITE)
      expect(slot.textures.down).toBe(Texture.WHITE)
    }
    c.destroy()
  })

  it("each slot has 2 antennae via getAntennaeCount()", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
    })
    expect(c.getAntennaeCount()).toBe(2)
    expect(c.getFrameCount()).toBe(2)
    c.destroy()
  })

  it("remains inactive until the first-spawn timer elapses", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [10_000, 15_000],
    })
    c.update(50)
    expect(c.getIsAlive()).toBe(false)
    expect(c.getActiveCount()).toBe(0)
    c.destroy()
  })

  it("becomes active once the first-spawn timer elapses", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [80, 120],
    })
    c.update(50)
    expect(c.getIsAlive()).toBe(false)
    for (let i = 0; i < 4; i += 1) c.update(100)
    expect(c.getIsAlive()).toBe(true)
    expect(c.getActiveCount()).toBe(6)
    c.destroy()
  })

  it("reducedMotion update is a no-op", () => {
    const ambient = new Container()
    const c = new GardenButterflyController({
      quality: "high",
      ambient,
      reducedMotion: true,
      bodyColor: STUB_BODY_COLOR,
    })
    const before = ambient.children.length
    for (let i = 0; i < 50; i += 1) c.update(100)
    expect(ambient.children.length).toBe(before)
    expect(c.getActiveCount()).toBe(0)
    c.destroy()
  })

  it("all 6 slots populate segments[0].C0..C3 at construction time (FU-O)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      seed: 1,
    })
    for (const slot of c.getSlots()) {
      const seg = slot.segments[0]!
      expect(Number.isFinite(seg.C0.x)).toBe(true)
      expect(Number.isFinite(seg.C0.y)).toBe(true)
      expect(Number.isFinite(seg.C3.x)).toBe(true)
      expect(Number.isFinite(seg.C3.y)).toBe(true)
      // C0 enters from a screen edge.
      const atLeft = seg.C0.x <= -39
      const atRight = seg.C0.x >= ATMOSPHERE_WIDTH - 39 + 40
      expect(atLeft || atRight).toBe(true)
      // C3 lands inside the yBand.
      expect(seg.C3.y).toBeGreaterThanOrEqual(
        BUTTERFLY_BASE_Y_RANGE[0] * ATMOSPHERE_HEIGHT - 1e-6,
      )
      expect(seg.C3.y).toBeLessThanOrEqual(
        BUTTERFLY_BASE_Y_RANGE[1] * ATMOSPHERE_HEIGHT + 1e-6,
      )
    }
    c.destroy()
  })

  it("updates sprite.x and sprite.y over time (FU-O path runs)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [0, 1],
    })
    c.update(50)
    expect(c.getActiveCount()).toBe(6)
    const samples = c
      .getSlots()
      .map((s) => ({ x: s.sprite.x, y: s.sprite.y }))
    c.update(50)
    for (let i = 0; i < c.getSlots().length; i += 1) {
      const a = samples[i]!
      const slot = c.getSlots()[i]!
      // Path is advancing — at least one coordinate must have
      // changed for at least one slot.
      expect(slot.sprite.x).not.toBe(a.x)
      expect(slot.sprite.y).not.toBe(a.y)
    }
    c.destroy()
  })

  it("cycles frames between up and down on the wing-swap cadence (Texture.WHITE fallback path)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [0, 1],
      wingSwapRangeMs: [40, 60],
    })
    expect(c.getUsedFallback()).toBe(true)
    const seenFrames = new Set<string>()
    const seenTints = new Set<number>()
    for (let i = 0; i < 80; i += 1) {
      c.update(20)
      for (const slot of c.getSlots()) {
        seenFrames.add(slot.currentFrame)
        seenTints.add(slot.sprite.tint)
      }
    }
    expect(seenFrames.has("up")).toBe(true)
    expect(seenFrames.has("down")).toBe(true)
    // Up tint is bodyColor, down tint is darker — at least 2 distinct
    // tints must have cycled.
    expect(seenTints.size).toBeGreaterThanOrEqual(2)
    c.destroy()
  })

  it("destroy: the bake cache is cleared so a re-bind re-bakes fresh", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
    })
    // The bake cache should be populated after construct.
    const before = getButterflyTextureCacheSource().size
    c.destroy()
    expect(before).toBeGreaterThan(0)
    expect(getButterflyTextureCacheSource().size).toBe(0)
  })
})

describe("ButterflyTypeBake (FU-Q)", () => {
  it("Texture.WHITE fallback path — bake returns 8 entries", () => {
    clearButterflyTextureCache()
    const cache: ReadonlyMap<number, BakeFramePair> =
      bakeButterflyTextures()
    expect(cache.size).toBe(8)
    for (const [, entry] of cache) {
      expect(entry.up).toBe(Texture.WHITE)
      expect(entry.down).toBe(Texture.WHITE)
    }
    const sourceMap = getButterflyTextureCacheSource()
    expect(sourceMap.size).toBe(8)
    for (const src of sourceMap.values()) {
      expect(src).toBe("white-fallback")
    }
  })

  it("clearButterflyTextureCache empties the cache", () => {
    bakeButterflyTextures()
    expect(getButterflyTextureCacheSource().size).toBe(8)
    clearButterflyTextureCache()
    expect(getButterflyTextureCacheSource().size).toBe(0)
  })

  it("each BUTTERFLY_TYPE has valid id, name, frequency, colors", () => {
    const ids = new Set<number>()
    for (const config of BUTTERFLY_TYPES) {
      expect(typeof config.name).toBe("string")
      expect(config.name.length).toBeGreaterThan(0)
      expect(config.flapFreqHz).toBeGreaterThan(0)
      expect(ids.has(config.id)).toBe(false)
      ids.add(config.id)
    }
    expect(ids.size).toBe(8)
  })
})
