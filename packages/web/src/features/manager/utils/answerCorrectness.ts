import type { PlayerAnswerRecord, QuestionResult } from "@razzoozle/common/types/game"
import { matchAnswer } from "@razzoozle/web/features/game/utils/text-match"

/**
 * Single source of truth for per-player answer correctness.
 * Mirrors server-side scoring logic exactly.
 * Pure function — no React, no context dependencies.
 */
export const isAnswerCorrect = (
  question: QuestionResult,
  pa: PlayerAnswerRecord,
): boolean => {
  if (question.type === "poll") {
    return false
  }

  if (question.type === "type-answer") {
    if (!pa.answerText) {
      return false
    }

    return matchAnswer(
      pa.answerText,
      question.acceptedAnswers ?? [],
      question.matchMode ?? "normalized",
    )
  }

  if (question.type === "multiple-select") {
    if (!pa.answerIds || pa.answerIds.length === 0) {
      return false
    }

    const solutions = question.solutions ?? []

    if (pa.answerIds.length !== solutions.length) {
      return false
    }

    const selectedSet = new Set(pa.answerIds)

    return solutions.every((s) => selectedSet.has(s))
  }

  if (pa.answerId === null) {
    return false
  }

  // Slider threshold computed inline from question min/max/step
  if (question.type === "slider" && question.min != null && question.max != null) {
    const threshold = Math.max(
      question.step ?? 0,
      (question.max - question.min) * 0.05,
    )
    if (question.correct != null) {
      return Math.abs(pa.answerId - question.correct) <= threshold
    }
  }

  return (question.solutions ?? []).includes(pa.answerId)
}
