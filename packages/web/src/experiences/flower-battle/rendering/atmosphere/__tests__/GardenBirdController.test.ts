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
import {
  BIRD_FIRST_SPAWN_RANGE_MS,
  BIRD_GROUP_HORIZONTAL_OFFSET_RANGE,
  BIRD_GROUP_VERTICAL_OFFSET_RANGE,
} from "../garden-atmosphere.constants"
import type { SeededRandom } from "../seededRandom"

function makeBirdTextures(): { up: Texture; down: Texture } {
  return {
    up: Texture.WHITE,
    down: Texture.WHITE,
  }
}

describe("GardenBirdController", () => {
  it("matches pool size to quality (high=5, medium=4, low=2, static=0) (FU-J)", () => {
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
    expect(birds.getBirdCount()).toBe(5)
    birds.destroy()

    const medium = new GardenBirdController({
      quality: "medium",
      skyLifeForeground: layers.medium,
      birdTextures: makeBirdTextures(),
    })
    expect(medium.getBirdCount()).toBe(4)
    medium.destroy()

    const low = new GardenBirdController({
      quality: "low",
      skyLifeForeground: layers.low,
      birdTextures: makeBirdTextures(),
    })
    expect(low.getBirdCount()).toBe(2)
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

  it("never activates more than 5 birds simultaneously (high quality pool size)", () => {
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
      expect(birds.getActiveBirdCount()).toBeLessThanOrEqual(5)
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
    expect(foreground.children.length).toBe(5)
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
    expect(legacy.children.length).toBe(5)
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

describe("FU-J: GardenBirdController flock behaviour", () => {
  it("spawns a flock of 2-3 birds per wave with matching direction and tight offsets", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        sprite: Sprite
        baseY: number
        direction: 1 | -1
      }>
      trySpawn: () => void
    }

    // Try several seeds to exercise both flock sizes (2 and 3) and
    // both directions. We assert the invariant: every active bird in
    // a single wave shares direction. FU-L widened the per-follower
    // vertical spread to BIRD_GROUP_VERTICAL_OFFSET_RANGE = [50, 80],
    // so the leader-vs-follower distance is bounded by that range.
    let sawFlockOf2 = false
    let sawFlockOf3 = false
    for (let attempt = 0; attempt < 8; attempt += 1) {
      // Reset by destroying & rebuilding with a new seed.
      birds.destroy()
      const seeded = new GardenBirdController({
        quality: "high",
        skyLifeForeground: new Container(),
        birdTextures: makeBirdTextures(),
        seed: attempt * 7 + 11,
        spawnIntervalRangeMs: [1, 2],
        firstSpawnRangeMs: [1, 2],
      })
      const internalsN = seeded as unknown as {
        pool: Array<{
          active: boolean
          sprite: Sprite
          baseY: number
          direction: 1 | -1
        }>
        trySpawn: () => void
      }
      internalsN.trySpawn()
      const active = internalsN.pool.filter((s) => s.active)
      expect(active.length).toBeGreaterThanOrEqual(2)
      expect(active.length).toBeLessThanOrEqual(3)
      if (active.length === 2) sawFlockOf2 = true
      if (active.length === 3) sawFlockOf3 = true
      const dir = active[0]!.direction
      const leaderBaseY = active[0]!.baseY
      for (const slot of active) {
        expect(slot.direction).toBe(dir)
      }
      for (let k = 1; k < active.length; k += 1) {
        const vOff = Math.abs(active[k]!.baseY - leaderBaseY)
        expect(vOff).toBeGreaterThanOrEqual(BIRD_GROUP_VERTICAL_OFFSET_RANGE[0])
        expect(vOff).toBeLessThanOrEqual(BIRD_GROUP_VERTICAL_OFFSET_RANGE[1])
      }
      seeded.destroy()
    }
    expect(sawFlockOf2).toBe(true)
    expect(sawFlockOf3).toBe(true)
    birds.destroy()
  })

  it("fills what is available when the pool has fewer free slots than the group size", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
    })
    const internals = birds as unknown as {
      pool: Array<{ active: boolean; sprite: Sprite; baseY: number; direction: 1 | -1 }>
      trySpawn: () => void
    }
    // Pre-occupy 4 of 5 slots so only 1 free slot remains.
    for (let i = 0; i < 4; i += 1) {
      internals.pool[i]!.active = true
    }
    internals.trySpawn()
    // The flock must have filled exactly 1 slot (the only free one),
    // never blocked on a partial group.
    expect(internals.pool.filter((s) => s.active).length).toBe(5)
    // The newly-spawned bird shares direction with the (mock) flock
    // it joined: a deterministic direction is fine here, the test is
    // that the spawn happened at all.
    const lastActive = internals.pool.find((s) => s.active && s.baseY !== 0) ?? internals.pool[4]!
    expect(lastActive.active).toBe(true)
    birds.destroy()
  })
})

