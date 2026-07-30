import type { Question, QuestionType } from "@razzoozle/common/types/game"

type QuestionTypeKey = QuestionType | "vokabelliste"

/**
 * Minimal interface representing the fields accessed during type transition.
 * Keeps coupling to the full Question type low; consumers can pass partial objects.
 */
interface CurrentQuestion {
  type?: QuestionTypeKey
  solutions?: number[]
  answers?: string[]
  min?: number
  max?: number
  correct?: number
  step?: number
  unit?: string
  bonus?: boolean
  acceptedAnswers?: string[]
  matchMode?: "exact" | "normalized" | "fuzzy"
  chunks?: string[]
  items?: Array<{ id?: string }>
  correctOrder?: string[]
  segments?: string[]
  slots?: Array<{ options?: string[]; correctIndex?: number }>
  leftItems?: Array<{ label?: string; options?: string[]; correctIndex?: number }>
  hotspots?: Array<{ x: number; y: number; w: number; h: number }>
  sentence?: string
  tokens?: string[]
  posSet?: string[]
  tolerance?: number
  decimals?: number
  question?: string
}

/**
 * Helper constants for clearing type-specific fields.
 * Mirrors the SLIDER_CLEAR and CHOICE_CLEAR objects from QuestionEditorType.tsx.
 */
const SLIDER_CLEAR = {
  min: undefined,
  max: undefined,
  correct: undefined,
  step: undefined,
  unit: undefined,
}

const CHOICE_CLEAR = {
  answers: undefined,
  solutions: undefined,
}

/**
 * Pure function that builds a patch for type transitions.
 * Behavior is neutral: orphaned-field inconsistencies from the original if/else chain
 * are preserved exactly as-is. No normalization or repairs are applied here.
 *
 * Each type branch follows the original logic from QuestionEditorType.tsx setType()
 * and maintains the same field-clearing behavior and defaults.
 *
 * ORPHANED-FIELD NOTE: Some types like wortarten, mathematik, etc. clear fields
 * inconsistently (e.g. wortarten clears min/max/correct/step/unit individually
 * rather than via SLIDER_CLEAR spread). These behaviors are preserved as-is to
 * ensure behavioral neutrality. A dedicated WP should address field-clearing
 * consistency across all types.
 */
