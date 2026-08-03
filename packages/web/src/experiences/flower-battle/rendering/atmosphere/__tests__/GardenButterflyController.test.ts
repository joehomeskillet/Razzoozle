/**
 * Garden butterfly controller tests.
 *
 * FU-L: Plan §7.2 — a single ambient butterfly, high quality only,
 * Bezier-like waypoint path with sin perturbation.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenButterflyController } from "../GardenButterflyController"
import {
  ATMOSPHERE_HEIGHT,
  BUTTERFLY_BASE_Y_RANGE,
} from "../garden-atmosphere.constants"

const STUB_BODY_COLOR = 0xff9900
const ALT_BODY_COLOR = 0xabcdef

function makeButterfly(quality: "high" | "medium" | "low" | "static") {
  return new GardenButterflyController({
    quality,
    ambient: new Container(),
    bodyColor: STUB_BODY_COLOR,
  })
}

describe("GardenButterflyController", () => {
  it("exposes the canonical controller name and capacity invariant", () => {
    const c = makeButterfly("high")
    expect(c.getControllerName()).toBe("butterfly")
    // FU-L: pool size = 1 (Plan §7.2 "maximal einer").
    expect(c.getCapacity()).toBe(1)
    expect(c.getActiveCount()).toBe(0)
    c.destroy()
  })

  it("leaves the pool empty at lower qualities", () => {
    for (const q of ["medium", "low", "static"] as const) {
      const c = makeButterfly(q)
      expect(c.getCapacity()).toBe(0)
      expect(c.getActiveCount()).toBe(0)
      expect(c.getSprite()).toBeNull()
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
    expect(c.getSprite()).toBeNull()
    c.destroy()
  })

  it("mounts a tinted sprite in the ambient container at high quality", () => {
    const ambient = new Container()
    const c = new GardenButterflyController({
      quality: "high",
      ambient,
      bodyColor: STUB_BODY_COLOR,
    })
    const sprite = c.getSprite()
    expect(sprite).not.toBeNull()
    expect(ambient.children).toContain(sprite)
    expect(sprite).toBeInstanceOf(Sprite)
    // Tint = bodyColor (stubbed to 0xff9900 — `--color-accent`).
    expect(sprite!.tint).toBe(STUB_BODY_COLOR)
    expect(sprite!.width).toBeGreaterThanOrEqual(12)
    expect(sprite!.texture.width).toBeGreaterThanOrEqual(12)
    expect(sprite!.texture.height).toBeGreaterThanOrEqual(8)
    expect(sprite!.scale.x).toBe(1)
    c.destroy()
  })

  it("uses the supplied renderer to bake the butterfly silhouette", () => {
    const generated = Texture.from(
      {
        resource: new Uint8Array(24 * 16 * 4),
        width: 24,
        height: 16,
      },
      true,
    )
    let target: Container | null = null
    const renderer = {
      generateTexture(graphics: Container): Texture {
        target = graphics
        return generated
      },
    }
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      renderer,
    })
    expect(target).toBeInstanceOf(Graphics)
    expect(c.getSprite()!.texture).toBe(generated)
    c.destroy()
  })
  it("clears the sprite from ambient on destroy", () => {
    const ambient = new Container()
    const c = new GardenButterflyController({
      quality: "high",
      ambient,
      bodyColor: STUB_BODY_COLOR,
    })
    const sprite = c.getSprite()
    expect(ambient.children).toContain(sprite)
    c.destroy()
    expect(ambient.children).not.toContain(sprite)
  })

  it("places 5 deterministic waypoints across the canvas", () => {
    for (const seed of [0xc0ffee, 1, 2, 42, 1234]) {
      const c = new GardenButterflyController({
        quality: "high",
        ambient: new Container(),
        seed,
        bodyColor: STUB_BODY_COLOR,
      })
      const wps = c.getWaypoints()
      expect(wps.length).toBe(5)
      // X is interpolated across the canvas (40 px margin on each
      // side); Y is sampled from BUTTERFLY_BASE_Y_RANGE.
      for (const wp of wps) {
        expect(wp.x).toBeGreaterThanOrEqual(40 - 1e-6)
        expect(wp.x).toBeLessThanOrEqual(1920 - 40 + 1e-6)
      }
      c.destroy()
    }
  })

  it("uses the resolved accent color tint (FU-L brief D)", () => {
    // The brief calls out palette.accent (#ff9900 amber). The
    // aggregator passes the resolved value in via `bodyColor`;
    // here we verify a non-default bodyColor round-trips.
    const ambient = new Container()
    const c = new GardenButterflyController({
      quality: "high",
      ambient,
      bodyColor: ALT_BODY_COLOR,
    })
    expect(c.getSprite()!.tint).toBe(ALT_BODY_COLOR)
    c.destroy()
  })

  it("remains inactive until the first-spawn timer elapses", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [10_000, 15_000],
    })
    // Drive a single 50-ms frame; well below the 10-s lower bound.
    c.update(50)
    expect(c.getIsAlive()).toBe(false)
    c.destroy()
  })

  it("becomes active once enough time has elapsed to fire the first spawn", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      // Tight band so the test is fast: first spawn between 80 ms
      // and 120 ms.
      firstSpawnRangeMs: [80, 120],
    })
    // 50 ms < lower bound → still not alive.
    c.update(50)
    expect(c.getIsAlive()).toBe(false)
    // Another 100 ms — total elapsed 150 ms, past the upper bound.
    c.update(100)
    expect(c.getIsAlive()).toBe(true)
    c.destroy()
  })

  it("destroy is idempotent", () => {
    const c = makeButterfly("high")
    c.destroy()
    expect(() => c.destroy()).not.toThrow()
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

  it("waypoint Y values stay within BUTTERFLY_BASE_Y_RANGE * ATMOSPHERE_HEIGHT (FU-L brief D)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      seed: 1,
    })
    const wps = c.getWaypoints()
    for (const wp of wps) {
      expect(wp.y).toBeGreaterThanOrEqual(
        BUTTERFLY_BASE_Y_RANGE[0] * ATMOSPHERE_HEIGHT - 1e-6,
      )
      expect(wp.y).toBeLessThanOrEqual(
        BUTTERFLY_BASE_Y_RANGE[1] * ATMOSPHERE_HEIGHT + 1e-6,
      )
    }
    c.destroy()
  })
})