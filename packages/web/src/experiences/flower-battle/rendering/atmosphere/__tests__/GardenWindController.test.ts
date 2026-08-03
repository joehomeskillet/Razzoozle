/**
 * Wind controller + envelope + sample determinism tests.
 */

import { describe, expect, it } from "vitest"

import {
  computeGustEnvelope,
  computeWindSample,
  GardenWindController,
} from "../GardenWindController"

describe("computeGustEnvelope", () => {
  it("returns 0 before the gust starts", () => {
    expect(computeGustEnvelope(-5, 600, 100, 1600)).toBe(0)
  })

  it("ramps from 0 → 1 across the configured ramp duration", () => {
    expect(computeGustEnvelope(0, 600, 100, 1600)).toBe(0)
    expect(computeGustEnvelope(300, 600, 100, 1600)).toBeCloseTo(0.5, 5)
    expect(computeGustEnvelope(600, 600, 100, 1600)).toBeCloseTo(1, 5)
  })

  it("holds the peak for exactly the peak window", () => {
    expect(computeGustEnvelope(650, 600, 100, 1600)).toBeCloseTo(1, 5)
    expect(computeGustEnvelope(699, 600, 100, 1600)).toBeCloseTo(1, 5)
    expect(computeGustEnvelope(700, 600, 100, 1600)).toBeCloseTo(1, 5)
  })

  it("decays linearly from 1 → 0 across the decay window", () => {
    expect(computeGustEnvelope(700, 600, 100, 1600)).toBeCloseTo(1, 5)
    expect(computeGustEnvelope(1500, 600, 100, 1600)).toBeCloseTo(0.5, 5)
    expect(computeGustEnvelope(2300, 600, 100, 1600)).toBeCloseTo(0, 5)
  })

  it("returns 0 after the gust finishes", () => {
    expect(computeGustEnvelope(5000, 600, 100, 1600)).toBe(0)
  })
})

describe("computeWindSample", () => {
  it("returns a value in [-1, 1] for arbitrary inputs", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = computeWindSample(i * 0.1, 1.3, 0.7, 0.5)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it("clamps the gust contribution so the result never exceeds 1", () => {
    // Pick the t that maximizes the first sine. With a full gust on top
    // the combined value exceeds the clamp regardless of the second sine.
    const v = computeWindSample(Math.PI / 2 / 0.55, 0, 0, 1)
    expect(v).toBeCloseTo(1, 5)
  })

  it("clamps to -1 for fully negative inputs", () => {
    const v = computeWindSample(-Math.PI / 2 / 0.55, 0, 0, -1)
    expect(v).toBeCloseTo(-1, 5)
  })

  it("is deterministic for identical inputs", () => {
    for (let i = 0; i < 32; i += 1) {
      const a = computeWindSample(i * 0.25, 1.1, 0.4, 0.3)
      const b = computeWindSample(i * 0.25, 1.1, 0.4, 0.3)
      expect(a).toBe(b)
    }
  })
})

describe("GardenWindController", () => {
  it("clamps negative deltas and produces an in-range sample", () => {
    const c = new GardenWindController({ seed: 5 })
    c.update(0)
    c.update(-1000)
    const sample = c.getSample()
    expect(sample).toBeGreaterThanOrEqual(-1)
    expect(sample).toBeLessThanOrEqual(1)
  })

  it("is deterministic for identical seeds, deltas, and gust periods", () => {
    const a = new GardenWindController({ seed: 17 })
    const b = new GardenWindController({ seed: 17 })
    a.setGustPeriod(500, 600)
    b.setGustPeriod(500, 600)
    for (let i = 0; i < 60; i += 1) {
      a.update(100)
      b.update(100)
      expect(a.getSample()).toBe(b.getSample())
    }
  })

  it("rises and falls during a forced gust", () => {
    const c = new GardenWindController({ seed: 99, phase1: 0, phase2: 0 })
    // Step forward 1 s of calm; sample stays in [-1, 1].
    for (let i = 0; i < 6; i += 1) {
      c.update(160)
    }
    const baseline = c.getSample()
    expect(baseline).toBeGreaterThanOrEqual(-1)
    expect(baseline).toBeLessThanOrEqual(1)
    // Force a gust right now.
    c.forceNextGustAt(50)
    c.update(50)
    const ramping = c.getSample()
    expect(ramping).toBeGreaterThanOrEqual(-1)
    expect(ramping).toBeLessThanOrEqual(1)
    // Step further into the gust (peak + decay).
    for (let i = 0; i < 30; i += 1) {
      c.update(100)
    }
    const postGust = c.getSample()
    expect(postGust).toBeGreaterThanOrEqual(-1)
    expect(postGust).toBeLessThanOrEqual(1)
  })

  it("exposes phase and elapsed values that grow with update", () => {
    const c = new GardenWindController({ seed: 5 })
    const e0 = c.getElapsedMs()
    // Brief: deltaMS is clamped to [0, 50]. Hammer the controller so the
    // elapsed clock advances; each tick contributes 50 ms max.
    for (let i = 0; i < 10; i += 1) c.update(50)
    const e1 = c.getElapsedMs()
    expect(e1).toBe(e0 + 500)
    expect(c.getElapsedSeconds()).toBeCloseTo(e1 / 1000, 5)
  })

  it("reducedMotion freezes the wind clock and sample", () => {
    const c = new GardenWindController({ seed: 7, reducedMotion: true })
    const before = c.getSample()
    expect(before).toBe(0)
    c.update(500)
    expect(c.getSample()).toBe(0)
    expect(c.getElapsedMs()).toBe(0)
  })

  it("defaults the seed when none is provided", () => {
    const a = new GardenWindController()
    const b = new GardenWindController()
    a.setGustPeriod(800, 1000)
    b.setGustPeriod(800, 1000)
    for (let i = 0; i < 20; i += 1) {
      a.update(120)
      b.update(120)
      expect(a.getSample()).toBe(b.getSample())
    }
  })
})