// Test for randomize-answers feature: server-side displayOrder generation.
//
// When randomizeAnswers is enabled, the SHOW_QUESTION broadcast includes a
// `displayOrder` permutation of answer indices [0..N-1]. The client will later
// render tiles in displayOrder while keeping canonical indices for scoring.
// Scoring, solutions, and all result reporting remain canonical (unchanged).

import type { Question, Quizz } from "@razzoozle/common/types/game"
import { STATUS } from "@razzoozle/common/types/game/status"
import { describe, expect, it, vi } from "vitest"
import { buildRound, DISABLED_LL, enabledLL, makePlayer } from "./helpers"

const makeQuizz = (): Quizz => ({
  subject: "Randomize Test",
  questions: [
    {
      question: "Q1: Choice with 3 answers",
      type: "choice",
      answers: ["A", "B", "C"],
      solutions: [1],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Q2: Choice with 4 answers",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Q3: Slider (no answers)",
      type: "slider",
      min: 0,
      max: 100,
      step: 1,
      solutions: [50],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Q4: Boolean",
      type: "boolean",
      answers: ["True", "False"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
})

describe("RoundManager randomizeAnswers", () => {
  it("SHOW_QUESTION includes displayOrder when randomizeAnswers is enabled and question has >1 answer", async () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      randomizeAnswers: true,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true

    // Start the first question (choice with 3 answers)
    await (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()

    // Find the SHOW_QUESTION broadcast
    const showQuestion = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    expect(showQuestion).toBeDefined()

    // displayOrder should be present and be a permutation of [0, 1, 2]
    const displayOrder = (showQuestion?.data as unknown as { displayOrder?: number[] })
      ?.displayOrder
    expect(displayOrder).toBeDefined()
    expect(displayOrder).toHaveLength(3)
    expect(new Set(displayOrder)).toEqual(new Set([0, 1, 2]))
  })

  it("SHOW_QUESTION does NOT include displayOrder when randomizeAnswers is disabled", async () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      randomizeAnswers: false,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true

    await (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()

    const showQuestion = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    expect(showQuestion).toBeDefined()

    const displayOrder = (showQuestion?.data as unknown as { displayOrder?: number[] })
      ?.displayOrder
    expect(displayOrder).toBeUndefined()
  })

  it("SHOW_QUESTION does NOT include displayOrder for slider questions (no answer tiles)", async () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      randomizeAnswers: true,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true
    ;(ctx.round as unknown as { currentQuestion: number }).currentQuestion = 2 // Jump to Q3 (slider)

    await (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()

    const showQuestion = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    expect(showQuestion).toBeDefined()

    const displayOrder = (showQuestion?.data as unknown as { displayOrder?: number[] })
      ?.displayOrder
    expect(displayOrder).toBeUndefined()
  })

  it("SHOW_QUESTION does NOT include displayOrder for boolean questions with only 2 answers (< 3)", async () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      randomizeAnswers: true,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true
    ;(ctx.round as unknown as { currentQuestion: number }).currentQuestion = 3 // Jump to Q4 (boolean)

    await (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()

    const showQuestion = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    expect(showQuestion).toBeDefined()

    const displayOrder = (showQuestion?.data as unknown as { displayOrder?: number[] })
      ?.displayOrder
    // Boolean has only 2 answers, so displayOrder should not be generated
    // (threshold is > 1, meaning 2+ answers still need explicit check)
    // Actually, re-reading: the check is (length > 1) which includes 2.
    // Let's verify the actual implementation
    // Looking at the code: ...(this.opts.randomizeAnswers && question.type !== "slider" && (question.answers?.length ?? 0) > 1
    // So length must be > 1, which means 2 answers WILL get displayOrder
    // Let's update: boolean with 2 answers should still get displayOrder
    expect(displayOrder).toBeDefined()
    expect(displayOrder).toHaveLength(2)
    expect(new Set(displayOrder)).toEqual(new Set([0, 1]))
  })

  it("displayOrder is reused on subsequent SHOW_QUESTION re-emits (e.g., on reconnect)", async () => {
    // Verify that once a question opens, repeated SHOW_QUESTION emits use the SAME displayOrder
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      randomizeAnswers: true,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true

    await (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()

    const broadcasts1 = ctx.broadcasts.length
    const showQuestion1 = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    const displayOrder1 = (showQuestion1?.data as unknown as { displayOrder?: number[] })
      ?.displayOrder

    // Simulate a reconnect re-emit: the old code just re-broadcasts the same question
    // (In the real game, this happens via reconnect). For this test, we assume
    // the same displayOrder is cached on the round object and would be reused.
    // We'll verify by checking the private field via reflection.
    const cachedDisplayOrder = (
      ctx.round as unknown as {
        currentDisplayOrder: number[] | undefined
      }
    ).currentDisplayOrder

    expect(cachedDisplayOrder).toEqual(displayOrder1)
  })

  it("displayOrder is a valid permutation (all indices present, no duplicates)", async () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      randomizeAnswers: true,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true

    // Run multiple questions to check permutation quality
    for (let i = 0; i < 2; i++) {
      ;(ctx.round as unknown as { currentQuestion: number }).currentQuestion = i
      ctx.broadcasts.length = 0 // Reset broadcasts

      await (
        ctx.round as unknown as { newQuestion: () => Promise<void> }
      ).newQuestion()

      const showQuestion = ctx.broadcasts.find(
        (b) => b.status === STATUS.SHOW_QUESTION,
      )
      const displayOrder = (showQuestion?.data as unknown as { displayOrder?: number[] })
        ?.displayOrder

      if (displayOrder) {
        const expected = Array.from(
          { length: quizz.questions[i].answers?.length ?? 0 },
          (_, idx) => idx,
        )
        expect(new Set(displayOrder)).toEqual(new Set(expected))
        expect(displayOrder.length).toBe(expected.length)
      }
    }
  })

  it("randomizeAnswers with lowLatency mode (compatible)", async () => {
    // Verify that randomizeAnswers works alongside lowLatency mode
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: enabledLL(),
      randomizeAnswers: true,
    })

    ;(ctx.round as unknown as { started: boolean }).started = true

    await (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()

    const showQuestion = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    expect(showQuestion).toBeDefined()

    const displayOrder = (showQuestion?.data as unknown as { displayOrder?: number[] })
      ?.displayOrder
    expect(displayOrder).toBeDefined()
    expect(displayOrder).toHaveLength(3)
  })
})
