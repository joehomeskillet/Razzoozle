// Unit tests for the solo-play answer evaluator (answer-eval.ts).
// Covers each question type: choice, boolean, slider, multiple-select,
// type-answer, poll. Pure functions — no I/O or socket mocking required.

import { evaluateAnswer } from "@razzoozle/socket/services/game/answer-eval"
import type { Question } from "@razzoozle/common/types/game"
import { describe, expect, it } from "vitest"

// Minimal question builder to keep tests concise.
const makeChoice = (
  solutions: number[],
  opts: Partial<Question> = {},
): Question =>
  ({
    question: "Q?",
    type: "choice",
    answers: ["A", "B", "C", "D"],
    solutions,
    cooldown: 5,
    time: 20,
    ...opts,
  }) as unknown as Question

const makeBoolean = (solutions: number[]): Question =>
  ({
    question: "True or false?",
    type: "boolean",
    answers: ["True", "False"],
    solutions,
    cooldown: 5,
    time: 20,
  }) as unknown as Question

const makeSlider = (
  min: number,
  max: number,
  correct: number,
  step?: number,
): Question =>
  ({
    question: "Slider Q?",
    type: "slider",
    min,
    max,
    correct,
    step,
    cooldown: 5,
    time: 30,
  }) as unknown as Question

const makeMultipleSelect = (solutions: number[]): Question =>
  ({
    question: "Multi Q?",
    type: "multiple-select",
    answers: ["A", "B", "C", "D"],
    solutions,
    cooldown: 5,
    time: 30,
  }) as unknown as Question

const makeTypeAnswer = (
  acceptedAnswers: string[],
  matchMode?: "exact" | "normalized" | "fuzzy",
): Question =>
  ({
    question: "Type the answer:",
    type: "type-answer",
    acceptedAnswers,
    matchMode,
    cooldown: 5,
    time: 30,
  }) as unknown as Question

const makePoll = (): Question =>
  ({
    question: "Poll Q?",
    type: "poll",
    answers: ["Yes", "No", "Maybe"],
    cooldown: 5,
    time: 15,
  }) as unknown as Question

// ── choice ────────────────────────────────────────────────────────────────────

describe("evaluateAnswer — choice", () => {
  it("correct answer → correct=true, base=1", () => {
    const q = makeChoice([1])
    expect(evaluateAnswer(q, { answerId: 1 })).toEqual({ correct: true, base: 1 })
  })

  it("wrong answer → correct=false, base=0", () => {
    const q = makeChoice([1])
    expect(evaluateAnswer(q, { answerId: 2 })).toEqual({
      correct: false,
      base: 0,
    })
  })

  it("no solutions → correct=false", () => {
    const q = makeChoice([])
    expect(evaluateAnswer(q, { answerId: 0 })).toEqual({
      correct: false,
      base: 0,
    })
  })
})

// ── boolean ───────────────────────────────────────────────────────────────────

describe("evaluateAnswer — boolean", () => {
  it("correct boolean answer", () => {
    const q = makeBoolean([0])
    expect(evaluateAnswer(q, { answerId: 0 })).toEqual({ correct: true, base: 1 })
  })

  it("wrong boolean answer", () => {
    const q = makeBoolean([0])
    expect(evaluateAnswer(q, { answerId: 1 })).toEqual({
      correct: false,
      base: 0,
    })
  })
})

// ── slider ────────────────────────────────────────────────────────────────────

describe("evaluateAnswer — slider", () => {
  // Range 0..100, correct=50, tolerance = max(step ?? 0, 100 * 0.05) = 5.
  it("exact hit → correct=true, base=1", () => {
    const q = makeSlider(0, 100, 50)
    const result = evaluateAnswer(q, { answerId: 50 })
    expect(result.correct).toBe(true)
    expect(result.base).toBeCloseTo(1)
  })

  it("within tolerance → correct=true, base<1", () => {
    const q = makeSlider(0, 100, 50)
    // 50+4 = 54; dist=4 ≤ tolerance(5)
    const result = evaluateAnswer(q, { answerId: 54 })
    expect(result.correct).toBe(true)
    expect(result.base).toBeGreaterThan(0)
    expect(result.base).toBeLessThan(1)
  })

  it("outside tolerance → correct=false, base=0", () => {
    const q = makeSlider(0, 100, 50)
    // dist=10 > tolerance(5)
    const result = evaluateAnswer(q, { answerId: 60 })
    expect(result.correct).toBe(false)
    expect(result.base).toBe(0)
  })

  it("step overrides tolerance as floor", () => {
    // step=20 → tolerance = max(20, 5) = 20
    const q = makeSlider(0, 100, 50, 20)
    const result = evaluateAnswer(q, { answerId: 70 }) // dist=20 ≤ 20
    expect(result.correct).toBe(true)
  })

  it("accuracy > 0.95 for answer very close to correct", () => {
    const q = makeSlider(0, 100, 50)
    // dist=1, accuracy = 1 - 1/100 = 0.99
    const result = evaluateAnswer(q, { answerId: 51 })
    expect(result.correct).toBe(true)
    expect(result.base).toBeGreaterThan(0.95)
  })
})

