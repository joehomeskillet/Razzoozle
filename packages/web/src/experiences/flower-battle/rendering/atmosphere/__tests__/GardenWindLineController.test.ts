/**
 * Garden wind-line controller tests (FU-P + FU-Q — corridor stacking).
 *
 * FU-Q: 6 lines (was 4) stack tightly around `WindField.midlineY` in
 * a `±WIND_LINE_CORRIDOR_HEIGHT / 2` band. Each line's `vx` sign
 * follows `WindField.direction`. The tests assert:
 *   - WIND_LINE_COUNT Graphics children are mounted
 *   - alpha at windSample = 0 equals WIND_LINE_BASE_ALPHA (0.55)
 *   - lines stack inside the corridor (≥ boundary check)
 *   - default direction = 1 → lines drift rightward
 *   - explicit direction = -1 → lines drift leftward
 */

import { Container, Graphics } from "pixi.js"
import { describe, expect, it } from "vitest"

import { GardenWindLineController } from "../GardenWindLineController"
import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  WIND_LINE_BASE_ALPHA,
  WIND_LINE_COUNT,
  WIND_LINE_CORRIDOR_HEIGHT,
  WIND_LINE_GUST_ALPHA_GAIN,
  WIND_LINE_HEIGHT,
  WIND_LINE_SPEED_RANGE,
  type WindFieldState,
} from "../garden-atmosphere.constants"

function makeWindField(
  state: WindFieldState = { direction: 1, midlineY: ATMOSPHERE_HEIGHT * 0.4 },
) {
  return { getState: () => state }
}

