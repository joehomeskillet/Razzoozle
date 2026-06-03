import type { MEDIA_TYPES } from "@razzia/common/constants"

export interface Player {
  id: string
  clientId: string
  connected: boolean
  username: string
  points: number
  streak: number
}

export interface Answer {
  playerId: string
  answerId: number
  points: number
}

export type QuestionMediaType =
  | (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES]
  | undefined

export interface QuestionMedia {
  type?: QuestionMediaType
  url: string
}

export type QuestionType = "choice" | "boolean" | "slider" | "poll"

export interface Question {
  question: string
  // "choice" (default) | "boolean" | "slider" | "poll" (opinion vote, unscored)
  type?: QuestionType
  media?: QuestionMedia
  // choice / boolean / poll
  answers?: string[]
  solutions?: number[]
  // slider
  min?: number
  max?: number
  correct?: number
  step?: number
  unit?: string
  cooldown: number
  time: number
  // Warm-up/practice question: awards no points (leaderboard-neutral).
  practice?: boolean
  // Bonus question: doubles the points awarded for this question.
  bonus?: boolean
}

export interface Quizz {
  subject: string
  questions: Question[]
}

export type QuizzWithId = Quizz & { id: string }

export interface QuizzMeta {
  id: string
  subject: string
}

export interface GameUpdateQuestion {
  current: number
  total: number
}

export interface PlayerAnswerRecord {
  playerName: string
  answerId: number | null
}

export type QuestionResult = Question & {
  playerAnswers: PlayerAnswerRecord[]
}

export interface GameResultPlayer {
  username: string
  points: number
  rank: number
}

export interface GameResult {
  id: string
  subject: string
  date: string
  players: GameResultPlayer[]
  questions: QuestionResult[]
}

export interface GameResultMeta {
  id: string
  subject: string
  date: string
  playerCount: number
}
