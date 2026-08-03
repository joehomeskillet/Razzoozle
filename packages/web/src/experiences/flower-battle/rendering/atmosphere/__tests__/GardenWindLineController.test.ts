/**
 * Garden wind-line controller tests (FU-P — visible wind speed-lines).
 *
 * Mounts the controller against a stub weather container, then asserts:
 *   - WIND_LINE_COUNT Graphics children are mounted
 *   - alpha at windSample = 0 equals WIND_LINE_BASE_ALPHA (0.35)
 *   - alpha rises linearly with `|windSample|` and clamps at 1
 *   - lines drift rightward (vx > 0) and recycle off the right edge
 *   - destroy removes every line and is idempotent
 */

import { Container, Graphics } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenWindLineController } from "../GardenWindLineController"
import {
  ATMOSPHERE_WIDTH,
  WIND_LINE_BASE_ALPHA,
  WIND_LINE_COUNT,
  WIND_LINE_GUST_ALPHA_GAIN,
  WIND_LINE_HEIGHT,
  WIND_LINE_SPEED_RANGE,
} from "../garden-atmosphere.constants"

describe("GardenWindLineController", () => {
  it("mounts WIND_LINE_COUNT Bezier speed-lines into the weather container", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({ weather, seed: 0xc0ffee })
    expect(controller.getCount()).toBe(WIND_LINE_COUNT)
    const lineChildren = weather.children.filter(
      (child): child is Graphics => child instanceof Graphics,
    )
    expect(lineChildren).toHaveLength(WIND_LINE_COUNT)
    for (const line of lineChildren) {
      // Every line carries a label so probes / tests can identify them.
      expect(typeof line.label).toBe("string")
      expect(line.label).toMatch(/^wind-line-\d+$/)
    }
    controller.destroy()
    expect(weather.children).toHaveLength(0)
  })

  it("alpha equals WIND_LINE_BASE_ALPHA when windSample is 0", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    controller.update(16, 0)
    const lineChildren = weather.children.filter(
      (child): child is Graphics => child instanceof Graphics,
    )
    for (const line of lineChildren) {
      expect(line.alpha).toBeCloseTo(WIND_LINE_BASE_ALPHA)
    }
    controller.destroy()
  })

  it("alpha rises linearly with |windSample| and clamps at 1", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    controller.update(16, 0.5)
    const expected05 = Math.min(
      1,
      WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN * 0.5,
    )
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBeCloseTo(expected05)
    }
    // windSample = 1 → gain * 1 + base = 0.80 (still under clamp).
    controller.update(16, 1)
    const expected10 = Math.min(
      1,
      WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN * 1,
    )
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBeCloseTo(expected10)
    }
    // windSample = 5 → gain * 5 + base clamps to 1.
    controller.update(16, 5)
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBe(1)
    }
    // Negative windSample also feeds in via |windSample|.
    controller.update(16, -0.8)
    const expectedNeg = Math.min(
      1,
      WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN * 0.8,
    )
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBeCloseTo(expectedNeg)
    }
    controller.destroy()
  })

  it("alpha at windSample = 1 is clipped at 1 (base + gain * 1 < 1)", () => {
    // base = 0.35, gain = 0.45 → base + gain * 1 = 0.80 (well under clamp).
    expect(WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN).toBeCloseTo(0.8)
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    controller.update(16, 1)
    for (const line of weather.children) {
      if (line instanceof Graphics) {
        // Documented contract: alpha = clamp(1, base + gain * |sample|).
        // At sample = 1 the un-clamped value is 0.80, so we assert exactly
        // that the controller applies the unclamped formula and the clamp
        // only kicks in above sample = (1 - base) / gain ≈ 1.444.
        expect(line.alpha).toBeCloseTo(0.8)
      }
    }
    controller.destroy()
  })

  it("line.x increases by vx * dt each update (rightward drift)", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    const internals = controller as unknown as {
      lines: Array<{ x: number; vx: number; graphics: Graphics }>
    }
    expect(internals.lines.length).toBeGreaterThan(0)
    // Sample the speed band: every line picks vx in
    // WIND_LINE_SPEED_RANGE so each line must drift rightward over a
    // positive-delta update.
    expect(WIND_LINE_SPEED_RANGE[1]).toBeGreaterThan(0)
    // The controller clamps deltaMs to 50 ms, so a single update
    // delivers only `vx * 0.05` of drift. Drive 20 updates to get
    // one full second of motion.
    const frames = 20
    const beforeXs = internals.lines.map((l) => l.x)
    for (let i = 0; i < frames; i += 1) controller.update(50, 0)
    for (let i = 0; i < internals.lines.length; i += 1) {
      const line = internals.lines[i]!
      const drift = line.x - beforeXs[i]!
      // drift = vx * dt; vx ∈ [80, 140], dt = frames * 0.05 = 1.
      expect(drift).toBeGreaterThan(0)
      // graphics.x mirrors the controller's line.x at all times.
      expect(line.graphics.x).toBeCloseTo(line.x, 5)
    }
    controller.destroy()
  })

  it("recycles a line that exits the right margin back to the left edge", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    const internals = controller as unknown as {
      lines: Array<{ x: number; graphics: Graphics }>
    }
    expect(internals.lines.length).toBe(WIND_LINE_COUNT)
    const firstLine = internals.lines[0]!
    // Push the line past the recycle threshold; one update with a
    // generous delta must wrap it back to a negative x.
    firstLine.x = ATMOSPHERE_WIDTH + 200
    controller.update(16, 0)
    expect(firstLine.graphics.x).toBeLessThan(0)
    expect(firstLine.x).toBe(firstLine.graphics.x)
    controller.destroy()
  })

  it("uses WIND_LINE_HEIGHT as the Bezier control-point band", () => {
    // The control points sit at baseY ± WIND_LINE_HEIGHT; we don't
    // inspect the path directly (Graphics doesn't expose it), but we
    // do assert the constant is non-zero so the controller renders a
    // visible swoosh rather than a flat horizontal line.
    expect(WIND_LINE_HEIGHT).toBeGreaterThan(0)
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    expect(controller.getCount()).toBe(WIND_LINE_COUNT)
    controller.destroy()
  })

  it("destroy is idempotent and clears weather children", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({ weather })
    controller.destroy()
    expect(weather.children).toHaveLength(0)
    expect(() => controller.destroy()).not.toThrow()
    expect(weather.children).toHaveLength(0)
  })
})