export function buildTypePatch(
  current: CurrentQuestion,
  next: QuestionTypeKey,
): Partial<Question> {
  if (next === "boolean") {
    return {
      type: "boolean",
      answers: ["Wahr", "Falsch"],
      solutions: current.solutions?.filter((s) => s < 2).length
        ? current.solutions.filter((s) => s < 2)
        : [0],
      ...SLIDER_CLEAR,
    }
  }

  if (next === "slider") {
    return {
      type: "slider",
      min: current.min ?? 0,
      max: current.max ?? 100,
      correct: current.correct ?? 50,
      step: current.step ?? 1,
      unit: current.unit ?? "",
      ...CHOICE_CLEAR,
    }
  }

  if (next === "poll") {
    return {
      type: "poll",
      answers: current.answers?.length ? current.answers : ["", ""],
      solutions: [],
      bonus: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "multiple-select") {
    return {
      type: "multiple-select",
      answers:
        (current.answers?.length ?? 0) >= 2
          ? current.answers
          : ["", ""],
      solutions:
        (current.solutions?.length ?? 0) >= 2
          ? current.solutions
          : [0, 1],
      ...SLIDER_CLEAR,
    }
  }

  if (next === "type-answer") {
    return {
      type: "type-answer",
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: current.acceptedAnswers ?? [],
      matchMode: (current.matchMode ?? "normalized") as "exact" | "normalized" | "fuzzy",
      ...SLIDER_CLEAR,
    }
  }

  if (next === "sentence-builder") {
    return {
      type: "sentence-builder",
      chunks: ["", ""],
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "sequencing") {
    return {
      type: "sequencing",
      items: [],
      correctOrder: [],
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "mathematik") {
    // ORPHANED-FIELD: mathematik uses individual field clears instead of SLIDER_CLEAR.
    // This is preserved exactly as-is from the original; see dedicated WP for consistency.
    return {
      type: "mathematik",
      correct: 0,
      tolerance: 0.1,
      decimals: 2,
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      min: undefined,
      max: undefined,
      step: undefined,
      unit: undefined,
    }
  }

  if (next === "wortarten") {
    // ORPHANED-FIELD: wortarten also uses individual field clears instead of SLIDER_CLEAR.
    // posSet is seeded with the full POS set; fields are preserved exactly as-is.
    return {
      type: "wortarten",
      sentence: "",
      tokens: [],
      posSet: [
        "Nomen",
        "Verb",
        "Adjektiv",
        "Artikel",
        "Pronomen",
        "Adverb",
        "Präposition",
        "Konjunktion",
      ],
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      min: undefined,
      max: undefined,
      correct: undefined,
      step: undefined,
      unit: undefined,
    }
  }

  if (next === "fill-blank") {
    return {
      type: "fill-blank",
      segments: ["", ""],
      slots: [{ options: ["", ""], correctIndex: 0 }],
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      leftItems: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "matching") {
    return {
      type: "matching",
      leftItems: [{ label: "", options: ["", ""], correctIndex: 0 }],
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      segments: undefined,
      slots: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "drop-pin") {
    return {
      type: "drop-pin",
      hotspots: [{ x: 0.25, y: 0.25, w: 0.25, h: 0.25 }],
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      segments: undefined,
      slots: undefined,
      leftItems: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "word-cloud") {
    // Word cloud: unscored collection format, same shape as poll — teacher
    // seeds a few words, no correct solution (see UNSCORED_QUESTION_TYPES).
    return {
      type: "word-cloud",
      answers: current.answers?.length ? current.answers : ["", ""],
      solutions: [],
      bonus: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      segments: undefined,
      slots: undefined,
      leftItems: undefined,
      hotspots: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "brainstorm") {
    // Brainstorm: unscored collection format, same shape as poll — teacher
    // seeds a few ideas, players can add their own during play.
    return {
      type: "brainstorm",
      answers: current.answers?.length ? current.answers : ["", ""],
      solutions: [],
      bonus: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      segments: undefined,
      slots: undefined,
      leftItems: undefined,
      hotspots: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "confidence") {
    // Confidence rating: three fixed levels hardcoded in
    // ConfidenceSelector — no extra fields, just the question text.
    return {
      type: "confidence",
      answers: undefined,
      solutions: undefined,
      bonus: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      segments: undefined,
      slots: undefined,
      leftItems: undefined,
      hotspots: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "micro-lesson") {
    // Micro-lesson: today's player view renders a single slide — title
    // from the question text, content from `answers` joined with
    // newlines. Reuse the generic answers editor as the (short,
    // line-based) content input; the richer multi-slide schema is #470.
    return {
      type: "micro-lesson",
      answers: current.answers?.length ? current.answers : ["", ""],
      solutions: [],
      bonus: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      items: undefined,
      correctOrder: undefined,
      segments: undefined,
      slots: undefined,
      leftItems: undefined,
      hotspots: undefined,
      ...SLIDER_CLEAR,
    }
  }

  if (next === "vokabelliste") {
    return {
      type: "vokabelliste" as QuestionType,
      question: "",
      answers: undefined,
      solutions: undefined,
      acceptedAnswers: undefined,
      matchMode: undefined,
      chunks: undefined,
      min: undefined,
      max: undefined,
      correct: undefined,
      step: undefined,
      unit: undefined,
    }
  }

  // Default fallback: treat as "choice"
  return {
    type: "choice",
    answers: current.answers?.length ? current.answers : ["", ""],
    solutions: current.solutions?.length ? current.solutions : [0],
    ...SLIDER_CLEAR,
  }
}

/**
 * Identifies fields that the patch would set to undefined AND that are currently
 * non-empty in the current question.
 *
 * This function supports the confirmation dialog in WP-QEI-12, alerting the user
 * when a type transition would destructively clear non-empty field data.
 *
 * Contract: returned array contains field names (string keys) that will be
 * lost due to the type change.
 */
export function getClearedNonEmptyFields(
  current: CurrentQuestion,
  patch: Partial<Question>,
): string[] {
  const cleared: string[] = []

  // Check each key in the patch for undefined values
  for (const key in patch) {
    if (patch[key as keyof Question] === undefined) {
      const currentValue = current[key as keyof CurrentQuestion]
      // If the field exists and is "non-empty", record it
      if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
        // For arrays, also check length
        if (Array.isArray(currentValue) && currentValue.length === 0) {
          continue
        }
        cleared.push(key)
      }
    }
  }

  return cleared
}
