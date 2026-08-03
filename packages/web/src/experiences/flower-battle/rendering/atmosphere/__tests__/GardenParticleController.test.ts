/**
 * Garden particle controller tests (motes + gust leaves + grass sweep).
 *
 * FU-O (this task): the gust-leaf pool now follows a ballistic motion
 * model — linear drag on vy, rotation-driven lift factor, angular
 * drag, and a stuck-detection that retires leaves that have fallen
 * past 55 % of the canvas height for ≥ 2 s.
 */

import { Container, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenParticleController } from "../GardenParticleController"
import {
  GUST_LEAF_CORAL,
  GUST_LEAF_LIFETIME_RANGE,
  GUST_LEAF_MID_COUNT,
  GUST_LEAF_PEACH,
  GUST_LEAF_SCALE_RANGE,
  GUST_LEAF_VEIN_SCALE_RATIO,
  LEAF_DRAG_K,
  LEAF_FLIGHT_BASE_VY_RANGE,
  LEAF_FLIGHT_STUCK_DURATION,
  LEAF_FLIGHT_STUCK_THRESHOLD,
  LEAF_GRAVITY,
  LEAF_ROT_DRAG_K,
  LEAF_ROTATION_LIFT,
  resolveGustLeafColors,
} from "../garden-atmosphere.constants"
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

