// Build a valid `Question` for any supported type with sensible defaults,
// then validate through @razzoozle/common's questionValidator.
import { MEDIA_TYPES, QUESTION_TYPES } from "@razzoozle/common/constants"
import type { QuestionType } from "@razzoozle/common/constants"
import type { Question, QuestionMedia } from "@razzoozle/common/types/game"
import { questionValidator } from "@razzoozle/common/validators/quizz"

export interface BuildQuestionInput {
  type: QuestionType
  question: string
  answers?: string[]
  solutions?: number[]
  min?: number
  max?: number
  correct?: number
  step?: number
  unit?: string
  acceptedAnswers?: string[]
  matchMode?: "exact" | "normalized" | "fuzzy"
  chunks?: string[]
  items?: Array<{ id: string; label: string }>
  correctOrder?: string[]
  segments?: string[]
  slots?: Array<{ options: string[]; correctIndex: number }>
  leftItems?: Array<{ label: string; options: string[]; correctIndex: number }>
  hotspots?: Array<{ x: number; y: number; w: number; h: number }>
  sentence?: string
  tokens?: string[]
  posSet?: string[]
  tolerance?: number
  decimals?: number
  media?: QuestionMedia
  mediaUrl?: string
  cooldown?: number
  time?: number
  practice?: boolean
  bonus?: boolean
  submittedBy?: string
}

const DEFAULT_COOLDOWN = 5
const DEFAULT_TIME = 20

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
    case "boolean":
      draft = {
        ...base,
        answers: input.answers ?? ["True", "False"],
        solutions: input.solutions ?? [0],
      }
      break
    case "slider":
      draft = {
        ...base,
        min: input.min ?? 0,
        max: input.max ?? 100,
        correct: input.correct ?? 50,
        ...(input.step !== undefined ? { step: input.step } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
      }
      break
    case "poll":
      draft = { ...base, answers: input.answers ?? ["A", "B"] }
      break
    case "multiple-select":
      draft = {
        ...base,
        answers: input.answers ?? ["A", "B", "C"],
        solutions: input.solutions ?? [0, 1],
      }
      break
    case "type-answer":
      draft = {
        ...base,
        acceptedAnswers: input.acceptedAnswers ?? ["answer"],
        matchMode: input.matchMode ?? "normalized",
      }
      break
    case "sentence-builder":
      draft = {
        ...base,
        chunks: input.chunks ?? ["The", "quick", "fox"],
      }
      break
    case "sequencing": {
      const items =
        input.items ??
        [
          { id: "a", label: "First" },
          { id: "b", label: "Second" },
        ]
      draft = {
        ...base,
        items,
        correctOrder: input.correctOrder ?? items.map((i) => i.id),
      }
      break
    }
    case "mathematik":
      draft = {
        ...base,
        correct: input.correct ?? 42,
        tolerance: input.tolerance ?? 0.1,
        decimals: input.decimals ?? 2,
      }
      break
    case "wortarten":
      draft = {
        ...base,
        sentence: input.sentence ?? "Das ist ein Test",
        tokens: input.tokens ?? ["Das", "ist", "ein", "Test"],
        posSet: input.posSet ?? [
          "Nomen",
          "Verb",
          "Adjektiv",
          "Artikel",
          "Pronomen",
          "Adverb",
          "Präposition",
          "Konjunktion",
        ],
        solutions: input.solutions ?? [3, 1, 3, 0],
      }
      break
    case "fill-blank":
      draft = {
        ...base,
        segments: input.segments ?? ["The capital of ", " is Paris."],
        slots: input.slots ?? [
          { options: ["France", "Germany", "Spain"], correctIndex: 0 },
        ],
      }
      break
    case "matching":
      draft = {
        ...base,
        leftItems: input.leftItems ?? [
          {
            label: "Capital of France",
            options: ["Paris", "Lyon"],
            correctIndex: 0,
          },
        ],
      }
      break
    case "drop-pin":
      draft = {
        ...base,
        media: media ?? {
          type: MEDIA_TYPES.IMAGE,
          url: "/media/placeholder-map.webp",
        },
        hotspots: input.hotspots ?? [{ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }],
      }
      break
    case "choice":
    default:
      draft = {
        ...base,
        answers: input.answers ?? ["A", "B", "C", "D"],
        solutions: input.solutions ?? [0],
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
