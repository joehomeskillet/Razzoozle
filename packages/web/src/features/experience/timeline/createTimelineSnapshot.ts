import type {
  ExperienceTimelineInput,
  ExperienceTimelineResult,
} from "./types"

function parsePhaseStartedAtMs(phaseStartedAt: string): number {
  return Date.parse(phaseStartedAt)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

function computeShouldSkipIntro(
  elapsedMs: number,
  phaseDurationMs: number | null,
): boolean {
  if (!Number.isFinite(elapsedMs)) {
    return false
  }
  if (elapsedMs >= 1000) {
    return true
  }
  if (phaseDurationMs !== null && Number.isFinite(phaseDurationMs)) {
    return elapsedMs >= 0.1 * phaseDurationMs
  }
  return false
}

export function createTimelineSnapshot(
  input: ExperienceTimelineInput,
  nowMs: number,
): ExperienceTimelineResult {
  const phaseStartedAtMs = parsePhaseStartedAtMs(input.phaseStartedAt)
  const phaseDurationMs = input.phaseDurationMs
  const shouldSkipIntro = computeShouldSkipIntro(
    Number.isFinite(nowMs) && Number.isFinite(phaseStartedAtMs)
      ? nowMs - phaseStartedAtMs
      : Number.NaN,
    phaseDurationMs,
  )

  if (!Number.isFinite(nowMs) || !Number.isFinite(phaseStartedAtMs)) {
    return {
      elapsedMs: 0,
      remainingMs:
        phaseDurationMs !== null && Number.isFinite(phaseDurationMs)
          ? phaseDurationMs
          : null,
      normalizedProgress: phaseDurationMs !== null ? 0 : null,
      hasFinished: false,
      shouldSkipIntro,
    }
  }

  const elapsedMs = nowMs - phaseStartedAtMs

  if (phaseDurationMs === null) {
    return {
      elapsedMs,
      remainingMs: null,
      normalizedProgress: null,
      hasFinished: false,
      shouldSkipIntro: computeShouldSkipIntro(elapsedMs, null),
    }
  }

  if (!Number.isFinite(phaseDurationMs)) {
    return {
      elapsedMs,
      remainingMs: null,
      normalizedProgress: null,
      hasFinished: false,
      shouldSkipIntro: computeShouldSkipIntro(elapsedMs, null),
    }
  }

  if (elapsedMs >= phaseDurationMs) {
    return {
      elapsedMs,
      remainingMs: 0,
      normalizedProgress: 1,
      hasFinished: true,
      shouldSkipIntro: computeShouldSkipIntro(elapsedMs, phaseDurationMs),
    }
  }

  const remainingMs = Math.max(0, phaseDurationMs - elapsedMs)
  const normalizedProgress = clamp01(elapsedMs / phaseDurationMs)

  return {
    elapsedMs,
    remainingMs,
    normalizedProgress,
    hasFinished: false,
    shouldSkipIntro: computeShouldSkipIntro(elapsedMs, phaseDurationMs),
  }
}
