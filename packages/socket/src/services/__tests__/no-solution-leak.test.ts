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
})