// ── multiple-select ───────────────────────────────────────────────────────────

describe("evaluateAnswer — multiple-select", () => {
  it("exact match → correct=true, base=1", () => {
    const q = makeMultipleSelect([0, 2])
    expect(evaluateAnswer(q, { answerIds: [2, 0] })).toEqual({
      correct: true,
      base: 1,
    })
  })

  it("wrong subset → correct=false", () => {
    const q = makeMultipleSelect([0, 2])
    expect(evaluateAnswer(q, { answerIds: [0, 1] })).toEqual({
      correct: false,
      base: 0,
    })
  })

  it("superset → correct=false (size mismatch)", () => {
    const q = makeMultipleSelect([0, 2])
    expect(evaluateAnswer(q, { answerIds: [0, 1, 2] })).toEqual({
      correct: false,
      base: 0,
    })
  })

  it("missing answerIds → type-routed rejection (no fallthrough)", () => {
    const q = makeMultipleSelect([0, 2])
    // Multiple-select questions are type-routed and do NOT fall through.
    // Missing answerIds is an invalid submission for a multiple-select question.
    expect(evaluateAnswer(q, { answerId: 0 }).correct).toBe(false)
    expect(evaluateAnswer(q, { answerId: 1 }).correct).toBe(false)
  })

  it("undefined answerIds array → type-routed rejection", () => {
    const q = makeMultipleSelect([0, 2])
    // Empty submission (no answerIds) → invalid.
    expect(evaluateAnswer(q, {}).correct).toBe(false)
  })
})

// ── type-answer ───────────────────────────────────────────────────────────────

describe("evaluateAnswer — type-answer", () => {
  it("normalized match (default mode)", () => {
    const q = makeTypeAnswer(["Paris"])
    expect(evaluateAnswer(q, { answerText: "paris" })).toEqual({
      correct: true,
      base: 1,
    })
  })

  it("exact mode: case matters", () => {
    const q = makeTypeAnswer(["Paris"], "exact")
    expect(evaluateAnswer(q, { answerText: "Paris" })).toEqual({
      correct: true,
      base: 1,
    })
    expect(evaluateAnswer(q, { answerText: "paris" })).toEqual({
      correct: false,
      base: 0,
    })
  })

  it("fuzzy mode: single typo accepted for long word", () => {
    // "Stockholm" (9 chars) → threshold = max(1, floor(9/10)) = 1.
    // "Stockhol" → distance 1 → matches.
    const q = makeTypeAnswer(["Stockholm"], "fuzzy")
    expect(evaluateAnswer(q, { answerText: "Stockhol" }).correct).toBe(true)
  })

  it("no answerText → correct=false", () => {
    const q = makeTypeAnswer(["Paris"])
    expect(evaluateAnswer(q, {})).toEqual({ correct: false, base: 0 })
  })

  it("no acceptedAnswers → correct=false", () => {
    const q: Question = {
      question: "Type something",
      type: "type-answer",
      acceptedAnswers: [],
      cooldown: 5,
      time: 30,
    } as unknown as Question
    expect(evaluateAnswer(q, { answerText: "anything" })).toEqual({
      correct: false,
      base: 0,
    })
  })
})

// ── poll ──────────────────────────────────────────────────────────────────────

describe("evaluateAnswer — poll", () => {
  it("always returns correct=false, base=0", () => {
    const q = makePoll()
    expect(evaluateAnswer(q, { answerId: 0 })).toEqual({
      correct: false,
      base: 0,
    })
    expect(evaluateAnswer(q, { answerId: 1 })).toEqual({
      correct: false,
      base: 0,
    })
  })
})
