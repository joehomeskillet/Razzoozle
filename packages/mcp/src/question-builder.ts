// Build a valid `Question` for any of the 6 supported types with sensible
// defaults, then validate it through @razzoozle/common's questionValidator so a
// model can author quickly without knowing each type's per-field rules. The
// type-specific superRefine rules (slider needs min/max/correct, multiple-select
// needs >=2 solutions, type-answer needs acceptedAnswers, etc.) are the single
// source of truth in the validator — we only supply ergonomic defaults here.
import { MEDIA_TYPES, QUESTION_TYPES } from "@razzoozle/common/constants"
import type { QuestionType } from "@razzoozle/common/constants"
import type { Question, QuestionMedia } from "@razzoozle/common/types/game"
import { questionValidator } from "@razzoozle/common/validators/quizz"

export interface BuildQuestionInput {
  type: QuestionType
  question: string
  // choice / boolean / multiple-select / poll
  answers?: string[]
  // index(es) of correct answer(s). boolean defaults to [0] (= "True") if omitted.
  solutions?: number[]
  // slider
  min?: number
  max?: number
  correct?: number
  step?: number
  unit?: string
  // type-answer
  acceptedAnswers?: string[]
  matchMode?: "exact" | "normalized" | "fuzzy"
  // shared
  media?: QuestionMedia
  // A /media/...webp or absolute URL — convenience alias for media.url (image).
  mediaUrl?: string
  cooldown?: number
  time?: number
  practice?: boolean
  bonus?: boolean
  submittedBy?: string
}

const DEFAULT_COOLDOWN = 5 // validator range: 3..15
const DEFAULT_TIME = 20 // validator range: 5..120

// Assemble a draft question object for `type`, filling in only what that type
// needs (so unrelated fields stay absent and don't confuse the validator's
// superRefine). Everything is then handed to questionValidator.
export const buildQuestion = (input: BuildQuestionInput): Question => {
  const type = input.type

  if (!QUESTION_TYPES.includes(type)) {
    throw new Error(
      `Unknown question type "${type}". One of: ${QUESTION_TYPES.join(", ")}`,
    )
  }

  const media: QuestionMedia | undefined =
    input.media ??
    (input.mediaUrl
      ? { type: MEDIA_TYPES.IMAGE, url: input.mediaUrl }
      : undefined)

  const base = {
    question: input.question,
    type,
    cooldown: input.cooldown ?? DEFAULT_COOLDOWN,
    time: input.time ?? DEFAULT_TIME,
    ...(media ? { media } : {}),
    ...(input.practice !== undefined ? { practice: input.practice } : {}),
    ...(input.bonus !== undefined ? { bonus: input.bonus } : {}),
    ...(input.submittedBy ? { submittedBy: input.submittedBy } : {}),
  }

  let draft: Record<string, unknown>

  switch (type) {
    case "boolean": {
      // Render as a 2-option true/false unless explicit answers are given.
      const answers = input.answers ?? ["True", "False"]

      draft = {
        ...base,
        answers,
        solutions: input.solutions ?? [0],
      }

      break
    }

    case "slider": {
      draft = {
        ...base,
        min: input.min,
        max: input.max,
        correct: input.correct,
        ...(input.step !== undefined ? { step: input.step } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
      }

      break
    }

    case "poll": {
      // Opinion vote: answers, no solutions.
      draft = {
        ...base,
        answers: input.answers,
      }

      break
    }

    case "multiple-select": {
      draft = {
        ...base,
        answers: input.answers,
        solutions: input.solutions,
      }

      break
    }

    case "type-answer": {
      draft = {
        ...base,
        acceptedAnswers: input.acceptedAnswers,
        matchMode: input.matchMode ?? "normalized",
      }

      break
    }

    // "choice" and any future single-answer type
    default: {
      draft = {
        ...base,
        answers: input.answers,
        solutions: input.solutions,
      }
    }
  }

  const parsed = questionValidator.safeParse(draft)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid ${type} question: ${issues}`)
  }

  return parsed.data
}
