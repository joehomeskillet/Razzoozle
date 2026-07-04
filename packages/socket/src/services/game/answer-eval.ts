// Pure, stateless answer evaluator for the solo-play REST path.
//
// Replicates the per-type logic from round-manager's `evalAnswer` closure
// without any mutable state, round context, or time/streak multipliers.
// Solo play is client-timed and deliberately untrusted, so points are a
// flat Math.round(1000 * base) when correct.
//
// This file MUST NOT be imported by round-manager (it owns its own closure).
// Import direction: index.ts → answer-eval.ts (solo REST handlers only).

import { SLIDER_TOLERANCE_FRACTION } from "@razzoozle/common/constants"
import type { Question } from "@razzoozle/common/types/game"
import {
  matchAnswer,
  normalizeText,
} from "@razzoozle/socket/services/game/text-match"

export interface EvalInput {
  answerId?: number
  answerIds?: number[]
  answerText?: string
}

export interface EvalResult {
  correct: boolean
  base: number
}

/**
 * Evaluate a solo player's answer against a question without side effects.
 *
 * - `choice` / `boolean`: correct when `answerId` is in `solutions`.
 * - `slider`: correct within tolerance; `base` = accuracy (0..1).
 * - `multiple-select`: exact set-match of `answerIds` vs `solutions`.
 * - `type-answer`: text match per `matchMode`; base = 1 or 0.
 * - `sentence-builder`: normalized text match against chunks.join(" "); base = 1 or 0.
 * - `poll`: always base 0 (no correct answer concept).
 */
export function evaluateAnswer(
  question: Question,
  { answerId = -1, answerIds, answerText }: EvalInput,
): EvalResult {
  // Poll: opinion vote — no scoring.
  if (question.type === "poll") {
    return { correct: false, base: 0 }
  }

  // Type-answer: server-authoritative text match (anti-cheat — acceptedAnswers
  // never leave the server).
  if (question.type === "type-answer") {
    if (!answerText || !question.acceptedAnswers?.length) {
      return { correct: false, base: 0 }
    }

    const correct = matchAnswer(
      answerText,
      question.acceptedAnswers,
      question.matchMode ?? "normalized",
    )

    return { correct, base: correct ? 1 : 0 }
  }

  // Slider: proximity scoring within tolerance.
  if (
    question.type === "slider" &&
    question.min != null &&
    question.max != null &&
    question.correct != null
  ) {
    const range = question.max - question.min || 1
    const dist = Math.abs(answerId - question.correct)
    const accuracy = Math.max(0, 1 - dist / range)
    const within =
      dist <= Math.max(question.step ?? 0, range * SLIDER_TOLERANCE_FRACTION)

    return { correct: within, base: within ? accuracy : 0 }
  }

  // Multiple-select: exact set match — all or nothing.
  if (question.type === "multiple-select" && answerIds !== undefined) {
    const solutions = [...new Set(question.solutions ?? [])]

    if (answerIds.length !== solutions.length) {
      return { correct: false, base: 0 }
    }

    const selectedSet = new Set(answerIds)
    const correct = solutions.every((s) => selectedSet.has(s))

    return { correct, base: correct ? 1 : 0 }
  }

  // Sentence-builder: normalized text match against correct chunks in order.
  if (question.type === "sentence-builder" && question.chunks?.length) {
    if (!answerText) {
      return { correct: false, base: 0 }
    }

    const correctSentence = question.chunks.join(" ")
    const correct = normalizeText(answerText) === normalizeText(correctSentence)

    return { correct, base: correct ? 1 : 0 }
  }

  // Choice / boolean (and any unrecognized type): index-based solutions lookup.
  const correct = question.solutions?.includes(answerId) ?? false

  return { correct, base: correct ? 1 : 0 }
}