function leafChild(leaf: Container, prefix: string): Sprite | undefined {
  return leaf.children.find(
    (child): child is Sprite =>
      child instanceof Sprite &&
      typeof child.label === "string" &&
      child.label.startsWith(prefix),
  )
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
      const expected = quality === "high" ? 6 : 4
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
      const expected = quality === "high" ? 6 : 4
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

  it("initializes every gust leaf body at a scale inside GUST_LEAF_SCALE_RANGE (FU-K)", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture(), makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    const leafContainers = ambient.children.filter(
      (c): c is Container =>
        c instanceof Container &&
        typeof c.label === "string" &&
        c.label.startsWith("gust-leaf-"),
    )
    expect(leafContainers.length).toBe(controller.getGustLeafCapacity())
    expect(leafContainers.length).toBeGreaterThan(0)
    for (const leaf of leafContainers) {
      const body = leafChild(leaf, "gust-leaf-body-")
      const vein = leafChild(leaf, "gust-leaf-vein-")
      expect(body).toBeInstanceOf(Sprite)
      expect(vein).toBeInstanceOf(Sprite)
      expect(body!.scale.x).toBeGreaterThanOrEqual(GUST_LEAF_SCALE_RANGE[0])
      expect(body!.scale.x).toBeLessThanOrEqual(GUST_LEAF_SCALE_RANGE[1])
      expect(body!.scale.y).toBe(body!.scale.x)
      expect(vein!.scale.x).toBeCloseTo(
        body!.scale.x * GUST_LEAF_VEIN_SCALE_RATIO,
      )
      expect(vein!.scale.y).toBeCloseTo(
        body!.scale.y * GUST_LEAF_VEIN_SCALE_RATIO,
      )
    }
    controller.destroy()
  })

  it("caches a vein texture and mounts body and vein children", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    const veinTexture = controller.getVeinTexture()
    expect(veinTexture).toBeInstanceOf(Texture)
    expect(controller.getVeinTexture()).toBe(veinTexture)
    const leafContainers = ambient.children.filter(
      (c): c is Container =>
        c instanceof Container &&
        typeof c.label === "string" &&
        c.label.startsWith("gust-leaf-"),
    )
    expect(leafContainers).toHaveLength(controller.getGustLeafCapacity())
    for (const leaf of leafContainers) {
      expect(leafChild(leaf, "gust-leaf-body-")).toBeInstanceOf(Sprite)
      expect(leafChild(leaf, "gust-leaf-vein-")).toBeInstanceOf(Sprite)
    }
    controller.destroy()
  })

  it("spawns gust leaves with vy in LEAF_FLIGHT_BASE_VY_RANGE and |vx| in LEAF_FLIGHT_BASE_V_RANGE (FU-O)", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.update(50, 1) // activates gust envelope
    const internals = controller as unknown as {
      gustLeaves: Array<{
        active: boolean
        vx: number
        vy: number
        direction: 1 | -1
      }>
    }
    const active = internals.gustLeaves.filter((s) => s.active)
    expect(active.length).toBeGreaterThan(0)
    for (const slot of active) {
      // FU-O: initial vertical velocity is sampled from
      // LEAF_FLIGHT_BASE_VY_RANGE = [40, 80] (downward).
      expect(slot.vy).toBeGreaterThanOrEqual(LEAF_FLIGHT_BASE_VY_RANGE[0])
      expect(slot.vy).toBeLessThanOrEqual(LEAF_FLIGHT_BASE_VY_RANGE[1])
      const speed = Math.abs(slot.vx)
      // |vx| from LEAF_FLIGHT_BASE_V_RANGE = [55, 100].
      expect(speed).toBeGreaterThanOrEqual(55)
      expect(speed).toBeLessThanOrEqual(100)
      // Direction must be consistent: vx carries the sign of `direction`.
      expect(Math.sign(slot.vx)).toBe(slot.direction)
    }
    controller.destroy()
  })

  it("spawns gust leaves at a screen edge so they span the full canvas (FU-J)", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.update(50, 1)
    const internals = controller as unknown as {
      gustLeaves: Array<{
        active: boolean
        sprite: Container
        direction: 1 | -1
      }>
    }
    const active = internals.gustLeaves.filter((s) => s.active)
    expect(active.length).toBeGreaterThan(0)
    for (const slot of active) {
      const x = slot.sprite.x
      // Edge: -40 (left) or ATMOSPHERE_WIDTH + 40 (right).
      // ATMOSPHERE_WIDTH = 1920 for the standard garden viewport.
      const atLeftEdge = Math.abs(x - -40) < 0.5
      const atRightEdge = Math.abs(x - (1920 + 40)) < 0.5
      expect(atLeftEdge || atRightEdge).toBe(true)
      if (atLeftEdge) expect(slot.direction).toBe(1)
      if (atRightEdge) expect(slot.direction).toBe(-1)
    }
    controller.destroy()
  })

  it("assigns every gust leaf a tint from the natural green spectrum (FU-K)", () => {
    // FU-K: tint array grew from 4 to 6 entries — palette.foreground,
    // midground, plantLeaf, grass, bushBack, hillMid. Use a multi-distinct
    // palette so we can assert that the multi-green wiring actually fires.
    // Walk a handful of seeds so the property is observed on at least one
    // (the pool is 2 leaves at high quality, so a single seed could
    // happen to draw the foreground tint twice — the 6-channel sweep
    // makes that < 1 in 36 with 2 leaves, and walking 4 seeds gives
    // near-zero flake).
    const palette: GardenPalette = {
      ...TEST_PALETTE,
      foreground: 0x112233,
      midground: 0x445566,
      plantLeaf: 0x778899,
      grass: 0xaabbcc,
      bushBack: 0xccccaa,
      hillMid: 0x99aabb,
    }
    const allowed = new Set([
      palette.foreground,
      palette.midground,
      palette.plantLeaf,
      palette.grass,
      palette.bushBack,
      palette.hillMid,
      GUST_LEAF_PEACH,
      GUST_LEAF_CORAL,
    ])
    let observedNonForeground = false
    let observedCount = 0
    for (const seed of [0xc0ffee, 1, 7, 42]) {
      const ambient = new Container()
      const controller = new GardenParticleController({
        quality: "high",
        ambient,
        grass: new Container(),
        moteTexture: makeMoteTexture(),
        windLeafTextures: [makeLeafTexture(), makeLeafTexture()],
        palette,
        seed,
      })
      const leafContainers = ambient.children.filter(
        (c): c is Container =>
          c instanceof Container &&
          typeof c.label === "string" &&
          c.label.startsWith("gust-leaf-"),
      )
      expect(leafContainers.length).toBeGreaterThan(0)
      for (const leaf of leafContainers) {
        const body = leafChild(leaf, "gust-leaf-body-")
        expect(body).toBeInstanceOf(Sprite)
        expect(allowed.has(body!.tint)).toBe(true)
        observedCount += 1
      }
      const observed = new Set(
        leafContainers.map(
          (leaf) => (leafChild(leaf, "gust-leaf-body-") as Sprite).tint,
        ),
      )
      const nonForeground = [...observed].filter(
        (t) => t !== palette.foreground,
      )
      if (nonForeground.length > 0) observedNonForeground = true
      controller.destroy()
    }
    // Across the seed sweep, at least one leaf must use a tint other
    // than foreground — proves the multi-green wiring actually fires.
    expect(observedNonForeground).toBe(true)
    // Sanity check: every observed leaf was one of the 6 allowed tints.
    expect(observedCount).toBeGreaterThan(0)
  })

  it("FU-P: GUST_LEAF_MID_COUNT grows to 6/4/2 across quality tiers", () => {
    // The FU-P mid-count bump (2 → 6 at high) doubles the simultaneous
    // leaf pool so the gust reads as a multi-leaf burst. The tiers
    // scale down so even low-tier devices show some leaf activity.
    expect(GUST_LEAF_MID_COUNT.high).toBe(6)
    expect(GUST_LEAF_MID_COUNT.medium).toBe(4)
    expect(GUST_LEAF_MID_COUNT.low).toBe(2)
    expect(GUST_LEAF_MID_COUNT.static).toBe(0)
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    expect(controller.getGustLeafCapacity()).toBe(6)
    controller.destroy()
  })

  it("FU-P: resolveGustLeafColors returns 8 channels (6 palette + peach + coral)", () => {
    const colors = resolveGustLeafColors(TEST_PALETTE)
    expect(colors).toHaveLength(8)
    expect(colors).toContain(GUST_LEAF_PEACH)
    expect(colors).toContain(GUST_LEAF_CORAL)
  })

  it("retires leaves whose currentY exceeds the stuck threshold for ≥ STUCK_DURATION (FU-O)", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.update(50, 1)
    const internals = controller as unknown as {
      gustLeaves: Array<{
        active: boolean
        currentY: number
        stuckSec: number
        sprite: Container
      }>
    }
    const slot = internals.gustLeaves.find((s) => s.active)
    expect(slot).toBeDefined()
    // Force the leaf into the stuck band: currentY above the
    // threshold leaves it "stuck". Drive enough frames past the
    // configured duration to retire the slot. Drive with windSample
    // = 0 so the gust does NOT re-spawn the slot once retired.
    const stuckY = LEAF_FLIGHT_STUCK_THRESHOLD * 1080 + 10
    slot!.currentY = stuckY
    slot!.sprite.y = stuckY
    const framesNeeded =
      Math.ceil((LEAF_FLIGHT_STUCK_DURATION + 0.2) / 0.05) + 5
    for (let i = 0; i < framesNeeded; i += 1) controller.update(50, 0)
    expect(slot!.active).toBe(false)
    controller.destroy()
  })

  it("does not retire leaves that briefly cross the stuck threshold (FU-O)", () => {
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.update(50, 1)
    const internals = controller as unknown as {
      gustLeaves: Array<{
        active: boolean
        currentY: number
        stuckSec: number
        sprite: Container
      }>
    }
    const slot = internals.gustLeaves.find((s) => s.active)
    expect(slot).toBeDefined()
    const stuckY = LEAF_FLIGHT_STUCK_THRESHOLD * 1080 + 10
    // Dip into the stuck band for less than STUCK_DURATION; the
    // slot must still be active afterwards. Drive with windSample
    // = 0 so the slot is not re-spawned while we probe state.
    slot!.currentY = stuckY
    slot!.sprite.y = stuckY
    const halfStuck = Math.max(
      1,
      Math.floor((LEAF_FLIGHT_STUCK_DURATION * 0.5) / 0.05),
    )
    for (let i = 0; i < halfStuck; i += 1) controller.update(50, 0)
    // Drop back below the threshold.
    slot!.currentY = 100
    slot!.sprite.y = 100
    for (let i = 0; i < halfStuck; i += 1) controller.update(50, 0)
    expect(slot!.active).toBe(true)
    controller.destroy()
  })

  it("decays vy under linear drag and grows it back under gravity (FU-O)", () => {
    // The brief: vy_after = vy * exp(-k*dt) + g * liftFactor * dt,
    // where liftFactor = clamp(1 - |angVel| * LEAF_ROTATION_LIFT,
    // 0.05, 1). With angVel = 0 → liftFactor = 1. We integrate 60
    // frames of dt=16.67 ms (~1 s) and assert vy drops from 80 toward
    // a terminal value (drag asymptote + gravity equilibrium) and
    // lands in [40, 60].
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.update(50, 1)
    const internals = controller as unknown as {
      gustLeaves: Array<{
        active: boolean
        vx: number
        vy: number
        angVel: number
        currentX: number
        currentY: number
        currentRotation: number
        sprite: Container
        stuckSec: number
      }>
    }
    const slot = internals.gustLeaves.find((s) => s.active)
    expect(slot).toBeDefined()
    slot!.vx = 0
    slot!.vy = 80
    slot!.angVel = 0
    slot!.currentX = 500
    slot!.currentY = 100
    slot!.currentRotation = 0
    slot!.sprite.position.set(500, 100)
    slot!.sprite.rotation = 0
    slot!.stuckSec = 0
    const dtMs = 50 / 3 // ≈ 16.67 ms → 60 frames ≈ 1 s
    for (let i = 0; i < 60; i += 1) controller.update(dtMs, 1)
    // Hand-rolled check: with k = LEAF_DRAG_K, the analytical
    // terminal-velocity asymptote for `vy(t) = vy_0 * exp(-k*t) +
    // (g/k) * (1 - exp(-k*t))` is `g/k`. After 1 s the integral is
    // dominated by the drag term, so vy should be well below the
    // initial 80 and trending toward the terminal velocity.
    expect(slot!.vy).toBeGreaterThan(40)
    expect(slot!.vy).toBeLessThan(60)
    controller.destroy()
  })

  it("rotational lift (|angVel|) makes vy decay further toward a lower terminal velocity (FU-O)", () => {
    // The ballistic model: vy_after = vy * exp(-k * dt) + g * liftFactor * dt.
    // With angVel = 0, liftFactor = 1 → strongest gravity → highest
    // terminal velocity (g/k ≈ 12.3). With angVel = 2.0, liftFactor = 0.9
    // → reduced effective gravity → lower terminal velocity (0.9*g/k).
    // The leaf with spin therefore falls slower: its vy_after is
    // smaller (numerically lower) than the no-spin case.
    const ambient = new Container()
    const controller = new GardenParticleController({
      quality: "high",
      ambient,
      grass: new Container(),
      moteTexture: makeMoteTexture(),
      windLeafTextures: [makeLeafTexture()],
      palette: TEST_PALETTE,
    })
    controller.update(50, 1)
    const internals = controller as unknown as {
      gustLeaves: Array<{
        active: boolean
        vx: number
        vy: number
        angVel: number
        currentX: number
        currentY: number
        currentRotation: number
        sprite: Container
        stuckSec: number
      }>
    }
    const slot = internals.gustLeaves.find((s) => s.active)
    expect(slot).toBeDefined()
    slot!.vx = 0
    slot!.currentX = 500
    slot!.currentY = 100
    slot!.currentRotation = 0
    slot!.sprite.position.set(500, 100)
    slot!.sprite.rotation = 0
    slot!.stuckSec = 0
    // First run: angVel = 0 → full gravity.
    slot!.angVel = 0
    slot!.vy = 80
    for (let i = 0; i < 60; i += 1) controller.update(50 / 3, 0)
    const vyNoSpin = slot!.vy
    // Reset.
    slot!.vy = 80
    slot!.angVel = 2.0
    for (let i = 0; i < 60; i += 1) controller.update(50 / 3, 0)
    const vySpin = slot!.vy
    // Spin reduces the effective gravity, so vy_after is lower — the
    // leaf falls slower.
    expect(vySpin).toBeLessThan(vyNoSpin)
    // Sanity: confirm the lift formula matches the constants.
    const expectedLiftNoSpin = Math.min(
      1,
      Math.max(0.05, 1 - 0 * LEAF_ROTATION_LIFT),
    )
    const expectedLiftSpin = Math.min(
      1,
      Math.max(0.05, 1 - 2.0 * LEAF_ROTATION_LIFT),
    )
    expect(expectedLiftNoSpin).toBe(1)
    expect(expectedLiftSpin).toBeLessThan(1)
    expect(expectedLiftSpin).toBeGreaterThan(0.05)
    // Drag constants sanity.
    expect(LEAF_DRAG_K).toBeGreaterThan(0)
    expect(LEAF_GRAVITY).toBeGreaterThan(0)
    expect(LEAF_ROT_DRAG_K).toBeGreaterThan(0)
    controller.destroy()
  })
})