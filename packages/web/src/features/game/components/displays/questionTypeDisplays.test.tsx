import { describe, it, expect, vi } from "vitest"
import type { QuestionTypeDisplay, ResponsesDisplayProps } from "./questionTypeDisplays"
import {
  QUESTION_TYPE_DISPLAYS,
  resolveDisplay,
} from "./questionTypeDisplays"

vi.mock("@razzoozle/web/features/game/animation/presets", () => ({
  useReveal: () => ({
    container: () => ({}),
    item: () => ({}),
    spring: {},
    reduced: false,
  }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// MUI-02d registered the ten extracted display types (WP-01 scaffolded the
// registry empty). This list is the single source of truth for what
// "registered" means below — a type NOT in it must fall through to the
// caller-provided fallback, never crash or silently render nothing.
const REGISTERED_TYPES = [
  "type-answer",
  "sentence-builder",
  "brainstorm",
  "slider",
  "mathematik",
  "wortarten",
  "fill-blank",
  "matching",
  "drop-pin",
  "word-cloud",
  "choice",
  "boolean",
  "poll",
  "multiple-select",
] as const

describe("questionTypeDisplays", () => {
  it("QUESTION_TYPE_DISPLAYS has an entry for every MUI-02d registered type", () => {
    for (const type of REGISTERED_TYPES) {
      expect(QUESTION_TYPE_DISPLAYS[type], `missing entry for "${type}"`).toBeTypeOf(
        "function",
      )
    }
  })

  it("QUESTION_TYPE_DISPLAYS should be Partial<Record<QuestionTypeKey, QuestionTypeDisplay>>", () => {
    expect(typeof QUESTION_TYPE_DISPLAYS).toBe("object")
  })

  it("resolveDisplay should return the fallback when type is undefined", () => {
    const fallback: QuestionTypeDisplay = () => null
    const result = resolveDisplay(undefined, fallback)
    expect(result).toBe(fallback)
  })

  it("resolveDisplay should return the fallback for a type without its own entry (e.g. sequencing)", () => {
    const fallback: QuestionTypeDisplay = () => null
    const result = resolveDisplay("sequencing", fallback)
    expect(result).toBe(fallback)
  })

  it("resolveDisplay should return the registered entry for a known type", () => {
    const fallback: QuestionTypeDisplay = () => null
    const result = resolveDisplay("choice", fallback)
    expect(result).not.toBe(fallback)
    expect(result).toBe(QUESTION_TYPE_DISPLAYS.choice)
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
