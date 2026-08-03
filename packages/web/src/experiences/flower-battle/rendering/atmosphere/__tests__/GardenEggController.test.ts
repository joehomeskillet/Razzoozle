/**
 * Garden egg controller tests (FU-R).
 *
 * Verifies:
 *   - Constructor wires the three pools + their dedicated containers.
 *   - `spawn(birdX, birdY)` creates an active egg and positions it.
 *   - `update(dt)` integrates gravity; on impact the egg is released
 *     and shell pieces + yolk splat slots are acquired.
 *   - `destroy()` empties every pool and detaches the sprites.
 */

import { Container } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenEggController } from "../GardenEggController"
import {
  EGG_POOL_SIZE,
  EGG_SHATTER_POOL_SIZE,
  EGG_SHATTER_PIECE_COUNT_RANGE,
  EGG_SHELL_FADE_DURATION_RANGE,
  EGG_YOLK_POOL_SIZE,
  EGG_IMPACT_Y_FRACTION,
  ATMOSPHERE_HEIGHT,
} from "../garden-atmosphere.constants"

function makeEggController(seed = 0xe99) {
  const egg = new Container()
  const shatter = new Container()
  const yolk = new Container()
  const c = new GardenEggController({
    eggContainer: egg,
    shatterContainer: shatter,
    yolkContainer: yolk,
    seed,
  })
  return { c, egg, shatter, yolk }
}

