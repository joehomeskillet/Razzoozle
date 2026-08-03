/**
 * Garden wind controller.
 *
 * Pure deterministic wind signal plus a gust scheduler. No Pixi dependency
 * so the math can be unit-tested without a renderer. The host only sees
 * the controller — it composes the three sub-controllers under the
 * `GardenAtmosphereController` aggregator.
 *
 * Wind model (brief §WIND MODEL):
 *   wind = sin(t * 0.55 + phase1) * 0.55
 *        + sin(t * 0.17 + phase2) * 0.25
 *        + currentGust * 0.75
 *   clamped to [-1, 1].
 *
 * Gust envelope: ramp (500–800 ms) → peak (100 ms) → decay (1.2–2.0 s).
 * The envelope is a pure function of elapsed time since the gust started.
 */

import {
  GUST_PEAK_MS,
  GUST_PERIOD_RANGE,
  GUST_RAMP_RANGE,
  GUST_DECAY_RANGE,
  WIND_FREQ_PRIMARY,
  WIND_FREQ_SECONDARY,
  WIND_PRIMARY_AMP,
  WIND_SECONDARY_AMP,
  WIND_GUST_AMP,
} from "./garden-atmosphere.constants"
import { createSeededRandom, type SeededRandom } from "./seededRandom"

export interface WindControllerOptions {
  seed?: number
  /** Custom phase offsets (radians) — tests can pin them. */
  phase1?: number
  phase2?: number
  /**
   * When true, freezes the wind clock and pins the sample to zero. The
   * brief says reduced-motion fully disables wind; grass + bird + leaf
   * sub-controllers all branch on this flag independently.
   */
  reducedMotion?: boolean
}

export interface GustSample {
  /** When this gust started (ms since bind). */
  startedAtMs: number
  /** Pre-baked ramp / peak / decay durations (ms). */
  rampMs: number
  peakMs: number
  decayMs: number
}

/**
 * Pure envelope: returns the gust amplitude in [0, 1] given the elapsed
 * time (ms) since the gust started. Test seam — exposed for direct
 * verification without instantiating the controller.
 */
export function computeGustEnvelope(
  elapsedSinceGustMs: number,
  rampMs: number,
  peakMs: number,
  decayMs: number,
): number {
  if (elapsedSinceGustMs < 0) return 0
  if (elapsedSinceGustMs < rampMs) {
    return elapsedSinceGustMs / rampMs
  }
  if (elapsedSinceGustMs < rampMs + peakMs) {
    return 1
  }
  const decayStart = rampMs + peakMs
  if (elapsedSinceGustMs < decayStart + decayMs) {
    return 1 - (elapsedSinceGustMs - decayStart) / decayMs
  }
  return 0
}

/**
 * Pure wind sample: combines the two sine waves with the current gust
 * amplitude. Exposed so the suite can verify determinism (same t, phases,
 * gust → identical sample) without instantiating a controller.
 */
export function computeWindSample(
  tSeconds: number,
  phase1: number,
  phase2: number,
  currentGust: number,
): number {
  const a =
    Math.sin(tSeconds * WIND_FREQ_PRIMARY + phase1) * WIND_PRIMARY_AMP
  const b =
    Math.sin(tSeconds * WIND_FREQ_SECONDARY + phase2) * WIND_SECONDARY_AMP
  const combined = a + b + currentGust * WIND_GUST_AMP
  if (combined > 1) return 1
  if (combined < -1) return -1
  return combined
}

export class GardenWindController {
  private readonly rng: SeededRandom
  private readonly phase1: number
  private readonly phase2: number
  private readonly reducedMotion: boolean
  private elapsedMs = 0
  /** ms when the next gust should fire (relative to elapsedMs). */
  private nextGustAtMs: number
  /** Active gust, or null when in the calm window between gusts. */
  private activeGust: GustSample | null = null
  /** Override period for tests. */
  private gustPeriodMin: number
  private gustPeriodMax: number
  /** Forced next gust (ms from now). Tests use this to deterministically
   *  trigger an active gust without waiting on the schedule. */
  private forcedNextGustFromNowMs: number | null = null

