import { describe, it, expect } from "vitest"
import { buildTypePatch, getClearedNonEmptyFields } from "./questionTypeTransition"
import type { Question } from "@razzoozle/common/types/game"

/**
 * Characterization test suite for buildTypePatch and getClearedNonEmptyFields.
 *
 * This suite freezes the current (sometimes inconsistent) type-transition behavior
 * as a regression-safety net before UI changes. Tests use literal expected values
 * (no logic reimplementation) and mark known orphaned-field inconsistencies with
 * "// KNOWN:" comments.
 *
 * Coverage strategy:
 * - Every type branch gets at least one test
 * - Conditional branches (filter, ternary, ??, ?.) get both arms tested
 * - Orphaned-field cases frozen exactly as-is
 * - Cross-field preservation (question/media/etc) tested
 */

describe("buildTypePatch — Characterization Matrix", () => {
  /**
   * BOOLEAN: solutions filter branch
   * Branch 1: filter result non-empty (keep filtered)
   * Branch 2: filter result empty (default to [0])
   */
  describe("boolean type transitions", () => {
    it("boolean: solutions < 2 preserved when filter non-empty", () => {
      const current = {
        type: "choice" as const,
        solutions: [0, 1, 5, 10], // Only 0, 1 pass filter
      }
      const patch = buildTypePatch(current, "boolean")

      expect(patch.type).toBe("boolean")
      expect(patch.answers).toEqual(["Wahr", "Falsch"])
      expect(patch.solutions).toEqual([0, 1])
      expect(patch.min).toBeUndefined()
      expect(patch.max).toBeUndefined()
      expect(patch.correct).toBeUndefined()
      expect(patch.step).toBeUndefined()
      expect(patch.unit).toBeUndefined()
    })

    it("boolean: defaults to [0] when all solutions >= 2", () => {
      const current = {
        type: "choice" as const,
        solutions: [2, 5, 10],
      }
      const patch = buildTypePatch(current, "boolean")

      expect(patch.type).toBe("boolean")
      expect(patch.solutions).toEqual([0])
    })

    it("boolean: defaults to [0] when solutions undefined", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "boolean")

      expect(patch.type).toBe("boolean")
      expect(patch.solutions).toEqual([0])
    })

    it("boolean: clears slider fields via SLIDER_CLEAR", () => {
      const current = {
        type: "slider" as const,
        min: 10,
        max: 100,
        correct: 50,
        step: 2,
        unit: "meters",
        solutions: [0],
      }
      const patch = buildTypePatch(current, "boolean")

      expect(patch.min).toBeUndefined()
      expect(patch.max).toBeUndefined()
      expect(patch.correct).toBeUndefined()
      expect(patch.step).toBeUndefined()
      expect(patch.unit).toBeUndefined()
    })
  })

  describe("slider type transitions", () => {
    it("slider: inherits min/max/correct/step/unit from current", () => {
      const current = {
        type: "choice" as const,
        min: 5,
        max: 50,
        correct: 25,
        step: 2,
        unit: "cm",
        answers: ["a", "b"],
        solutions: [0],
      }
      const patch = buildTypePatch(current, "slider")

      expect(patch.type).toBe("slider")
      expect(patch.min).toBe(5)
      expect(patch.max).toBe(50)
      expect(patch.correct).toBe(25)
      expect(patch.step).toBe(2)
      expect(patch.unit).toBe("cm")
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })

    it("slider: defaults min=0, max=100, correct=50, step=1, unit='' when missing", () => {
      const current = { type: "choice" as const, question: "Pick a value" }
      const patch = buildTypePatch(current, "slider")

      expect(patch.type).toBe("slider")
      expect(patch.min).toBe(0)
      expect(patch.max).toBe(100)
      expect(patch.correct).toBe(50)
      expect(patch.step).toBe(1)
      expect(patch.unit).toBe("")
    })

    it("slider: clears CHOICE_CLEAR fields (answers, solutions)", () => {
      const current = {
        type: "choice" as const,
        answers: ["a", "b", "c"],
        solutions: [0, 1],
      }
      const patch = buildTypePatch(current, "slider")

      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("poll type transitions", () => {
    it("poll: preserves existing answers when present", () => {
      const current = {
        type: "choice" as const,
        answers: ["Yes", "No", "Maybe"],
      }
      const patch = buildTypePatch(current, "poll")

      expect(patch.type).toBe("poll")
      expect(patch.answers).toEqual(["Yes", "No", "Maybe"])
      expect(patch.solutions).toEqual([])
      expect(patch.bonus).toBeUndefined()
    })

    it("poll: defaults to ['', ''] when answers missing", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "poll")

      expect(patch.type).toBe("poll")
      expect(patch.answers).toEqual(["", ""])
      expect(patch.solutions).toEqual([])
    })
  })

  describe("word-cloud type transitions", () => {
    it("word-cloud: preserves existing answers when present", () => {
      const current = {
        type: "poll" as const,
        answers: ["dog", "cat", "bird"],
      }
      const patch = buildTypePatch(current, "word-cloud")

      expect(patch.type).toBe("word-cloud")
      expect(patch.answers).toEqual(["dog", "cat", "bird"])
      expect(patch.solutions).toEqual([])
    })

    it("word-cloud: defaults to ['', ''] when answers missing", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "word-cloud")

      expect(patch.type).toBe("word-cloud")
      expect(patch.answers).toEqual(["", ""])
      expect(patch.solutions).toEqual([])
    })
  })

  describe("brainstorm type transitions", () => {
    it("brainstorm: preserves existing answers when present", () => {
      const current = {
        type: "choice" as const,
        answers: ["idea1", "idea2"],
      }
      const patch = buildTypePatch(current, "brainstorm")

      expect(patch.type).toBe("brainstorm")
      expect(patch.answers).toEqual(["idea1", "idea2"])
      expect(patch.solutions).toEqual([])
    })

    it("brainstorm: defaults to ['', ''] when answers missing", () => {
      const current = { type: "type-answer" as const }
      const patch = buildTypePatch(current, "brainstorm")

      expect(patch.type).toBe("brainstorm")
      expect(patch.answers).toEqual(["", ""])
      expect(patch.solutions).toEqual([])
    })
  })

  describe("micro-lesson type transitions", () => {
    it("micro-lesson: preserves existing answers when present", () => {
      const current = {
        type: "choice" as const,
        answers: ["Intro", "Content", "Summary"],
      }
      const patch = buildTypePatch(current, "micro-lesson")

      expect(patch.type).toBe("micro-lesson")
      expect(patch.answers).toEqual(["Intro", "Content", "Summary"])
      expect(patch.solutions).toEqual([])
    })

    it("micro-lesson: defaults to ['', ''] when answers missing", () => {
      const current = { type: "sequencing" as const }
      const patch = buildTypePatch(current, "micro-lesson")

      expect(patch.type).toBe("micro-lesson")
      expect(patch.answers).toEqual(["", ""])
      expect(patch.solutions).toEqual([])
    })
  })

  describe("multiple-select type transitions", () => {
    it("multiple-select: preserves 2+ answers and solutions", () => {
      const current = {
        type: "choice" as const,
        answers: ["A", "B", "C"],
        solutions: [0, 2],
      }
      const patch = buildTypePatch(current, "multiple-select")

      expect(patch.type).toBe("multiple-select")
      expect(patch.answers).toEqual(["A", "B", "C"])
      expect(patch.solutions).toEqual([0, 2])
    })

    it("multiple-select: defaults answers/solutions when < 2", () => {
      const current = {
        type: "choice" as const,
        answers: ["A"],
        solutions: [0],
      }
      const patch = buildTypePatch(current, "multiple-select")

      expect(patch.type).toBe("multiple-select")
      expect(patch.answers).toEqual(["", ""])
      expect(patch.solutions).toEqual([0, 1])
    })
  })

  describe("type-answer type transitions", () => {
    it("type-answer: inherits acceptedAnswers and matchMode when present", () => {
      const current = {
        type: "choice" as const,
        acceptedAnswers: ["Berlin", "BERLIN"],
        matchMode: "exact" as const,
      }
      const patch = buildTypePatch(current, "type-answer")

      expect(patch.type).toBe("type-answer")
      expect(patch.acceptedAnswers).toEqual(["Berlin", "BERLIN"])
      expect(patch.matchMode).toBe("exact")
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })

    it("type-answer: defaults acceptedAnswers=[], matchMode='normalized'", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "type-answer")

      expect(patch.type).toBe("type-answer")
      expect(patch.acceptedAnswers).toEqual([])
      expect(patch.matchMode).toBe("normalized")
    })
  })

  describe("sentence-builder type transitions", () => {
    it("sentence-builder: initializes chunks to ['', '']", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "sentence-builder")

      expect(patch.type).toBe("sentence-builder")
      expect(patch.chunks).toEqual(["", ""])
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("sequencing type transitions", () => {
    it("sequencing: initializes items and correctOrder to empty arrays", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "sequencing")

      expect(patch.type).toBe("sequencing")
      expect(patch.items).toEqual([])
      expect(patch.correctOrder).toEqual([])
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("mathematik type transitions", () => {
    it("mathematik: sets correct=0, tolerance=0.1, decimals=2 (KNOWN orphaned-field)", () => {
      const current = {
        type: "choice" as const,
        min: 10,
        max: 100,
        correct: 50,
        step: 5,
        unit: "m",
      }
      const patch = buildTypePatch(current, "mathematik")

      expect(patch.type).toBe("mathematik")
      expect(patch.correct).toBe(0)
      expect(patch.tolerance).toBe(0.1)
      expect(patch.decimals).toBe(2)
      // KNOWN: uses individual clears, not SLIDER_CLEAR spread
      expect(patch.min).toBeUndefined()
      expect(patch.max).toBeUndefined()
      expect(patch.step).toBeUndefined()
      expect(patch.unit).toBeUndefined()
    })
  })

  describe("wortarten type transitions", () => {
    it("wortarten: initializes sentence='', tokens=[], posSet with 8 POS tags (KNOWN orphaned-field)", () => {
      const current = { type: "choice" as const }
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
      // KNOWN: uses individual clears, not SLIDER_CLEAR spread
      expect(patch.min).toBeUndefined()
      expect(patch.max).toBeUndefined()
      expect(patch.correct).toBeUndefined()
      expect(patch.step).toBeUndefined()
      expect(patch.unit).toBeUndefined()
    })
  })

  describe("fill-blank type transitions", () => {
    it("fill-blank: initializes segments and slots", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "fill-blank")

      expect(patch.type).toBe("fill-blank")
      expect(patch.segments).toEqual(["", ""])
      expect(patch.slots).toEqual([{ options: ["", ""], correctIndex: 0 }])
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("matching type transitions", () => {
    it("matching: initializes leftItems with single template", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "matching")

      expect(patch.type).toBe("matching")
      expect(patch.leftItems).toEqual([
        { label: "", options: ["", ""], correctIndex: 0 },
      ])
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("drop-pin type transitions", () => {
    it("drop-pin: initializes hotspots with default template", () => {
      const current = { type: "choice" as const }
      const patch = buildTypePatch(current, "drop-pin")

      expect(patch.type).toBe("drop-pin")
      expect(patch.hotspots).toEqual([{ x: 0.25, y: 0.25, w: 0.25, h: 0.25 }])
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("confidence type transitions", () => {
    it("confidence: clears all structured fields, keeps only type", () => {
      const current = {
        type: "sequencing" as const,
        items: [{ id: "1" }],
        answers: ["a"],
      }
      const patch = buildTypePatch(current, "confidence")

      expect(patch.type).toBe("confidence")
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
      expect(patch.items).toBeUndefined()
    })
  })

  describe("vokabelliste type transitions", () => {
    it("vokabelliste: sets question='', clears structured fields", () => {
      const current = {
        type: "choice" as const,
        question: "Test",
        answers: ["a", "b"],
        solutions: [0],
      }
      const patch = buildTypePatch(current, "vokabelliste")

      expect(patch.type).toBe("vokabelliste")
      expect(patch.question).toBe("")
      expect(patch.answers).toBeUndefined()
      expect(patch.solutions).toBeUndefined()
    })
  })

  describe("choice type transitions (default fallback)", () => {
    it("choice: preserves answers and solutions when present", () => {
      const current = {
        type: "poll" as const,
        answers: ["Yes", "No"],
        solutions: [0, 2],
      }
      const patch = buildTypePatch(current, "choice")

      expect(patch.type).toBe("choice")
      expect(patch.answers).toEqual(["Yes", "No"])
      expect(patch.solutions).toEqual([0, 2])
    })

    it("choice: defaults to ['', ''] and [0] when missing", () => {
      const current = { type: "type-answer" as const }
      const patch = buildTypePatch(current, "choice")

      expect(patch.type).toBe("choice")
      expect(patch.answers).toEqual(["", ""])
      expect(patch.solutions).toEqual([0])
    })
  })
})

describe("getClearedNonEmptyFields — Characterization Matrix", () => {
  it("returns fields that are undefined in patch AND non-empty in current", () => {
    const current = {
      answers: ["a", "b"],
      solutions: [0],
      min: 10,
    }
    const patch: Partial<Question> = {
      type: "boolean",
      answers: undefined,
      solutions: undefined,
      min: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("answers")
    expect(cleared).toContain("solutions")
    expect(cleared).toContain("min")
    expect(cleared.length).toBe(3)
  })

  it("ignores fields already empty (undefined, null)", () => {
    const current = {
      answers: undefined,
      solutions: undefined,
      min: undefined,
      max: 0,
    }
    const patch: Partial<Question> = {
      answers: undefined,
      solutions: undefined,
      min: undefined,
      max: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).not.toContain("answers")
    expect(cleared).not.toContain("solutions")
    expect(cleared).not.toContain("min")
    expect(cleared).toContain("max")
  })

  it("ignores empty arrays in current", () => {
    const current = {
      answers: [],
      solutions: [0],
      items: [],
    }
    const patch: Partial<Question> = {
      answers: undefined,
      solutions: undefined,
      items: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).not.toContain("answers")
    expect(cleared).toContain("solutions")
    expect(cleared).not.toContain("items")
  })

  it("only checks fields explicitly in patch", () => {
    const current = {
      answers: ["a"],
      solutions: [0],
      question: "Keep this",
    }
    const patch: Partial<Question> = {
      type: "boolean",
      answers: undefined,
    }

    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("answers")
    expect(cleared).not.toContain("solutions")
    expect(cleared).not.toContain("question")
  })

  it("realistic scenario: choice → boolean", () => {
    const current = {
      type: "choice" as const,
      answers: ["3", "4", "5"],
      solutions: [1],
      min: 10,
      max: 100,
    }
    const patch = buildTypePatch(current, "boolean")
    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("min")
    expect(cleared).toContain("max")
    expect(cleared).not.toContain("answers")
  })

  it("realistic scenario: choice → slider", () => {
    const current = {
      type: "choice" as const,
      answers: ["a", "b"],
      solutions: [0, 1],
    }
    const patch = buildTypePatch(current, "slider")
    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("answers")
    expect(cleared).toContain("solutions")
    expect(cleared.length).toBe(2)
  })

  it("realistic scenario: sequencing with pre-filled fields", () => {
    const current = {
      type: "choice" as const,
      answers: ["Answer 1"],
      solutions: [0],
      acceptedAnswers: ["backup"],
      chunks: ["chunk1"],
    }
    const patch = buildTypePatch(current, "sequencing")
    const cleared = getClearedNonEmptyFields(current, patch)

    expect(cleared).toContain("answers")
    expect(cleared).toContain("solutions")
    expect(cleared).toContain("acceptedAnswers")
    expect(cleared).toContain("chunks")
  })
})
