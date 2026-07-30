import { describe, it, expect } from "vitest"
import type { QuestionTypeDisplay, ResponsesDisplayProps } from "./questionTypeDisplays"
import {
  QUESTION_TYPE_DISPLAYS,
  resolveDisplay,
} from "./questionTypeDisplays"

describe("questionTypeDisplays", () => {
  it("QUESTION_TYPE_DISPLAYS should be an empty object", () => {
    expect(QUESTION_TYPE_DISPLAYS).toEqual({})
  })

  it("QUESTION_TYPE_DISPLAYS should be Partial<Record<QuestionTypeKey, QuestionTypeDisplay>>", () => {
    expect(typeof QUESTION_TYPE_DISPLAYS).toBe("object")
  })

  it("resolveDisplay should return the fallback when type is undefined", () => {
    const fallback: QuestionTypeDisplay = () => null
    const result = resolveDisplay(undefined, fallback)
    expect(result).toBe(fallback)
  })

  it("resolveDisplay should return the fallback when type is not found in QUESTION_TYPE_DISPLAYS", () => {
    const fallback: QuestionTypeDisplay = () => null
    const result = resolveDisplay("choice" as any, fallback)
    expect(result).toBe(fallback)
  })

  it("ResponsesDisplayProps should have all required fields", () => {
    const props: ResponsesDisplayProps = {
      question: "test",
      responses: { 0: 1 },
      solutions: [0],
      answers: ["a"],
    }
    expect(props.question).toBe("test")
  })
})
