// Unit tests for calculateSoloRecapStats: unscored (poll) answers should not affect
// correct/wrong counts or accuracy calculation. Streak should not break on unscored.
//
// Pure TS — no jsdom, no Testing Library (web package runs vitest in `node` env).
// Tests call the exported calculateSoloRecapStats function directly from the product.

import { describe, expect, it } from "vitest"
import type { SoloQuestionResult } from "@razzoozle/web/features/game/stores/solo"
import { calculateSoloRecapStats } from "./SoloFinishedScreen"

describe("calculateSoloRecapStats – unscored (poll) handling", () => {
  it("requires poll flag on SoloQuestionResult to compile", () => {
    // This test verifies the poll field is present in SoloQuestionResult type.
    // If the field is missing, this will fail at compile time.
    const answer: SoloQuestionResult = {
      questionIndex: 0,
      correct: true,
      points: 10,
      achievements: [],
      poll: true,
    }
    expect(answer.poll).toBe(true)
  })

  it("excludes poll answers from correct/wrong count and accuracy", () => {
    const answers: SoloQuestionResult[] = [
      { questionIndex: 0, correct: true, points: 10, achievements: [] },
      { questionIndex: 1, correct: false, points: 0, achievements: [] },
      {
        questionIndex: 2,
        correct: false,
        points: 0,
        achievements: [],
        poll: true, // Unscored
      },
    ]

    const stats = calculateSoloRecapStats(answers)

    // With 2 scored (1 correct, 1 wrong):
    // correct should be 1 (not 2)
    // wrong should be 1 (not 2)
    // accuracy should be 50% (1/2, not 1/3)
    expect(stats.correct).toBe(1)
    expect(stats.wrong).toBe(1)
    expect(stats.accuracyPct).toBe(50)
  })

  it("does not break streak on unscored answers", () => {
    const answers: SoloQuestionResult[] = [
      { questionIndex: 0, correct: true, points: 10, achievements: [] },
      { questionIndex: 1, correct: true, points: 10, achievements: [] },
      {
        questionIndex: 2,
        correct: false,
        points: 0,
        achievements: [],
        poll: true, // Unscored poll — should skip
      },
      { questionIndex: 3, correct: true, points: 10, achievements: [] },
    ]

    const stats = calculateSoloRecapStats(answers)

    // Peak streak should be 3 (0,1 correct + skip 2 + 3 correct = streak continues)
    // not 1 (if poll broke the streak)
    expect(stats.peakStreak).toBe(3)
  })

  it("handles all-unscored case gracefully (0% accuracy, 0 correct/wrong)", () => {
    const answers: SoloQuestionResult[] = [
      {
        questionIndex: 0,
        correct: true,
        points: 0,
        achievements: [],
        poll: true,
      },
      {
        questionIndex: 1,
        correct: false,
        points: 0,
        achievements: [],
        poll: true,
      },
    ]

    const stats = calculateSoloRecapStats(answers)

    expect(stats.correct).toBe(0)
    expect(stats.wrong).toBe(0)
    expect(stats.accuracyPct).toBe(0)
    expect(stats.peakStreak).toBe(0)
  })

  it("handles mixed scored/unscored with multiple streaks", () => {
    const answers: SoloQuestionResult[] = [
      { questionIndex: 0, correct: true, points: 10, achievements: [] },
      {
        questionIndex: 1,
        correct: false,
        points: 0,
        achievements: [],
        poll: true, // Skip
      },
      { questionIndex: 2, correct: true, points: 10, achievements: [] },
      { questionIndex: 3, correct: true, points: 10, achievements: [] },
      { questionIndex: 4, correct: false, points: 0, achievements: [] },
      {
        questionIndex: 5,
        correct: true,
        points: 10,
        achievements: [],
        poll: true, // Skip
      },
      { questionIndex: 6, correct: true, points: 10, achievements: [] },
    ]

    const stats = calculateSoloRecapStats(answers)

    // Scored: [correct, correct, correct, wrong, correct]
    // correct=4, wrong=1, accuracy=80%
    // Streaks: 1 (q0) → skip q1 → 2 (q2,3) → reset (q4) → 0 → skip q5 → 1 (q6)
    // peak=3 (q0,q2,q3 are consecutive when skipping polls)
    expect(stats.correct).toBe(4)
    expect(stats.wrong).toBe(1)
    expect(stats.accuracyPct).toBe(80)
    expect(stats.peakStreak).toBe(3)
  })
})
