import type { QuestionMedia, SequencingItem } from "@razzoozle/common/types/game"
import type { ReactNode } from "react"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"

export interface ResponsesDisplayProps {
  question: string
  responses: Record<number, number>
  solutions: number[]
  answers: string[]
  media?: QuestionMedia
  type?: string
  correct?: number
  correctAnswer?: string
  unit?: string
  averageGuess?: number
  textResponses?: Record<string, number>
  acceptedAnswers?: string[]
  matchMode?: "exact" | "normalized" | "fuzzy"
  correctChunks?: string[]
  correctOrder?: string[]
  items?: SequencingItem[]
  correctTokenPos?: { token: string; pos: string }[]
  correctOptions?: string[]
  correctMatches?: string[]
  correctHotspotIndex?: number
}

export type QuestionTypeDisplay = (
  props: ResponsesDisplayProps,
) => ReactNode

export const QUESTION_TYPE_DISPLAYS: Partial<
  Record<QuestionTypeKey, QuestionTypeDisplay>
> = {}

export function resolveDisplay(
  type: QuestionTypeKey | undefined,
  fallback: QuestionTypeDisplay,
): QuestionTypeDisplay {
  if (type === undefined) {
    return fallback
  }
  return QUESTION_TYPE_DISPLAYS[type] ?? fallback
}
