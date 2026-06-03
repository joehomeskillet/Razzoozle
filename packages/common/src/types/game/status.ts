import type {
  Player,
  QuestionMedia,
  QuestionType,
} from "@razzia/common/types/game"

export const STATUS = {
  SHOW_ROOM: "SHOW_ROOM",
  SHOW_START: "SHOW_START",
  SHOW_PREPARED: "SHOW_PREPARED",
  SHOW_QUESTION: "SHOW_QUESTION",
  SELECT_ANSWER: "SELECT_ANSWER",
  SHOW_RESULT: "SHOW_RESULT",
  SHOW_RESPONSES: "SHOW_RESPONSES",
  SHOW_LEADERBOARD: "SHOW_LEADERBOARD",
  FINISHED: "FINISHED",
  WAIT: "WAIT",
} as const

export type Status = (typeof STATUS)[keyof typeof STATUS]

export interface CommonStatusDataMap {
  SHOW_START: { time: number; subject: string }
  SHOW_PREPARED: { totalAnswers: number; questionNumber: number }
  SHOW_QUESTION: {
    question: string
    media?: QuestionMedia
    cooldown: number
  }
  SELECT_ANSWER: {
    question: string
    answers?: string[]
    media?: QuestionMedia
    time: number
    totalPlayer: number
    // slider questions (no `correct` here — must not leak to players)
    type?: QuestionType
    min?: number
    max?: number
    step?: number
    unit?: string
  }
  SHOW_RESULT: {
    correct: boolean
    message: string
    points: number
    myPoints: number
    rank: number
    aheadOfMe: string | null
    // bonus / streak display
    streak?: number
    streakBonus?: boolean
    bonus?: boolean
    firstCorrect?: boolean
    poll?: boolean
  }
  WAIT: { text: string }
  FINISHED: { subject: string; top: Player[]; rank?: number }
}

interface ManagerExtraStatus {
  SHOW_ROOM: { text: string; inviteCode?: string }
  SHOW_RESPONSES: {
    question: string
    responses: Record<number, number>
    solutions: number[]
    answers: string[]
    media?: QuestionMedia
    // slider result
    type?: QuestionType
    correct?: number
    unit?: string
    averageGuess?: number
  }
  SHOW_LEADERBOARD: { oldLeaderboard: Player[]; leaderboard: Player[] }
}

export type PlayerStatusDataMap = CommonStatusDataMap

export type ManagerStatusDataMap = CommonStatusDataMap & ManagerExtraStatus

export type StatusDataMap = PlayerStatusDataMap & ManagerStatusDataMap