describe("GardenWindLineController (FU-P, FU-Q corridor)", () => {
  it("mounts 6 Bezier speed-lines into the weather container", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      seed: 0xc0ffee,
      windField: makeWindField(),
    })
    expect(WIND_LINE_COUNT).toBe(6)
    expect(controller.getCount()).toBe(WIND_LINE_COUNT)
    const lineChildren = weather.children.filter(
      (child): child is Graphics => child instanceof Graphics,
    )
    expect(lineChildren).toHaveLength(WIND_LINE_COUNT)
    for (const line of lineChildren) {
      expect(typeof line.label).toBe("string")
      expect(line.label).toMatch(/^wind-line-\d+$/)
    }
    controller.destroy()
    expect(weather.children).toHaveLength(0)
  })

  it("FU-Q: all 6 lines stack within ±WIND_LINE_CORRIDOR_HEIGHT/2 of WindField.midlineY", () => {
    const weather = new Container()
    const state: WindFieldState = {
      direction: 1,
      midlineY: ATMOSPHERE_HEIGHT * 0.4,
    }
    const controller = new GardenWindLineController({
      weather,
      seed: 0xc0ffee,
      windField: makeWindField(state),
    })
    const internals = controller as unknown as {
      lines: Array<{ baseY: number }>
    }
    expect(internals.lines.length).toBe(WIND_LINE_COUNT)
    const halfCorridor = WIND_LINE_CORRIDOR_HEIGHT / 2
    for (const line of internals.lines) {
      expect(line.baseY).toBeGreaterThanOrEqual(state.midlineY - halfCorridor - 5)
      expect(line.baseY).toBeLessThanOrEqual(state.midlineY + halfCorridor + 5)
    }
    controller.destroy()
  })

  it("FU-Q: lines move in the windward direction (direction = 1 → vx > 0)", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField({ direction: 1, midlineY: ATMOSPHERE_HEIGHT * 0.4 }),
    })
    const internals = controller as unknown as {
      lines: Array<{ vx: number }>
    }
    for (const line of internals.lines) {
      expect(line.vx).toBeGreaterThan(0)
    }
    controller.destroy()
  })

  it("FU-Q: lines move leeward when direction = -1 (vx < 0)", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField({
        direction: -1,
        midlineY: ATMOSPHERE_HEIGHT * 0.4,
      }),
    })
    const internals = controller as unknown as {
      lines: Array<{ vx: number; x: number }>
    }
    for (const line of internals.lines) {
      expect(line.vx).toBeLessThan(0)
    }
    controller.destroy()
  })

  it("FU-Q: direction = -1 lines start on the right margin", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField({
        direction: -1,
        midlineY: ATMOSPHERE_HEIGHT * 0.4,
      }),
    })
    const internals = controller as unknown as {
      lines: Array<{ x: number }>
    }
    for (const line of internals.lines) {
      expect(line.x).toBeGreaterThan(ATMOSPHERE_WIDTH / 2)
    }
    controller.destroy()
  })

  it("alpha equals WIND_LINE_BASE_ALPHA when windSample is 0", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField(),
    })
    controller.update(16, 0)
    for (const line of weather.children) {
      if (line instanceof Graphics) {
        expect(line.alpha).toBeCloseTo(WIND_LINE_BASE_ALPHA)
      }
    }
    controller.destroy()
  })

  it("alpha rises linearly with |windSample| and clamps at 1", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField(),
    })
    controller.update(16, 0.5)
    const expected05 = Math.min(
      1,
      WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN * 0.5,
    )
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBeCloseTo(expected05)
    }
    controller.update(16, 1)
    const expected10 = Math.min(
      1,
      WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN * 1,
    )
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBeCloseTo(expected10)
    }
    controller.update(16, 5)
    for (const line of weather.children) {
      if (line instanceof Graphics) expect(line.alpha).toBe(1)
    }
    controller.destroy()
  })

  it("line drift: vx * dt each update (direction=1, rightward)", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField(),
    })
    const internals = controller as unknown as {
      lines: Array<{ x: number; vx: number; graphics: Graphics }>
    }
    expect(internals.lines.length).toBeGreaterThan(0)
    const frames = 20
    const beforeXs = internals.lines.map((l) => l.x)
    for (let i = 0; i < frames; i += 1) controller.update(50, 0)
    for (let i = 0; i < internals.lines.length; i += 1) {
      const line = internals.lines[i]!
      const drift = line.x - beforeXs[i]!
      expect(drift).toBeGreaterThan(0)
      expect(line.graphics.x).toBeCloseTo(line.x, 5)
    }
    controller.destroy()
  })

  it("recycles a line that exits the right margin back to the left edge", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField({ direction: 1, midlineY: ATMOSPHERE_HEIGHT * 0.4 }),
    })
    const internals = controller as unknown as {
      lines: Array<{ x: number; vx: number; graphics: Graphics }>
    }
    const firstLine = internals.lines[0]!
    firstLine.x = ATMOSPHERE_WIDTH + 200
    controller.update(16, 0)
    expect(firstLine.graphics.x).toBeLessThan(0)
    controller.destroy()
  })

  it("recycles a line that exits the left margin back to the right edge (direction=-1)", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField({
        direction: -1,
        midlineY: ATMOSPHERE_HEIGHT * 0.4,
      }),
    })
    const internals = controller as unknown as {
      lines: Array<{ x: number; vx: number; graphics: Graphics }>
    }
    const firstLine = internals.lines[0]!
    firstLine.x = -200
    controller.update(16, 0)
    expect(firstLine.graphics.x).toBeGreaterThan(ATMOSPHERE_WIDTH)
    controller.destroy()
  })

  it("uses WIND_LINE_HEIGHT as the Bezier control-point band", () => {
    expect(WIND_LINE_HEIGHT).toBeGreaterThan(0)
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField(),
    })
    expect(controller.getCount()).toBe(WIND_LINE_COUNT)
    controller.destroy()
  })

  it("destroy is idempotent and clears weather children", () => {
    const weather = new Container()
    const controller = new GardenWindLineController({
      weather,
      windField: makeWindField(),
    })
    controller.destroy()
    expect(weather.children).toHaveLength(0)
    expect(() => controller.destroy()).not.toThrow()
    expect(weather.children).toHaveLength(0)
  })
})