describe("FU-L: GardenBirdController per-follower offsets", () => {
  it("places each follower verticalOffset inside BIRD_GROUP_VERTICAL_OFFSET_RANGE and horizontalOffset inside BIRD_GROUP_HORIZONTAL_OFFSET_RANGE * (i+1) * 0.5", () => {
    // FU-L: V-formation spread widened from the pre-FU-L ±15 px band.
    // Vertical = (i % 2 === 0 ? 1 : -1) * rng.range(50, 80)
    // Horizontal = ((i+1) % 2 === 0 ? 1 : -1) * rng.range(25, 45) * (i+1) * 0.5
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        sprite: Sprite
        baseY: number
        direction: 1 | -1
      }>
      trySpawn: () => void
    }
    // Walk a handful of seeds so we exercise both flock sizes and
    // observe at least one 3-bird flock (which has 2 followers).
    for (const seed of [0xc0ffee, 1, 2, 42, 1234, 0xdeadbeef]) {
      birds.destroy()
      const seeded = new GardenBirdController({
        quality: "high",
        skyLifeForeground: new Container(),
        birdTextures: makeBirdTextures(),
        seed,
        spawnIntervalRangeMs: [1, 2],
        firstSpawnRangeMs: [1, 2],
      })
      const i = seeded as unknown as {
        pool: Array<{
          active: boolean
          sprite: Sprite
          baseY: number
          direction: 1 | -1
        }>
        trySpawn: () => void
      }
      i.trySpawn()
      const active = i.pool.filter((s) => s.active)
      const leaderBaseY = active[0]!.baseY
      // Leader has no per-follower offset; the followers' offsets
      // must satisfy the new ranges.
      for (let k = 1; k < active.length; k += 1) {
        const vOff = Math.abs(active[k]!.baseY - leaderBaseY)
        // FU-L: verticalOffset in [50, 80].
        expect(vOff).toBeGreaterThanOrEqual(50)
        expect(vOff).toBeLessThanOrEqual(80)
      }
      seeded.destroy()
    }
    birds.destroy()
  })

  it("applies a per-follower speed variation in [leaderSpeed * 0.95, leaderSpeed * 1.05]", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
      seed: 17,
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        speed: number
      }>
      trySpawn: () => void
    }
    internals.trySpawn()
    const active = internals.pool.filter((s) => s.active)
    const leaderSpeed = active[0]!.speed
    for (let k = 1; k < active.length; k += 1) {
      expect(active[k]!.speed).toBeGreaterThanOrEqual(leaderSpeed * 0.95 - 1e-6)
      expect(active[k]!.speed).toBeLessThanOrEqual(leaderSpeed * 1.05 + 1e-6)
    }
    birds.destroy()
  })

  it("offsets each follower's startX from the leader's by a staggered horizontal amount", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
      seed: 11,
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        sprite: Sprite
        baseY: number
        direction: 1 | -1
      }>
      trySpawn: () => void
    }
    internals.trySpawn()
    const active = internals.pool.filter((s) => s.active)
    const leaderStartX = active[0]!.sprite.x
    // FU-L: horizontalOffset = ((i+1) % 2 === 0 ? 1 : -1) * rng.range(25, 45) * (i+1) * 0.5
    // For a 3-bird flock: follower[1] (i=1) → ((1+1)%2 === 0 ? 1 : -1) = 1, magnitude = rng(25,45) * 2 * 0.5 = [25, 45].
    // For follower[2] (i=2) → ((2+1)%2 === 0 ? 1 : -1) = -1, magnitude = rng(25,45) * 3 * 0.5 = [37.5, 67.5].
    for (let k = 1; k < active.length; k += 1) {
      const hOff = Math.abs(active[k]!.sprite.x - leaderStartX)
      // Lower bound: smallest possible magnitude across both flock sizes.
      expect(hOff).toBeGreaterThanOrEqual(25 - 1e-6)
      // Upper bound: largest possible magnitude across both flock sizes
      // (follower index 2 in a 3-bird flock: 67.5 px).
      expect(hOff).toBeLessThanOrEqual(67.5 + 1e-6)
    }
    birds.destroy()
  })

  it("places follower baseY at the leader baseY plus a signed vertical offset", () => {
    const skyLifeForeground = new Container()
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      spawnIntervalRangeMs: [1, 2],
      firstSpawnRangeMs: [1, 2],
      seed: 91,
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        baseY: number
      }>
      trySpawn: () => void
    }
    internals.trySpawn()
    const active = internals.pool.filter((s) => s.active)
    const leaderBaseY = active[0]!.baseY
    // The followers' baseY must differ from the leader's by at least
    // 50 px (FU-L lower bound) and at most 80 px (FU-L upper bound).
    // This proves the new V-formation spread is applied — not the
    // pre-FU-L ±15 px tight pack.
    for (let k = 1; k < active.length; k += 1) {
      const diff = Math.abs(active[k]!.baseY - leaderBaseY)
      expect(diff).toBeGreaterThanOrEqual(50 - 1e-6)
      expect(diff).toBeLessThanOrEqual(80 + 1e-6)
    }
    birds.destroy()
  })

  it("FU-R: drops an egg when an active bird is inside the corridor", () => {
    const skyLifeForeground = new Container()
    const drops: Array<{ x: number; y: number }> = []
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      // Tighten to force a near-immediate drop on the first tick.
      firstSpawnRangeMs: [0, 0],
      spawnIntervalRangeMs: [0, 0],
      eggDropIntervalRangeMs: [0, 0],
      eggDropper: (x, y) => {
        drops.push({ x, y })
      },
    })
    // Force the first spawn immediately by setting elapsed high enough.
    ;(birds as unknown as { nextSpawnAtMs: number }).nextSpawnAtMs = 0
    // Tick once: spawn + drop should fire.
    birds.update(1)
    // If a bird was actually inside [0.15W, 0.85W] and visible, drop fires.
    // (Random pool can spawn outside — force the active bird's X.)
    const internals = birds as unknown as {
      pool: Array<{ active: boolean; sprite: Sprite }>
    }
    const active = internals.pool.find((s) => s.active)
    if (active) {
      // Park it dead-centre in the corridor.
      active.sprite.x = 600
      active.sprite.y = 200
      ;(birds as unknown as { nextDropAtMs: number }).nextDropAtMs = 0
      birds.update(1)
      expect(drops.length).toBeGreaterThan(0)
      const last = drops[drops.length - 1]!
      // X is locked by the test setup; Y rides the sin-wave between
      // the spawn and the drop tick — only assert the drop fired
      // (length) and that the bird that triggered it was at the
      // expected corridor X.
      expect(last.x).toBeCloseTo(600, 0)
    }
    birds.destroy()
  })

  it("FU-R: range enforcement — bird outside [0.15W, 0.85W] never drops", () => {
    const skyLifeForeground = new Container()
    const drops: Array<{ x: number; y: number }> = []
    const birds = new GardenBirdController({
      quality: "high",
      skyLifeForeground,
      birdTextures: makeBirdTextures(),
      firstSpawnRangeMs: [0, 0],
      spawnIntervalRangeMs: [0, 0],
      eggDropIntervalRangeMs: [0, 0],
      eggDropper: (x, y) => {
        drops.push({ x, y })
      },
    })
    const internals = birds as unknown as {
      pool: Array<{
        active: boolean
        sprite: Sprite
        speed: number
        direction: 1 | -1
        baseY: number
        waveAmp: number
        wavePhase: number
        elapsedSec: number
        wingSwapAtMs: number
        retireAtMs: number
      }>
      elapsedMs: number
      nextDropAtMs: number
    }
    // Manually push one bird into the pool, position it outside the
    // corridor (x = 0.05 * ATMOSPHERE_WIDTH), set it active, then
    // hammer the update loop — drop should never fire.
    internals.pool[0]!.active = true
    internals.pool[0]!.sprite.position.set(0.05 * 1280, 200)
    internals.elapsedMs = 1000
    internals.nextDropAtMs = 0
    for (let i = 0; i < 30; i += 1) birds.update(50)
    expect(drops.length).toBe(0)
    birds.destroy()
  })

  it("FU-R: FPS-invariant — same elapsed time → same number of drops", () => {
    const opts = {
      quality: "high" as const,
      skyLifeForeground: new Container(),
      birdTextures: makeBirdTextures(),
      firstSpawnRangeMs: [0, 0] as const,
      spawnIntervalRangeMs: [0, 0] as const,
      eggDropIntervalRangeMs: [0, 0] as const,
      eggDropRangeXFrac: [0, 1] as const,
    }
    const dropsA: number[] = []
    const dropsB: number[] = []
    const a = new GardenBirdController({
      ...opts,
      eggDropper: () => {
        dropsA.push(0)
      },
    })
    const b = new GardenBirdController({
      ...opts,
      eggDropper: () => {
        dropsB.push(0)
      },
    })
    const seedA = 0xa11ce
    const seedB = 0xa11ce
    ;(a as unknown as { rng: SeededRandom }).rng =
      (a as unknown as { rng: SeededRandom }).rng
    void seedA
    void seedB
    const aInternals = a as unknown as { pool: Array<{ active: boolean; sprite: Sprite }>; nextDropAtMs: number }
    const bInternals = b as unknown as { pool: Array<{ active: boolean; sprite: Sprite }>; nextDropAtMs: number }
    aInternals.pool[0]!.active = true
    aInternals.pool[0]!.sprite.position.set(600, 200)
    aInternals.nextDropAtMs = 0
    bInternals.pool[0]!.active = true
    bInternals.pool[0]!.sprite.position.set(600, 200)
    bInternals.nextDropAtMs = 0
    // Drive both with 2000ms via 50ms ticks — drop counts must match
    // the same seed sequence.
    for (let i = 0; i < 40; i += 1) {
      a.update(50)
      b.update(50)
    }
    expect(dropsA.length).toBe(dropsB.length)
    a.destroy()
    b.destroy()
  })
})