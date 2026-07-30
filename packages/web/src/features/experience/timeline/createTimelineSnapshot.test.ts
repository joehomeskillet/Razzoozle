import { describe, expect, it } from "vitest"

import { createTimelineSnapshot } from "./createTimelineSnapshot"
import type { ExperienceTimelineInput } from "./types"

const PHASE_START_MS = 1_700_000_000_000

type SnapshotCase = {
  name: string
  input: ExperienceTimelineInput
  nowMs: number
  expected: {
    elapsedMs: number
    remainingMs: number | null
    normalizedProgress: number | null
    hasFinished: boolean
    shouldSkipIntro: boolean
  }
}

const cases: SnapshotCase[] = [
  {
    name: "fresh phase at start",
    input: {
      revision: 1,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 10_000,
    },
    nowMs: PHASE_START_MS,
    expected: {
      elapsedMs: 0,
      remainingMs: 10_000,
      normalizedProgress: 0,
      hasFinished: false,
      shouldSkipIntro: false,
    },
  },
  {
    name: "running phase mid-way",
    input: {
      revision: 2,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 10_000,
    },
    nowMs: PHASE_START_MS + 4_250,
    expected: {
      elapsedMs: 4_250,
      remainingMs: 5_750,
      normalizedProgress: 0.425,
      hasFinished: false,
      shouldSkipIntro: true,
    },
  },
  {
    name: "reconnect mid-phase preserves elapsed time",
    input: {
      revision: 3,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 8_000,
    },
    nowMs: PHASE_START_MS + 3_200,
    expected: {
      elapsedMs: 3_200,
      remainingMs: 4_800,
      normalizedProgress: 0.4,
      hasFinished: false,
      shouldSkipIntro: true,
    },
  },
  {
    name: "expired phase",
    input: {
      revision: 4,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 5_000,
    },
    nowMs: PHASE_START_MS + 7_500,
    expected: {
      elapsedMs: 7_500,
      remainingMs: 0,
      normalizedProgress: 1,
      hasFinished: true,
      shouldSkipIntro: true,
    },
  },
  {
    name: "null duration open-ended phase",
    input: {
      revision: 5,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: null,
    },
    nowMs: PHASE_START_MS + 99_999,
    expected: {
      elapsedMs: 99_999,
      remainingMs: null,
      normalizedProgress: null,
      hasFinished: false,
      shouldSkipIntro: true,
    },
  },
  {
    name: "clock skew with late client now",
    input: {
      revision: 6,
      phaseStartedAt: new Date(PHASE_START_MS + 1_000).toISOString(),
      phaseDurationMs: 6_000,
      serverNow: new Date(PHASE_START_MS + 2_400).toISOString(),
    },
    nowMs: PHASE_START_MS + 2_400,
    expected: {
      elapsedMs: 1_400,
      remainingMs: 4_600,
      normalizedProgress: 1_400 / 6_000,
      hasFinished: false,
      shouldSkipIntro: true,
    },
  },
]

describe("createTimelineSnapshot", () => {
  it.each(cases)("$name", ({ input, nowMs, expected }) => {
    const result = createTimelineSnapshot(input, nowMs)
    expect(result).toEqual(expected)
  })

  it("returns identical results for identical (input, nowMs)", () => {
    const input: ExperienceTimelineInput = {
      revision: 7,
      phaseStartedAt: new Date(PHASE_START_MS).toISOString(),
      phaseDurationMs: 12_000,
    }
    const nowMs = PHASE_START_MS + 6_000

    const first = createTimelineSnapshot(input, nowMs)
    const second = createTimelineSnapshot(input, nowMs)

    expect(first).toEqual(second)
    expect(first).toEqual({
      elapsedMs: 6_000,
      remainingMs: 6_000,
      normalizedProgress: 0.5,
      hasFinished: false,
      shouldSkipIntro: true,
    })
  })
})
