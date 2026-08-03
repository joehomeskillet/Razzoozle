/**
 * Garden butterfly controller tests.
 *
 * FU-L: Plan §7.2 — a single ambient butterfly, high quality only.
 * FU-N: two-frame wing flap (wings-up / wings-down). Renderer path
 * bakes two distinct silhouette textures via `renderer.generateTexture`
 * and the sprite swaps between them. The no-renderer fallback
 * (test-friendly) uses `Texture.WHITE` and rotates the sprite tint
 * between the accent (up) and a darker amber variant (down).
 * FU-O: physics redesign — cubic Bezier path through 4 control points
 * with G1-continuous segment continuation. Frame step is now
 *   pos = cubicBezier(C0..C3, t)
 *   vel = cubicBezierDerivative(C0..C3, t)
 *   heading = atan2(vel.y, vel.x)
 *   flapFreq = clamp(speed * BUTTERFLY_FLAP_SPEED_MULT, 1.5, 5)
 *   bobY = sin(t_elapsed * flapFreq * 2/3) * BUTTERFLY_BOB_AMP
 *   sprite.x = pos.x; sprite.y = pos.y + bobY; sprite.rotation = heading
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js"
import { describe, expect, it } from "vitest"

import {
  GardenButterflyController,
  type ButterflyFrame,
  type GardenButterflyRenderer,
  type GardenButterflyTextures,
} from "../GardenButterflyController"
import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
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
    // Tint starts as bodyColor (stubbed to 0xff9900 — `--color-accent`).
    expect(sprite!.tint).toBe(STUB_BODY_COLOR)
    // Visible width lands in the 24–44 px band regardless of the
    // texture-resolution fallback path (Texture.WHITE is 1×1; the
    // controller compensates with scale to land on 36 px).
    expect(sprite!.width).toBeGreaterThanOrEqual(24)
    expect(sprite!.width).toBeLessThanOrEqual(44)
    expect(sprite!.height).toBeGreaterThanOrEqual(16)
    c.destroy()
  })

  it("bakes two silhouette frames (wings-up + wings-down) via the renderer", () => {
    const upTex = Texture.from(
      {
        resource: new Uint8Array(36 * 28 * 4),
        width: 36,
        height: 28,
      },
      true,
    )
    const downTex = Texture.from(
      {
        resource: new Uint8Array(36 * 28 * 4),
        width: 36,
        height: 28,
      },
      true,
    )
    const calls: { graphics: Container; label: ButterflyFrame }[] = []
    const renderer: GardenButterflyRenderer = {
      generateTexture(graphics: Container, label: ButterflyFrame): Texture {
        calls.push({ graphics, label })
        return label === "up" ? upTex : downTex
      },
    }
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      renderer,
    })
    // The controller invokes the renderer exactly twice — once per
    // frame — and each call receives a fresh Graphics silhouette.
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.graphics).toBeInstanceOf(Graphics)
    }
    const labels = calls.map((call) => call.label).sort()
    expect(labels).toEqual(["down", "up"])
    // The sprite starts on the wings-up frame.
    expect(c.getCurrentFrame()).toBe("up")
    expect(c.getFrameCount()).toBe(2)
    expect(c.getSprite()!.texture).toBe(upTex)
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
    // Drive past the upper bound. deltaMs is clamped to 50 ms per
    // call, so a few more ticks are needed to clear 120 ms.
    for (let i = 0; i < 4; i += 1) c.update(100)
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

  it("reports 2 frames and 2 antennae via the FU-N test hooks", () => {
    const c = makeButterfly("high")
    expect(c.getFrameCount()).toBe(2)
    expect(c.getAntennaeCount()).toBe(2)
    // Initial frame is 'up' (mirrors the bird controller convention
    // — birds also start on wings-up).
    expect(c.getCurrentFrame()).toBe("up")
    c.destroy()
  })

  it("cycles the texture between wings-up and wings-down on the flap cadence (renderer path)", () => {
    // Tight wing-swap band override: 40–60 ms. A 300-ms drive triggers
    // ~5 swaps, well past the threshold needed to observe the cycle.
    const upTex = Texture.from(
      {
        resource: new Uint8Array(36 * 28 * 4),
        width: 36,
        height: 28,
      },
      true,
    )
    const downTex = Texture.from(
      {
        resource: new Uint8Array(36 * 28 * 4),
        width: 36,
        height: 28,
      },
      true,
    )
    const renderer: GardenButterflyRenderer = {
      generateTexture(_graphics: Container, label: ButterflyFrame): Texture {
        return label === "up" ? upTex : downTex
      },
    }
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      renderer,
      firstSpawnRangeMs: [0, 1],
      wingSwapRangeMs: [40, 60],
    })
    // Spawn immediately, then drive updates to cross the wing-swap
    // threshold several times. The controller toggles between the
    // two textures; verify both frames + textures are observed.
    const seenFrames = new Set<ButterflyFrame>()
    const seenTextures = new Set<Texture>()
    for (let i = 0; i < 80; i += 1) {
      c.update(20)
      seenFrames.add(c.getCurrentFrame())
      seenTextures.add(c.getSprite()!.texture)
    }
    expect(seenFrames.has("up")).toBe(true)
    expect(seenFrames.has("down")).toBe(true)
    expect(seenTextures.has(upTex)).toBe(true)
    expect(seenTextures.has(downTex)).toBe(true)
    c.destroy()
  })

  it("cycles the tint between accent and a darker variant on the flap cadence (Texture.WHITE fallback)", () => {
    // No renderer → controller falls through to the Texture.WHITE +
    // tint-rotation fallback. This is the path hit by node-env tests
    // (no DOM, no Pixi renderer).
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [0, 1],
      wingSwapRangeMs: [40, 60],
    })
    expect(c.getUsedFallback()).toBe(true)
    expect(c.getSprite()!.texture).toBe(Texture.WHITE)
    // Initial tint is bodyColor (the 'up' tint).
    expect(c.getSprite()!.tint).toBe(STUB_BODY_COLOR)
    expect(c.getCurrentFrame()).toBe("up")
    // Drive past several wing swaps to observe both frames.
    const seenFrames = new Set<ButterflyFrame>()
    let downTint = 0
    for (let i = 0; i < 80; i += 1) {
      c.update(20)
      seenFrames.add(c.getCurrentFrame())
      if (c.getCurrentFrame() === "down") {
        downTint = c.getSprite()!.tint
      }
    }
    expect(seenFrames.has("up")).toBe(true)
    expect(seenFrames.has("down")).toBe(true)
    // The down tint must differ from the 'up' tint — a darker amber
    // variant (0.65× the bodyColor per the BUTTERFLY_DOWN_TINT_FACTOR).
    expect(downTint).not.toBe(STUB_BODY_COLOR)
    // Each RGB channel of the down tint must be lower than (or equal
    // to) the corresponding bodyColor channel — "darker".
    const r = (STUB_BODY_COLOR >> 16) & 0xff
    const g = (STUB_BODY_COLOR >> 8) & 0xff
    const b = STUB_BODY_COLOR & 0xff
    const dr = (downTint >> 16) & 0xff
    const dg = (downTint >> 8) & 0xff
    const db = downTint & 0xff
    expect(dr).toBeLessThanOrEqual(r)
    expect(dg).toBeLessThanOrEqual(g)
    expect(db).toBeLessThanOrEqual(b)
    c.destroy()
  })

  it("uses caller-supplied butterflyTextures without invoking the renderer", () => {
    const upTex = Texture.from(
      {
        resource: new Uint8Array(36 * 28 * 4),
        width: 36,
        height: 28,
      },
      true,
    )
    const downTex = Texture.from(
      {
        resource: new Uint8Array(36 * 28 * 4),
        width: 36,
        height: 28,
      },
      true,
    )
    const textures: GardenButterflyTextures = { up: upTex, down: downTex }
    let rendererCalled = false
    const renderer: GardenButterflyRenderer = {
      generateTexture(): Texture {
        rendererCalled = true
        return upTex
      },
    }
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      renderer,
      butterflyTextures: textures,
    })
    expect(rendererCalled).toBe(false)
    expect(c.getSprite()!.texture).toBe(upTex)
    c.destroy()
  })

  it("preserves the Bezier path motion while the frame swap is layered on top", () => {
    // The frame swap must never change sprite.x / sprite.y / sprite
    // .rotation. We sample a few mid-path frames and verify the path
    // is still progressing.
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [0, 1],
      wingSwapRangeMs: [40, 60],
    })
    // Spawn immediately.
    c.update(50)
    expect(c.getIsAlive()).toBe(true)
    const samples: { x: number; y: number; rotation: number }[] = []
    for (let i = 0; i < 6; i += 1) {
      c.update(40)
      const sprite = c.getSprite()!
      samples.push({ x: sprite.x, y: sprite.y, rotation: sprite.rotation })
    }
    // At least one x/y must have changed across the samples — the
    // path is advancing, independent of any frame swaps.
    const distinctX = new Set(samples.map((s) => s.x))
    const distinctY = new Set(samples.map((s) => s.y))
    expect(distinctX.size + distinctY.size).toBeGreaterThan(1)
    c.destroy()
  })

  it("populates segment[0].C0..C3 at construction time (FU-O)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
    })
    const segs = c.getSegments()
    expect(segs.length).toBe(1)
    const first = segs[0]!
    expect(Number.isFinite(first.C0.x)).toBe(true)
    expect(Number.isFinite(first.C0.y)).toBe(true)
    expect(Number.isFinite(first.C1.x)).toBe(true)
    expect(Number.isFinite(first.C1.y)).toBe(true)
    expect(Number.isFinite(first.C2.x)).toBe(true)
    expect(Number.isFinite(first.C2.y)).toBe(true)
    expect(Number.isFinite(first.C3.x)).toBe(true)
    expect(Number.isFinite(first.C3.y)).toBe(true)
    // C0 enters from a screen edge.
    const atLeft = first.C0.x <= -39
    const atRight = first.C0.x >= ATMOSPHERE_WIDTH - 39 + 40
    expect(atLeft || atRight).toBe(true)
    // C3 lands inside the yBand.
    expect(first.C3.y).toBeGreaterThanOrEqual(
      BUTTERFLY_BASE_Y_RANGE[0] * ATMOSPHERE_HEIGHT - 1e-6,
    )
    expect(first.C3.y).toBeLessThanOrEqual(
      BUTTERFLY_BASE_Y_RANGE[1] * ATMOSPHERE_HEIGHT + 1e-6,
    )
    // Segment duration is in the configured range.
    expect(first.segmentDuration).toBeGreaterThanOrEqual(4)
    expect(first.segmentDuration).toBeLessThanOrEqual(7)
    c.destroy()
  })

  it("updates sprite.rotation over successive frames (heading tracks tangent)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [0, 1],
      wingSwapRangeMs: [10_000, 10_000], // suppress swaps so rotation only moves via heading
    })
    c.update(50) // spawn
    const initialRotation = c.getSprite()!.rotation
    for (let i = 0; i < 50; i += 1) c.update(40)
    const finalRotation = c.getSprite()!.rotation
    // Heading is `atan2(vel.y, vel.x)` from the Bezier derivative.
    // Across 2 s of motion the tangent direction must change — the
    // silhouette turns to follow its trajectory.
    expect(Math.abs(finalRotation - initialRotation)).toBeGreaterThan(0)
    c.destroy()
  })

  it("spawns a continuation segment whose C0 equals the previous segment's C3 (G1 continuity, FU-O)", () => {
    const c = new GardenButterflyController({
      quality: "high",
      ambient: new Container(),
      bodyColor: STUB_BODY_COLOR,
      firstSpawnRangeMs: [0, 1],
      // wingSwapRangeMs left null — physics drives the swap, the
      // segment transition is the focus here.
    })
    c.update(50)
    const first = c.getSegments()[0]!
    const durationSec = first.segmentDuration
    // Drive enough frames to finish the first segment AND step
    // into the second.
    const frames = Math.ceil((durationSec + 0.2) / 0.04) + 1
    for (let i = 0; i < frames; i += 1) c.update(40)
    const segs = c.getSegments()
    expect(segs.length).toBeGreaterThanOrEqual(2)
    const second = segs[1]!
    expect(second.C0.x).toBeCloseTo(first.C3.x, 6)
    expect(second.C0.y).toBeCloseTo(first.C3.y, 6)
    c.destroy()
  })
})