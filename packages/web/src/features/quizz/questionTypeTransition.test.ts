import { describe, it, expect } from "vitest"
import { buildTypePatch, getClearedNonEmptyFields } from "./questionTypeTransition"
import type { Question } from "@razzoozle/common/types/game"

/**
 * Fixture questions: one representative from each of the 5 V3 type categories.
 * Used to verify buildTypePatch behavior across category boundaries.
 */
const fixtures = {
  // Basis-Auswahl: choice (default)
  choice: {
    type: "choice" as const,
    question: "What is 2+2?",
    answers: ["3", "4", "5", "6"],
    solutions: [1],
    min: 10,
    max: 100,
    correct: 50,
    step: 5,
    unit: "km",
  },
  // Umfrage & Feedback: poll
  poll: {
    type: "poll" as const,
    question: "Do you like pizza?",
    answers: ["Yes", "No", "Maybe"],
    solutions: [0],
    min: 0,
    max: 10,
  },
  // Numerisch: slider
  slider: {
    type: "slider" as const,
    question: "Pick a number",
    min: 0,
    max: 100,
    correct: 50,
    step: 10,
    unit: "meters",
    answers: ["a", "b"],
  },
  // Text-Eingabe: type-answer
  typeAnswer: {
    type: "type-answer" as const,
    question: "Enter the capital",
    acceptedAnswers: ["Berlin", "berlin"],
    matchMode: "normalized" as const,
    answers: ["old"],
    min: 5,
  },
  // Anordnung: sequencing
  sequencing: {
    type: "sequencing" as const,
    question: "Order these steps",
    items: [{ id: "1" }, { id: "2" }],
    correctOrder: ["1", "2"],
    answers: ["old"],
  },
}