  constructor(options: WindControllerOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? false
    this.rng = createSeededRandom(options.seed ?? 0xc0ffee)
    // Phase spread [0, 2π); tests pin via the option.
    this.phase1 =
      options.phase1 ?? this.rng.range(0, Math.PI * 2)
    this.phase2 =
      options.phase2 ?? this.rng.range(0, Math.PI * 2)
    this.gustPeriodMin = GUST_PERIOD_RANGE[0]
    this.gustPeriodMax = GUST_PERIOD_RANGE[1]
    this.nextGustAtMs = this.rng.rangeInt(
      this.gustPeriodMin,
      this.gustPeriodMax,
    )
  }

  /** Override the gust schedule. Tests pass tighter ranges to trigger
   *  gusts deterministically. */
  setGustPeriod(minMs: number, maxMs: number): void {
    if (minMs > maxMs) {
      const tmp = minMs
      minMs = maxMs
      maxMs = tmp
    }
    this.gustPeriodMin = Math.max(1, minMs)
    this.gustPeriodMax = Math.max(this.gustPeriodMin, maxMs)
    // Re-anchor the next gust window so the change takes effect promptly.
    this.nextGustAtMs = Math.min(
      this.nextGustAtMs,
      this.gustPeriodMin,
    )
  }

  /** Force the next gust to start at `msFromNow` (relative to elapsedMs). */
  forceNextGustAt(msFromNow: number): void {
    this.forcedNextGustFromNowMs = Math.max(0, msFromNow)
  }

  /** Advance the wind timeline. Returns the current sample. */
  update(deltaMs: number): number {
    if (this.reducedMotion) return 0
    const clamped = Math.min(50, Math.max(0, deltaMs))
    this.elapsedMs += clamped

    if (this.forcedNextGustFromNowMs !== null) {
      this.nextGustAtMs = this.elapsedMs + this.forcedNextGustFromNowMs
      this.forcedNextGustFromNowMs = null
    }

    if (this.activeGust === null && this.elapsedMs >= this.nextGustAtMs) {
      this.activeGust = {
        startedAtMs: this.elapsedMs,
        rampMs: this.rng.rangeInt(GUST_RAMP_RANGE[0], GUST_RAMP_RANGE[1]),
        peakMs: GUST_PEAK_MS,
        decayMs: this.rng.rangeInt(
          GUST_DECAY_RANGE[0],
          GUST_DECAY_RANGE[1],
        ),
      }
    }

    if (this.activeGust !== null) {
      const env = computeGustEnvelope(
        this.elapsedMs - this.activeGust.startedAtMs,
        this.activeGust.rampMs,
        this.activeGust.peakMs,
        this.activeGust.decayMs,
      )
      if (env <= 0) {
        this.activeGust = null
        this.nextGustAtMs =
          this.elapsedMs +
          this.rng.rangeInt(this.gustPeriodMin, this.gustPeriodMax)
      }
      return computeWindSample(
        this.elapsedMs / 1000,
        this.phase1,
        this.phase2,
        env,
      )
    }

    return computeWindSample(
      this.elapsedMs / 1000,
      this.phase1,
      this.phase2,
      0,
    )
  }

  /** Current wind sample without advancing the clock. */
  getSample(): number {
    if (this.reducedMotion) return 0
    if (this.activeGust !== null) {
      const env = computeGustEnvelope(
        this.elapsedMs - this.activeGust.startedAtMs,
        this.activeGust.rampMs,
        this.activeGust.peakMs,
        this.activeGust.decayMs,
      )
      return computeWindSample(
        this.elapsedMs / 1000,
        this.phase1,
        this.phase2,
        env,
      )
    }
    return computeWindSample(
      this.elapsedMs / 1000,
      this.phase1,
      this.phase2,
      0,
    )
  }

  getElapsedSeconds(): number {
    return this.elapsedMs / 1000
  }

  getElapsedMs(): number {
    return this.elapsedMs
  }

  getPhase1(): number {
    return this.phase1
  }

  getPhase2(): number {
    return this.phase2
  }
}