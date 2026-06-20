import type { PlayerAnswerRecord, QuestionResult } from "@razzoozle/common/types/game"
import { describe, expect, it } from "vitest"

import { isAnswerCorrect } from "@razzoozle/web/features/manager/utils/answerCorrectness"

// Helper to create a minimal but valid QuestionResult for testing.
const makeQuestion = (
  overrides: Partial<QuestionResult> = {},
): QuestionResult => ({
  question: "Test question",
  type: "choice",
  answers: ["Answer A", "Answer B", "Answer C"],
  solutions: [0],
  cooldown: 3,
  time: 5,
  playerAnswers: [],
  ...overrides,
})

describe("isAnswerCorrect", () => {
  describe("poll type", () => {
    it("always returns false for poll questions", () => {
      const question = makeQuestion({ type: "poll" })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 0,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })
  })

  describe("choice type", () => {
    it("returns true when answerId matches a solution", () => {
      const question = makeQuestion({
        type: "choice",
        solutions: [1, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 2,
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns false when answerId does not match any solution", () => {
      const question = makeQuestion({
        type: "choice",
        solutions: [0, 1],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 2,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when no answer provided (answerId is null)", () => {
      const question = makeQuestion({
        type: "choice",
        solutions: [0],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })
  })

  describe("boolean type", () => {
    it("returns true when answer matches solution", () => {
      const question = makeQuestion({
        type: "boolean",
        answers: ["True", "False"],
        solutions: [0],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 0,
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns false when answer does not match solution", () => {
      const question = makeQuestion({
        type: "boolean",
        answers: ["True", "False"],
        solutions: [0],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 1,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })
  })

  describe("type-answer", () => {
    it("returns true for normalized match", () => {
      const question = makeQuestion({
        type: "type-answer",
        acceptedAnswers: ["Paris"],
        matchMode: "normalized",
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerText: "paris",
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns true for exact match", () => {
      const question = makeQuestion({
        type: "type-answer",
        acceptedAnswers: ["Paris"],
        matchMode: "exact",
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerText: "Paris",
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns false for exact mismatch (case-sensitive)", () => {
      const question = makeQuestion({
        type: "type-answer",
        acceptedAnswers: ["Paris"],
        matchMode: "exact",
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerText: "paris",
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when no answerText provided", () => {
      const question = makeQuestion({
        type: "type-answer",
        acceptedAnswers: ["Paris"],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("defaults to normalized match mode when not specified", () => {
      const question = makeQuestion({
        type: "type-answer",
        acceptedAnswers: ["Café"],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerText: "cafe",
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })
  })

  describe("multiple-select", () => {
    it("returns true when all solutions are selected", () => {
      const question = makeQuestion({
        type: "multiple-select",
        solutions: [0, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerIds: [0, 2],
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns true when all solutions are selected in different order", () => {
      const question = makeQuestion({
        type: "multiple-select",
        solutions: [0, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerIds: [2, 0],
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns false when not all solutions are selected", () => {
      const question = makeQuestion({
        type: "multiple-select",
        solutions: [0, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerIds: [0],
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when extra answers are selected", () => {
      const question = makeQuestion({
        type: "multiple-select",
        solutions: [0, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerIds: [0, 1, 2],
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when no answers are selected", () => {
      const question = makeQuestion({
        type: "multiple-select",
        solutions: [0, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
        answerIds: [],
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when answerIds is null", () => {
      const question = makeQuestion({
        type: "multiple-select",
        solutions: [0, 2],
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })
  })

  describe("slider", () => {
    it("returns true when answer is within 5% threshold", () => {
      const question = makeQuestion({
        type: "slider",
        min: 0,
        max: 100,
        step: 1,
        correct: 50,
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 52,
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("uses step as minimum threshold", () => {
      const question = makeQuestion({
        type: "slider",
        min: 0,
        max: 100,
        step: 10,
        correct: 50,
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 55,
      }

      expect(isAnswerCorrect(question, pa)).toBe(true)
    })

    it("returns false when answer exceeds threshold", () => {
      const question = makeQuestion({
        type: "slider",
        min: 0,
        max: 100,
        step: 1,
        correct: 50,
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 56,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when no answer provided", () => {
      const question = makeQuestion({
        type: "slider",
        min: 0,
        max: 100,
        correct: 50,
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: null,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })

    it("returns false when no correct value is set", () => {
      const question = makeQuestion({
        type: "slider",
        min: 0,
        max: 100,
      })
      const pa: PlayerAnswerRecord = {
        playerName: "Player 1",
        answerId: 50,
      }

      expect(isAnswerCorrect(question, pa)).toBe(false)
    })
  })
})