describe("buildTypePatch", () => {
  it("should transition choice → boolean with filtered solutions", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "boolean")

    expect(patch.type).toBe("boolean")
    expect(patch.answers).toEqual(["Wahr", "Falsch"])
    // Solutions filtered to < 2
    expect(patch.solutions).toEqual([1])
    // Slider fields cleared
    expect(patch.min).toBeUndefined()
    expect(patch.max).toBeUndefined()
    expect(patch.correct).toBeUndefined()
    expect(patch.step).toBeUndefined()
    expect(patch.unit).toBeUndefined()
  })

  it("should transition choice → boolean and default to [0] when filter is empty", () => {
    const current = { type: "choice" as const, solutions: [5, 10] }
    const patch = buildTypePatch(current, "boolean")

    expect(patch.type).toBe("boolean")
    expect(patch.answers).toEqual(["Wahr", "Falsch"])
    // All solutions >= 2, so filter is empty; must default to [0]
    expect(patch.solutions).toEqual([0])
  })

  it("should transition choice → boolean and default to [0] when solutions undefined", () => {
    const current = { type: "choice" as const, question: "test" }
    const patch = buildTypePatch(current, "boolean")

    expect(patch.type).toBe("boolean")
    expect(patch.answers).toEqual(["Wahr", "Falsch"])
    // No solutions to filter; must default to [0]
    expect(patch.solutions).toEqual([0])
  })

  it("should transition choice → slider with defaults", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "slider")

    expect(patch.type).toBe("slider")
    // Inherits from current if available
    expect(patch.min).toBe(10)
    expect(patch.max).toBe(100)
    expect(patch.correct).toBe(50)
    expect(patch.step).toBe(5)
    expect(patch.unit).toBe("km")
    // Choice fields cleared
    expect(patch.answers).toBeUndefined()
    expect(patch.solutions).toBeUndefined()
  })

  it("should transition to slider with fallback defaults when current lacks values", () => {
    const current = { type: "choice" as const, question: "test" }
    const patch = buildTypePatch(current, "slider")

    expect(patch.type).toBe("slider")
    expect(patch.min).toBe(0)
    expect(patch.max).toBe(100)
    expect(patch.correct).toBe(50)
    expect(patch.step).toBe(1)
    expect(patch.unit).toBe("")
  })

  it("should transition choice → poll with default answers", () => {
    const current = { type: "choice" as const, question: "test" }
    const patch = buildTypePatch(current, "poll")

    expect(patch.type).toBe("poll")
    expect(patch.answers).toEqual(["", ""])
    expect(patch.solutions).toEqual([])
    expect(patch.bonus).toBeUndefined()
  })

  it("should transition choice → poll and preserve answers if present", () => {
    const current = fixtures.poll
    const patch = buildTypePatch(current, "poll")

    expect(patch.type).toBe("poll")
    expect(patch.answers).toEqual(["Yes", "No", "Maybe"])
    expect(patch.solutions).toEqual([])
  })

  it("should transition to multiple-select with solutions", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "multiple-select")

    expect(patch.type).toBe("multiple-select")
    expect(patch.answers).toEqual(["3", "4", "5", "6"])
    // solutions has length 1 (not >= 2), so defaults to [0, 1]
    expect(patch.solutions).toEqual([0, 1])
  })

  it("should transition to multiple-select with 2+ solutions preserved", () => {
    const current = {
      type: "choice" as const,
      answers: ["a", "b", "c"],
      solutions: [0, 2],
    }
    const patch = buildTypePatch(current, "multiple-select")

    expect(patch.type).toBe("multiple-select")
    expect(patch.solutions).toEqual([0, 2])
  })

  it("should transition to type-answer with defaults", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "type-answer")

    expect(patch.type).toBe("type-answer")
    expect(patch.answers).toBeUndefined()
    expect(patch.solutions).toBeUndefined()
    expect(patch.acceptedAnswers).toEqual([])
    expect(patch.matchMode).toBe("normalized")
  })

  it("should transition to type-answer and preserve existing values", () => {
    const current = fixtures.typeAnswer
    const patch = buildTypePatch(current, "type-answer")

    expect(patch.type).toBe("type-answer")
    expect(patch.acceptedAnswers).toEqual(["Berlin", "berlin"])
    expect(patch.matchMode).toBe("normalized")
  })

  it("should transition to sentence-builder", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "sentence-builder")

    expect(patch.type).toBe("sentence-builder")
    expect(patch.chunks).toEqual(["", ""])
    expect(patch.answers).toBeUndefined()
    expect(patch.solutions).toBeUndefined()
  })

  it("should transition to sequencing", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "sequencing")

    expect(patch.type).toBe("sequencing")
    expect(patch.items).toEqual([])
    expect(patch.correctOrder).toEqual([])
    expect(patch.answers).toBeUndefined()
    expect(patch.chunks).toBeUndefined()
  })

  it("should transition to mathematik with specific decimals/tolerance", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "mathematik")

    expect(patch.type).toBe("mathematik")
    expect(patch.correct).toBe(0)
    expect(patch.tolerance).toBe(0.1)
    expect(patch.decimals).toBe(2)
    // ORPHANED-FIELD: uses individual clears, not SLIDER_CLEAR
    expect(patch.min).toBeUndefined()
    expect(patch.max).toBeUndefined()
  })

  it("should transition to wortarten with posSet", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "wortarten")

    expect(patch.type).toBe("wortarten")
    expect(patch.sentence).toBe("")
    expect(patch.tokens).toEqual([])
    expect(patch.posSet).toEqual([
      "Nomen",
      "Verb",
      "Adjektiv",
      "Artikel",
      "Pronomen",
      "Adverb",
      "Präposition",
      "Konjunktion",
    ])
    // ORPHANED-FIELD: uses individual clears
    expect(patch.min).toBeUndefined()
    expect(patch.correct).toBeUndefined()
  })

  it("should transition to fill-blank", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "fill-blank")

    expect(patch.type).toBe("fill-blank")
    expect(patch.segments).toEqual(["", ""])
    expect(patch.slots).toEqual([{ options: ["", ""], correctIndex: 0 }])
    expect(patch.answers).toBeUndefined()
    expect(patch.items).toBeUndefined()
  })

  it("should transition to matching", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "matching")

    expect(patch.type).toBe("matching")
    expect(patch.leftItems).toEqual([{ label: "", options: ["", ""], correctIndex: 0 }])
    expect(patch.answers).toBeUndefined()
  })

  it("should transition to drop-pin", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "drop-pin")

    expect(patch.type).toBe("drop-pin")
    expect(patch.hotspots).toEqual([{ x: 0.25, y: 0.25, w: 0.25, h: 0.25 }])
    expect(patch.answers).toBeUndefined()
  })

  it("should transition to word-cloud (unscored)", () => {
    const current = fixtures.poll
    const patch = buildTypePatch(current, "word-cloud")

    expect(patch.type).toBe("word-cloud")
    expect(patch.answers).toEqual(["Yes", "No", "Maybe"])
    expect(patch.solutions).toEqual([])
    expect(patch.bonus).toBeUndefined()
  })

  it("should transition to brainstorm and preserve existing answers", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "brainstorm")

    expect(patch.type).toBe("brainstorm")
    // Preserves answers if present
    expect(patch.answers).toEqual(["3", "4", "5", "6"])
    expect(patch.solutions).toEqual([])
    expect(patch.bonus).toBeUndefined()
  })

  it("should transition to brainstorm with default answers when empty", () => {
    const current = { type: "choice" as const, question: "test" }
    const patch = buildTypePatch(current, "brainstorm")

    expect(patch.type).toBe("brainstorm")
    expect(patch.answers).toEqual(["", ""])
    expect(patch.solutions).toEqual([])
  })

  it("should transition to confidence (minimal fields)", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "confidence")

    expect(patch.type).toBe("confidence")
    expect(patch.answers).toBeUndefined()
    expect(patch.solutions).toBeUndefined()
    expect(patch.bonus).toBeUndefined()
    expect(patch.items).toBeUndefined()
  })

  it("should transition to micro-lesson and preserve existing answers", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "micro-lesson")

    expect(patch.type).toBe("micro-lesson")
    // Preserves answers if present
    expect(patch.answers).toEqual(["3", "4", "5", "6"])
    expect(patch.solutions).toEqual([])
    expect(patch.bonus).toBeUndefined()
  })

  it("should transition to micro-lesson with default answers when empty", () => {
    const current = { type: "choice" as const, question: "test" }
    const patch = buildTypePatch(current, "micro-lesson")

    expect(patch.type).toBe("micro-lesson")
    expect(patch.answers).toEqual(["", ""])
    expect(patch.solutions).toEqual([])
  })

  it("should transition to vokabelliste (admin-only)", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "vokabelliste")

    expect(patch.type).toBe("vokabelliste")
    expect(patch.question).toBe("")
    expect(patch.answers).toBeUndefined()
    expect(patch.min).toBeUndefined()
  })

  it("should default to choice on unknown type", () => {
    const current = fixtures.choice
    const patch = buildTypePatch(current, "unknown" as any)

    expect(patch.type).toBe("choice")
  })
})

