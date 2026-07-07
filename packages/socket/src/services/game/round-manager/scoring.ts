// Per-answer scoring — extracted verbatim from RoundManager.showResults
// (round-manager.ts, Modul 5 of the SRP split). evalAnswer was already a pure
// closure over `question` (now an explicit first parameter instead); the
// per-player scoring block from the `sortedPlayers.map()` callback had no
// `this.X` dependency beyond the already-computed showResults locals, which
// are now explicit parameters. `player` is mutated in place (points/streak),
// exactly as the original did on the same object reference from
// `currentPlayers` — the caller in round-manager.ts still owns that array.
import {
  FIRST_CORRECT_BONUS,
  SLIDER_TOLERANCE_FRACTION,
  STREAK_CAP,
  STREAK_STEP,
} from "@razzoozle/common/constants"
import type { Answer, Player, Question } from "@razzoozle/common/types/game"
import {
  matchAnswer,
  normalizeText,
} from "@razzoozle/socket/services/game/text-match"

export interface EvalAnswerResult {
  correct: boolean
  base: number
}

// Correctness + base factor (0..1) for a single answer, before multipliers.
// answerIds carries a multiple-select player's selected set; answerText the
// type-answer free text. Both are undefined for choice/boolean/slider/poll.
export function evalAnswer(
  question: Question,
  answerId: number,
  answerIds?: number[],
  answerText?: string,
): EvalAnswerResult {
  // Type-answer: server-authoritative text match (anti-cheat — acceptedAnswers
  // never leave the server). All-or-nothing (base 1 on a match, else 0).
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

  if (question.type === "sentence-builder") {
    if (!answerText || !question.chunks?.length) {
      return { correct: false, base: 0 }
    }
    const correct =
      normalizeText(answerText) === normalizeText(question.chunks.join(" "))
    return { correct, base: correct ? 1 : 0 }
  }

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

  // Multiple-select: all-or-nothing. The selected set must equal solutions
  // EXACTLY by size and content (order irrelevant — Set comparison). No
  // partial credit.
  if (question.type === "multiple-select" && answerIds !== undefined) {
    // Dedupe solutions too: a hand-crafted/imported quiz could carry
    // duplicate indices (the validator only enforces length>=2), which would
    // otherwise let a wrong same-size selection score as correct.
    const solutions = [...new Set(question.solutions ?? [])]

    if (answerIds.length !== solutions.length) {
      return { correct: false, base: 0 }
    }

    const selectedSet = new Set(answerIds)
    const correct = solutions.every((s) => selectedSet.has(s))

    return { correct, base: correct ? 1 : 0 }
  }

  const correct = question.solutions?.includes(answerId) ?? false

  return { correct, base: correct ? 1 : 0 }
}

// The showResults `sortedPlayers` row shape: the full (mutated) Player plus
// the display (lastXxx) and achievement-intermediate (aXxx) fields the rest of
// showResults / computeAchievementAwards / computeRoundRecap read.
export interface ScoredPlayerRow extends Player {
  lastCorrect: boolean
  lastPoints: number
  lastPoll: boolean
  lastStreak: number
  lastStreakBonus: boolean
  lastBonus: boolean
  lastFirstCorrect: boolean
  aScored: boolean
  aIsCorrect: boolean
  aBaseFactor: number
  aStreakAfter: number
  aGotFirst: boolean
  aResponseTimeMs: number | null
  aPointsBefore: number
  aPointsAfter: number
}

// Score one player's answer for the just-closed question. Mutates `player`
// in place (points/streak) — the caller passes the SAME object reference it
// read from `currentPlayers`, exactly as the original inline `.map()` did.
export function scorePlayerAnswer(params: {
  player: Player
  playerAnswer: Answer | undefined
  question: Question
  isPoll: boolean
  firstCorrectId: string | null
  // Player's pre-round point total, captured by the caller BEFORE this call
  // (from a snapshot taken before any row in this round is scored).
  myPointsBefore: number
  // Achievements: server-receive response time for this player this round
  // (ALL modes), precomputed by the caller from its own answerReceivedAt
  // bookkeeping. null when the player did not answer.
  responseTimeMs: number | null
}): ScoredPlayerRow {
  const {
    player,
    playerAnswer,
    question,
    isPoll,
    firstCorrectId,
    myPointsBefore,
    responseTimeMs,
  } = params

  // Poll: opinion vote — neutral, no points, streak untouched. No
  // achievement is ever awarded on a poll (gated below via aScored=false).
  if (isPoll) {
    return {
      ...player,
      lastCorrect: false,
      lastPoints: 0,
      lastPoll: true,
      lastStreak: player.streak,
      lastStreakBonus: false,
      lastBonus: false,
      lastFirstCorrect: false,
      // Achievement intermediates (internal, stripped before the wire).
      aScored: false,
      aIsCorrect: false,
      aBaseFactor: 0,
      aStreakAfter: player.streak,
      aGotFirst: false,
      aResponseTimeMs: null,
      aPointsBefore: player.points,
      aPointsAfter: player.points,
    }
  }

  let isCorrect = false
  let rawPoints = 0
  let baseFactor = 0

  if (playerAnswer) {
    const ev = evalAnswer(
      question,
      playerAnswer.answerId,
      playerAnswer.answerIds,
      playerAnswer.answerText,
    )
    isCorrect = ev.correct
    baseFactor = ev.base
    rawPoints = ev.base * playerAnswer.points
  }

  const streakBefore = player.streak
  // Streak multiplier: +10% per consecutive correct, capped at +50%.
  const streakMult = isCorrect
    ? 1 + STREAK_STEP * Math.min(streakBefore, STREAK_CAP)
    : 1
  const bonusMult = question.bonus ? 2 : 1

  let points = question.practice
    ? 0
    : Math.round(rawPoints * streakMult * bonusMult)

  let gotFirst = false

  if (!question.practice && isCorrect && player.clientId === firstCorrectId) {
    // Scale the first-correct bonus by accuracy (full for choice/boolean,
    // proportional for slider) so a fast near-miss can't beat an accurate one.
    points += Math.round(FIRST_CORRECT_BONUS * baseFactor)
    gotFirst = true
  }

  player.points += points
  // Practice questions don't touch the streak (they award no points).
  player.streak = question.practice
    ? streakBefore
    : isCorrect
      ? streakBefore + 1
      : 0

  return {
    ...player,
    lastCorrect: isCorrect,
    lastPoints: points,
    lastPoll: false,
    lastStreak: player.streak,
    lastStreakBonus: isCorrect && streakBefore > 0 && !question.practice,
    lastBonus: Boolean(question.bonus) && isCorrect && !question.practice,
    lastFirstCorrect: gotFirst,
    // Achievement intermediates (internal, stripped before the wire). A
    // scored question is one that counts toward streaks/points: non-poll,
    // non-practice. Practice answers never unlock anything.
    aScored: !question.practice,
    aIsCorrect: isCorrect,
    aBaseFactor: baseFactor,
    aStreakAfter: player.streak,
    aGotFirst: gotFirst,
    aResponseTimeMs: responseTimeMs,
    aPointsBefore: myPointsBefore,
    aPointsAfter: player.points,
  }
}
