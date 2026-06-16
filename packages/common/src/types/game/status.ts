import type {
  Player,
  QuestionMedia,
  QuestionType,
  TeamStanding,
} from "@razzoozle/common/types/game"

export const STATUS = {
  // NOTE: the literal type is widened to include "PAUSED" (runtime value is
  // unchanged) so existing web records keyed off STATUS.* (e.g. MANAGER_SKIP_BTN,
  // indexed by a raw Status) keep typechecking before WP-WEB-QR-PAUSE adds a
  // real PAUSED branch. Additive/back-compat only.
  SHOW_ROOM: "SHOW_ROOM" as "SHOW_ROOM" | "PAUSED",
  SHOW_START: "SHOW_START",
  SHOW_PREPARED: "SHOW_PREPARED",
  SHOW_QUESTION: "SHOW_QUESTION",
  SELECT_ANSWER: "SELECT_ANSWER",
  SHOW_RESULT: "SHOW_RESULT",
  SHOW_RESPONSES: "SHOW_RESPONSES",
  SHOW_LEADERBOARD: "SHOW_LEADERBOARD",
  FINISHED: "FINISHED",
  WAIT: "WAIT",
  PAUSED: "PAUSED",
} as const

export type Status = (typeof STATUS)[keyof typeof STATUS]

export interface CommonStatusDataMap {
  SHOW_START: { time: number; subject: string }
  SHOW_PREPARED: { totalAnswers: number; questionNumber: number }
  SHOW_QUESTION: {
    question: string
    // Answer TEXTS only (no solutions/correct — anti-cheat). Display-only for the
    // presenter big-screen tiles; absent for slider questions (no discrete answers).
    answers?: string[]
    media?: QuestionMedia
    cooldown: number
    submittedBy?: string
  }
  SELECT_ANSWER: {
    question: string
    answers?: string[]
    media?: QuestionMedia
    time: number
    totalPlayer: number
    // Slider questions (no `correct` here — must not leak to players)
    type?: QuestionType
    min?: number
    max?: number
    step?: number
    unit?: string
    // Low-latency mode: server-authoritative timing anchors. All OPTIONAL —
    // absent in normal mode and ignored by old clients. Client uses these only
    // to drive the countdown/UI (never for scoring — scoring is server-side).
    serverSeq?: number
    serverNowMs?: number
    questionStartAtServerMs?: number
    answerDeadlineAtServerMs?: number
    submittedBy?: string
  }
  SHOW_RESULT: {
    correct: boolean
    message: string
    points: number
    myPoints: number
    rank: number
    aheadOfMe: string | null
    // Bonus / streak display
    streak?: number
    streakBonus?: boolean
    bonus?: boolean
    firstCorrect?: boolean
    poll?: boolean
    achievements?: string[]
    // Sum of per-achievement bonus points unlocked this round (already folded
    // into `myPoints`). Present only when > 0; absent/0 in the shipped default.
    bonusPoints?: number
    // Total players in this game, so the client can suppress a hollow "1st
    // place" label in a solo (single-player) game (W1-D FIX 2).
    playerCount?: number
    // The revealed correct answer for the round, shown on the wrong-answer
    // screen. Present only when applicable (never for poll/correct).
    correctAnswer?: string
  }
  WAIT: { text: string; teamMode?: boolean }
  PAUSED: { reason?: string }
  FINISHED: {
    subject: string
    top: Player[]
    rank?: number
    teamStandings?: TeamStanding[]
  }
}

interface ManagerExtraStatus {
  SHOW_ROOM: { text: string; inviteCode?: string }
  SHOW_RESPONSES: {
    question: string
    responses: Record<number, number>
    solutions: number[]
    answers: string[]
    media?: QuestionMedia
    // Slider result
    type?: QuestionType
    correct?: number
    unit?: string
    averageGuess?: number
    // Type-answer result (manager-only — never sent to players). Normalized
    // text -> count, the authored accepted answers, and the comparison mode.
    textResponses?: Record<string, number>
    acceptedAnswers?: string[]
    matchMode?: "exact" | "normalized" | "fuzzy"
  }
  SHOW_LEADERBOARD: {
    oldLeaderboard: Player[]
    leaderboard: Player[]
    teamStandings?: TeamStanding[]
  }
}

export type PlayerStatusDataMap = CommonStatusDataMap

export type ManagerStatusDataMap = CommonStatusDataMap & ManagerExtraStatus

export type StatusDataMap = PlayerStatusDataMap & ManagerStatusDataMap