describe("getClearedNonEmptyFields", () => {
  it("should identify fields being cleared to undefined", () => {
    const current = {
      answers: ["a", "b"],
      solutions: [0],
      min: 10,
      max: 100,
    }
    const patch: Partial<Question> = {
      type: "type-answer",
      answers: undefined,
      solutions: undefined,
      min: undefined,
      max: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("answers")
    expect(cleared).toContain("solutions")
    expect(cleared).toContain("min")
    expect(cleared).toContain("max")
    expect(cleared.length).toBe(4)
  })

  it("should ignore fields already empty in current", () => {
    const current = {
      answers: undefined,
      solutions: [],
      min: undefined,
    }
    const patch: Partial<Question> = {
      answers: undefined,
      solutions: undefined,
      min: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    // Empty arrays and undefined should not be listed
    expect(cleared).not.toContain("answers")
    expect(cleared).not.toContain("solutions")
    expect(cleared).not.toContain("min")
  })

  it("should only flag fields that exist in the patch as undefined", () => {
    const current = {
      answers: ["a", "b"],
      solutions: [0],
      question: "Test",
    }
    const patch: Partial<Question> = {
      type: "boolean",
      answers: undefined,
      // solutions is not in patch, so it's not considered for clearing
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("answers")
    expect(cleared).not.toContain("solutions") // Not in patch
    expect(cleared).not.toContain("question") // Not in patch
  })

  it("should handle empty arrays in current correctly", () => {
    const current = {
      items: [],
      answers: ["a"],
    }
    const patch: Partial<Question> = {
      items: undefined,
      answers: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).not.toContain("items") // Empty array not considered non-empty
    expect(cleared).toContain("answers") // Non-empty array is cleared
  })

  it("should work with sequencing patch", () => {
    const current = {
      answers: ["a", "b"],
      solutions: [0],
      items: [{ id: "1", label: "Item 1" }],
      correctOrder: ["1"],
    }
    const patch: Partial<Question> = {
      type: "sequencing",
      items: [],
      correctOrder: [],
      answers: undefined,
      solutions: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    // answers and solutions are cleared to undefined; items/correctOrder are empty
    expect(cleared).toContain("answers")
    expect(cleared).toContain("solutions")
    expect(cleared).not.toContain("items") // Cleared to empty array
    expect(cleared).not.toContain("correctOrder") // Cleared to empty array
  })
})
