/**
 * Garden wind-line controller (FU-P — visible wind).
 *
 * Mounts `WIND_LINE_COUNT` cream-yellow Bezier speed-lines into the
 * weather layer. The lines start off-canvas-left, scroll rightward,
 * and recycle to the left edge when they exit the right margin. Per
 * frame the controller scales each line's alpha by the current wind
 * sample so a calm scene hides the lines and a gust makes them
 * streak across the canvas.
 *
 * The controller owns no motion of its own — it is a pure visual
 * effect driven by the same `windSample` number that the wind
 * controller feeds to the rest of the atmosphere. The four lines
 * share a single seeded RNG so the layout is deterministic per
 * host seed (GardenScene passes the same `seed` to every sub-
 * controller).
 */

import { Container, Graphics } from "pixi.js"

import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  WIND_LINE_BASE_ALPHA,
  WIND_LINE_COLOR,
  WIND_LINE_COUNT,
  WIND_LINE_GUST_ALPHA_GAIN,
  WIND_LINE_HEIGHT,
  WIND_LINE_SPEED_RANGE,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"

const WIND_LINE_OFFSCREEN_MARGIN = 80

interface WindLine {
  graphics: Graphics
  vx: number
  /** Y in [0, ATMOSPHERE_HEIGHT) — fixed at construction. */
  baseY: number
  /** Current horizontal position; when > WIDTH + margin we recycle. */
  x: number
}

export interface GardenWindLineControllerOptions {
  weather: Container
  /** Seed for the deterministic per-line Bezier shape / speed / Y pick. */
  seed?: number
}

export class GardenWindLineController {
  private readonly weather: Container
  private readonly rng: SeededRandom
  private readonly lines: WindLine[] = []
  private destroyed = false

  constructor(options: GardenWindLineControllerOptions) {
    this.weather = options.weather
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)
    for (let i = 0; i < WIND_LINE_COUNT; i += 1) {
      this.lines.push(this.buildLine(i))
    }
  }

  /** Number of mounted speed-line Graphics. */
  getCount(): number {
    return this.lines.length
  }

  /** Per-line update — `windSample` drives alpha, not position. */
  update(deltaMs: number, windSample: number): void {
    if (this.destroyed) return
    const clamped = Math.min(50, Math.max(0, deltaMs))
    const dt = clamped / 1000
    const alpha = Math.min(
      1,
      WIND_LINE_BASE_ALPHA + WIND_LINE_GUST_ALPHA_GAIN * Math.abs(windSample),
    )
    for (const line of this.lines) {
      line.graphics.alpha = alpha
      line.x += line.vx * dt
      if (line.x > ATMOSPHERE_WIDTH + WIND_LINE_OFFSCREEN_MARGIN) {
        // Recycle: re-emit from the left edge with the same Y / shape.
        line.x = -WIND_LINE_OFFSCREEN_MARGIN
      }
      line.graphics.x = line.x
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const line of this.lines) {
      if (line.graphics.parent) {
        line.graphics.parent.removeChild(line.graphics)
      }
      line.graphics.destroy()
    }
    this.lines.length = 0
  }

  private buildLine(index: number): WindLine {
    const graphics = new Graphics()
    graphics.label = `wind-line-${index}`
    const y = this.rng.range(
      ATMOSPHERE_HEIGHT * 0.2,
      ATMOSPHERE_HEIGHT * 0.6,
    )
    const vx = this.rng.range(
      WIND_LINE_SPEED_RANGE[0],
      WIND_LINE_SPEED_RANGE[1],
    )
    // Cubic Bezier across the canvas: anchor off-canvas-left and
    // off-canvas-right, control points middle-up and middle-down
    // (Adventure-Time swoosh).
    const startX = -WIND_LINE_OFFSCREEN_MARGIN
    const endX = ATMOSPHERE_WIDTH + WIND_LINE_OFFSCREEN_MARGIN
    const midX = ATMOSPHERE_WIDTH / 2
    const controlUp = y - WIND_LINE_HEIGHT
    const controlDown = y + WIND_LINE_HEIGHT
    graphics
      .moveTo(startX, y)
      .bezierCurveTo(midX, controlUp, midX, controlDown, endX, y)
      .stroke({ color: WIND_LINE_COLOR, width: 3, alpha: WIND_LINE_BASE_ALPHA })
    this.weather.addChild(graphics)
    return {
      graphics,
      vx,
      baseY: y,
      x: startX,
    }
  }
}