describe("GardenEggController", () => {
  it("constructor populates all three pools and mounts their sprites", () => {
    const { c, egg, shatter, yolk } = makeEggController()
    expect(egg.children.length).toBeGreaterThan(0)
    expect(egg.children.length).toBe(EGG_POOL_SIZE)
    expect(shatter.children.length).toBe(EGG_SHATTER_POOL_SIZE)
    expect(yolk.children.length).toBe(EGG_YOLK_POOL_SIZE)
    c.destroy()
  })

  it("bakes the main yolk at 24×9 with a darker amber rim", () => {
    const { c, yolk } = makeEggController()
    const main = yolk.children[0]!
    expect(main.texture.source.width).toBe(24)
    expect(main.texture.source.height).toBe(9)
    const resource = main.texture.source.resource as Uint8Array
    const colors = new Set<string>()
    for (let i = 0; i < resource.length; i += 4) {
      if (resource[i + 3] === 0) continue
      colors.add(`${resource[i]},${resource[i + 1]},${resource[i + 2]}`)
    }
    expect(colors).toContain("244,162,97")
    expect(colors).toContain("217,122,58")
    c.destroy()
  })

  it("spawn positions the egg at (birdX, birdY) and marks it active", () => {
    const { c, egg } = makeEggController()
    c.spawn(120, 50)
    const stats = c.getStats()
    expect(stats.activeEggs).toBe(1)
    const visible = egg.children.filter((s) => s.visible)
    expect(visible.length).toBe(1)
    expect(visible[0]!.visible).toBe(true)
    expect(visible[0]!.alpha).toBe(1)
    // FU-V: cubist egg canvas bake is exactly 18×18; sprite is scaled 1.5×
    // for a visible 27 logical-px egg (FU-U: 3× the original 6×6).
    expect(visible[0]!.texture.source.width).toBe(18)
    expect(visible[0]!.texture.source.height).toBe(18)
    expect(visible[0]!.width).toBe(27)
    expect(visible[0]!.height).toBe(27)
    expect(visible[0]!.x).toBe(120)
    expect(visible[0]!.y).toBe(50)
    c.destroy()
  })

  it("update integrates gravity and triggers shatter on impact", () => {
    const { c } = makeEggController()
    c.spawn(120, 10)
    const internals = c as unknown as { eggPool: Array<{ impactY: number; y: number }> }
    internals.eggPool[0]!.impactY = 12
    c.update(500)
    const stats = c.getStats()
    expect(stats.activeEggs).toBe(0)
    expect(stats.activeShatters).toBeGreaterThan(0)
    expect(stats.activeYolks).toBeGreaterThan(0)
    c.destroy()
  })

  it("falls back to ATMOSPHERE_HEIGHT × EGG_IMPACT_Y_FRACTION when no anchors", () => {
    const { c } = makeEggController()
    c.spawn(120, 0)
    const internals = c as unknown as {
      eggPool: Array<{ impactY: number }>
    }
    expect(internals.eggPool[0]!.impactY).toBeCloseTo(
      ATMOSPHERE_HEIGHT * EGG_IMPACT_Y_FRACTION,
      5,
    )
    c.destroy()
  })

  it("uses the closest flower anchor's y as impactY when anchors are present", () => {
    const egg = new Container()
    const shatter = new Container()
    const yolk = new Container()
    const c = new GardenEggController({
      eggContainer: egg,
      shatterContainer: shatter,
      yolkContainer: yolk,
      flowerAnchors: [
        { x: 100, y: 220 },
        { x: 500, y: 260 },
        { x: 900, y: 200 },
      ],
    })
    c.spawn(495, 10)
    const internals = c as unknown as { eggPool: Array<{ impactY: number }> }
    expect(internals.eggPool[0]!.impactY).toBe(260)
    c.destroy()
  })

  it("spawn respects the configured piece count range", () => {
    const { c } = makeEggController(0x1234)
    c.spawn(0, 0)
    const internals = c as unknown as { eggPool: Array<{ impactY: number; y: number }> }
    internals.eggPool[0]!.impactY = 0
    c.update(500)
    const stats = c.getStats()
    const [min, max] = EGG_SHATTER_PIECE_COUNT_RANGE
    expect(stats.activeShatters).toBeGreaterThanOrEqual(min)
    expect(stats.activeShatters).toBeLessThanOrEqual(max)
    c.destroy()
  })

  it("destroy() empties pools and detaches sprites", () => {
    const { c, egg, shatter, yolk } = makeEggController()
    c.destroy()
    expect(egg.children.length).toBe(0)
    expect(shatter.children.length).toBe(0)
    expect(yolk.children.length).toBe(0)
  })

  it("shell pieces and yolk splats fade out over their duration", () => {
    const { c } = makeEggController()
    c.spawn(120, 0)
    const internals = c as unknown as { eggPool: Array<{ impactY: number; y: number }> }
    internals.eggPool[0]!.impactY = 0
    c.update(16)
    let stats = c.getStats()
    expect(stats.activeShatters).toBeGreaterThan(0)
    for (let i = 0; i < 200; i += 1) c.update(50)
    stats = c.getStats()
    expect(stats.activeShatters).toBe(0)
    expect(stats.activeYolks).toBe(0)
    c.destroy()
  })

  it("FU-T: shell fade duration range is [4.0, 10.0] seconds", () => {
    expect(EGG_SHELL_FADE_DURATION_RANGE[0]).toBe(4.0)
    expect(EGG_SHELL_FADE_DURATION_RANGE[1]).toBe(10.0)
  })

  it("FU-V (SHARD-V): shard pool is EGG_SHATTER_POOL_SIZE and at least one shard texture source is >= 18 px wide", () => {
    const { c, shatter } = makeEggController()
    expect(shatter.children.length).toBe(EGG_SHATTER_POOL_SIZE)
    const widths = shatter.children.map(
      (s) => (s as unknown as { texture: { source: { width: number } } })
        .texture.source.width,
    )
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(18)
    c.destroy()
  })

  it("FU-V (SHARD-V): triggerShatter samples per-piece scale across the widened [0.7, 1.3] range", () => {
    const { c, shatter } = makeEggController(0x5eed)
    // Force every pool slot active so we get one piece per spawn slot
    // for the widest possible sample.
    const internals = c as unknown as { eggPool: Array<{ impactY: number; y: number }> }
    for (let i = 0; i < EGG_SHATTER_POOL_SIZE; i += 1) {
      c.spawn(10 + i * 5, 0)
      internals.eggPool[internals.eggPool.length - 1]!.impactY = 0
      c.update(500)
    }
    const active = shatter.children
      .map((s) => s as unknown as { scale: { x: number; y: number }; visible: boolean })
      .filter((s) => s.visible)
    expect(active.length).toBeGreaterThan(0)
    const scalesX = active.map((s) => s.scale.x)
    // Wider than the original [0.7, 1.0] cap → at least one piece must
    // exceed 1.0 to prove the range was widened.
    expect(Math.max(...scalesX)).toBeGreaterThan(1.0)
    expect(Math.min(...scalesX)).toBeGreaterThanOrEqual(0.7)
    expect(Math.max(...scalesX)).toBeLessThanOrEqual(1.3)
    c.destroy()
  })
})
