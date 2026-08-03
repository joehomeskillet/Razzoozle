/**
 * Garden wind-line controller (FU-P, FU-Q — visible wind + corridor).
 *
 * Mounts `WIND_LINE_COUNT` cream-yellow Bezier speed-lines into the
 * weather layer. The lines start off-canvas on the windward edge,
 * scroll toward the leeward edge, and recycle when they exit the
 * opposite margin. Per frame the controller scales each line's alpha
 * by the current wind sample so a calm scene fades them and a gust
 * makes them visibly streak across the canvas.
 *
 * FU-Q (corridor cohesion):
 *   - All 6 lines stack tightly around `windField.midlineY` within
 *     `±WIND_LINE_CORRIDOR_HEIGHT / 2`, with a small per-line spread
 *     (`rng.signed`). They read as a single stream rather than 4
 *     spread-out hair-lines.
 *   - Each line's `vx` sign follows `windField.direction`: 1 →
 *     left-to-right (lines enter from the left), -1 → right-to-left
 *     (lines enter from the right). The wind field flips direction
 *     every ~30–60 s; the controller reads the new sign on every
 *     recycle.
 *
 * The controller owns no motion of its own — it is a pure visual
 * effect driven by the same `windSample` number the wind controller
 * feeds to the rest of the atmosphere, plus the `windField` direction
 * the aggregator shares with gust leaves.
 */

import { Container, Graphics } from "pixi.js"

import {
  ATMOSPHERE_HEIGHT,
  ATMOSPHERE_WIDTH,
  WIND_LINE_BASE_ALPHA,
  WIND_LINE_COLOR,
  WIND_LINE_CORRIDOR_HEIGHT,
  WIND_LINE_COUNT,
  WIND_LINE_GUST_ALPHA_GAIN,
  WIND_LINE_HEIGHT,
  WIND_LINE_SPEED_RANGE,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"
import type { WindFieldState } from "./garden-atmosphere.constants"

const WIND_LINE_OFFSCREEN_MARGIN = 80

interface WindLine {
  graphics: Graphics
  /** Per-line horizontal speed magnitude (px/s). Sign follows
   *  `windField.direction`. */
  vx: number
  /** Y in [midlineY - corridor/2, midlineY + corridor/2] (logical px). */
  baseY: number
  /** Current horizontal position; when it exits the canvas + margin
   *  we recycle. */
  x: number
}

export interface GardenWindLineControllerOptions {
  weather: Container
  /** Seed for the deterministic per-line Bezier shape / speed / Y pick. */
  seed?: number
  /**
   * Shared `WindField` instance (FU-Q). The controller reads `direction`
   * and `midlineY` on construction and on every recycle so the lines
   * stay coherent with gust leaves spawned by `GardenParticleController`.
   */
  windField: { getState(): WindFieldState }
}

export class GardenWindLineController {
  private readonly weather: Container
  private readonly rng: SeededRandom
  private readonly windField: { getState(): WindFieldState }
  private readonly lines: WindLine[] = []
  private destroyed = false

  constructor(options: GardenWindLineControllerOptions) {
    this.weather = options.weather
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)
    this.windField = options.windField
    const state = this.windField.getState()
    for (let i = 0; i < WIND_LINE_COUNT; i += 1) {
      this.lines.push(this.buildLine(i, state))
    }
  }

  /** Number of mounted speed-line Graphics. */
  getCount(): number {
    return this.lines.length
  }

  /** True wind-direction sign used at construction (test seam). */
  getInitialDirection(): 1 | -1 {
    return this.lines[0]?.vx === undefined
      ? 1
      : (Math.sign(this.lines[0]!.vx) as 1 | -1)
  }

  /** Per-line update — `windSample` drives alpha, the line's position
   *  drifts continuously on `vx`. On recycle we read the latest
   *  `windField.direction` so the stream flips with the wind. */
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
      const state = this.windField.getState()
      const sign = state.direction
      const rightEdge = ATMOSPHERE_WIDTH + WIND_LINE_OFFSCREEN_MARGIN
      const leftEdge = -WIND_LINE_OFFSCREEN_MARGIN
      if (sign === 1 && line.x > rightEdge) {
        // Direction is LTR; line left the right margin → recycle from the left.
        line.x = leftEdge
      } else if (sign === -1 && line.x < leftEdge) {
        // Direction is RTL; line left the left margin → recycle from the right.
        line.x = rightEdge
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

  private buildLine(
    index: number,
    state: WindFieldState,
  ): WindLine {
    const graphics = new Graphics()
    graphics.label = `wind-line-${index}`
    // FU-Q: pick the Y in [midlineY - corridor/2, midlineY + corridor/2].
    // `i / (count - 1)` produces a tight vertical stack with a small
    // `rng.signed()` jitter so the lines don't overlap exactly.
    const halfCorridor = WIND_LINE_CORRIDOR_HEIGHT / 2
    const minY = state.midlineY - halfCorridor
    const maxY = state.midlineY + halfCorridor
    const stackT =
      WIND_LINE_COUNT > 1 ? index / (WIND_LINE_COUNT - 1) : 0.5
    const baseY = minY + stackT * (maxY - minY)
    const jitter = this.rng.signed() * 4
    const y = Math.max(8, Math.min(ATMOSPHERE_HEIGHT - 8, baseY + jitter))
    const speedMag = this.rng.range(
      WIND_LINE_SPEED_RANGE[0],
      WIND_LINE_SPEED_RANGE[1],
    )
    const vx = speedMag * state.direction
    // Cubic Bezier across the canvas: anchor off-canvas on the entry
    // side, control points middle-up and middle-down (Adventure-Time
    // swoosh). `startX` is the windward edge so the direction sign
    // matches the visual flow.
    const startX =
      state.direction === 1
        ? -WIND_LINE_OFFSCREEN_MARGIN
        : ATMOSPHERE_WIDTH + WIND_LINE_OFFSCREEN_MARGIN
    const endX =
      state.direction === 1
        ? ATMOSPHERE_WIDTH + WIND_LINE_OFFSCREEN_MARGIN
        : -WIND_LINE_OFFSCREEN_MARGIN
    const midX = ATMOSPHERE_WIDTH / 2
    const controlUp = y - WIND_LINE_HEIGHT
    const controlDown = y + WIND_LINE_HEIGHT
    graphics
      .moveTo(startX, y)
      .bezierCurveTo(midX, controlUp, midX, controlDown, endX, y)
      .stroke({
        color: WIND_LINE_COLOR,
        width: 3,
        alpha: WIND_LINE_BASE_ALPHA,
      })
    this.weather.addChild(graphics)
    return {
      graphics,
      vx,
      baseY: y,
      x: startX,
    }
  }
}
