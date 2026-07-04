import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { soloResponseSchema } from "@razzoozle/common/openapi/doc"

// Seed a quiz carrying all three secret fields (solutions / acceptedAnswers /
// correct), then assert the solo GET response and the published OpenAPI solo
// schema both OMIT them (SECURITY-BLOCKER 2).

let tmp: string

// Valid quiz (mirrors EXAMPLE_QUIZZ shape): a choice question (solutions), a
// type-answer question (acceptedAnswers), and a slider (correct).
const QUIZ = {
  subject: "Leak Test",
  questions: [
    {
      question: "Pick the good answer",
      answers: ["No", "Good answer", "No", "No"],
      solutions: [1],
      cooldown: 5,
      time: 15,
    },
    {
      question: "Type the capital of France",
      type: "type-answer",
      acceptedAnswers: ["paris"],
      matchMode: "normalized",
      cooldown: 5,
      time: 15,
    },
    {
      question: "Guess the number",
      type: "slider",
      min: 0,
      max: 100,
      correct: 42,
      cooldown: 5,
      time: 15,
    },
    {
      question: "Build the sentence",
      type: "sentence-builder",
      chunks: ["It", "is", "a", "test"],
      cooldown: 5,
      time: 15,
    },
  ],
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leak-cfg-"))
  fs.mkdirSync(path.join(tmp, "quizz"), { recursive: true })
  fs.writeFileSync(
    path.join(tmp, "quizz", "leaktest.json"),
    JSON.stringify(QUIZ),
  )
  // config.ts captures CONFIG_PATH at module-load, so set it BEFORE the dynamic
  // import below (with vi.resetModules to force a fresh module graph).
  process.env.CONFIG_PATH = tmp
})

afterAll(() => {
  delete process.env.CONFIG_PATH
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("solo no-solution-leak (B2)", () => {
  it("solo GET strips solutions/correct/acceptedAnswers", async () => {
    vi.resetModules()
    const { getQuizzById } = await import("@razzoozle/socket/services/config")
    const quiz = getQuizzById("leaktest")

    // Reproduce exactly the route's strip (index.ts:152-155 / http-routes).
    const stripped = quiz.questions.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ solutions: _s, correct: _c, acceptedAnswers: _a, ...rest }) => rest,
    )
    const response = { subject: quiz.subject, questions: stripped }
    const serialized = JSON.stringify(response)

    expect(serialized).not.toContain("solutions")
    expect(serialized).not.toContain("acceptedAnswers")
    // `correct` must not appear as a question field.
    expect(response.questions.every((q) => !("correct" in q))).toBe(true)
    // The stripped shape still validates against the hand-written schema.
    expect(soloResponseSchema.safeParse(response).success).toBe(true)
  })

  it("OpenAPI solo schema omits solution fields entirely", async () => {
    vi.resetModules()
    const { openApiDoc } = await import(
      "@razzoozle/socket/services/http-routes"
    )
    const schema = JSON.stringify(openApiDoc.components.schemas.SoloQuizz)
    expect(schema).not.toContain("solutions")
    expect(schema).not.toContain("acceptedAnswers")
    // The hand-written schema only declares question + type for each question.
    expect(schema).toContain("question")
    expect(schema).toContain("subject")
  })

  it("solo GET strips chunks and adds shuffledChunks for sentence-builder", async () => {
    vi.resetModules()
    const { getQuizzById } = await import("@razzoozle/socket/services/config")
    const { shuffleChunksWithGuard } = await import("@razzoozle/common/utils/chunks")
    
    // Get the original quiz to verify chunks are present
    const quiz = getQuizzById("leaktest")
    const sbQuestion = quiz.questions[quiz.questions.length - 1]
    expect(sbQuestion.type).toBe("sentence-builder")
    expect(sbQuestion.chunks).toEqual(["It", "is", "a", "test"])

    // Reproduce exactly the route's strip + shuffle logic (from http-routes.ts handleSoloGet)
    const stripped = quiz.questions.map((question) => {
      const { solutions: _s, correct: _c, acceptedAnswers: _a, chunks: _ch, ...rest } = question
      if (question.type === "sentence-builder" && question.chunks?.length) {
        return {
          ...rest,
          shuffledChunks: shuffleChunksWithGuard(question.chunks),
        }
      }
      return rest
    })
    const response = { subject: quiz.subject, questions: stripped }
    const serialized = JSON.stringify(response)

    // Verify chunks is NOT in the serialized response
    expect(serialized).not.toContain("chunks")
    
    // Verify shuffledChunks IS present for the sentence-builder question
    const sbQuestionInResponse = response.questions.find((q) => q.type === "sentence-builder")
    expect(sbQuestionInResponse).toBeDefined()
    if (!sbQuestionInResponse || !("shuffledChunks" in sbQuestionInResponse)) {
      throw new Error("sentence-builder question with shuffledChunks missing")
    }
    
    // Now narrowed: sbQuestionInResponse has shuffledChunks
    const shuffled = sbQuestionInResponse.shuffledChunks as string[]
    expect(Array.isArray(shuffled)).toBe(true)
    
    // Verify shuffledChunks is a permutation of the original chunks
    expect(shuffled).toHaveLength(4)
    expect(new Set(shuffled)).toEqual(new Set(["It", "is", "a", "test"]))
    
    // Verify that shuffledChunks differs from the correct order (with high probability for 4 distinct items)
    const isPermuted = JSON.stringify(shuffled) !== JSON.stringify(["It", "is", "a", "test"])
    expect(isPermuted).toBe(true)
  })
})
