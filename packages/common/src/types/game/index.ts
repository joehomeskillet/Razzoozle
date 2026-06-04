import type { MEDIA_TYPES } from "@razzia/common/constants"
import type { z } from "zod"

import type {
  questionValidator,
  quizzValidator,
} from "@razzia/common/validators/quizz"

// Re-export the single-source question kinds so consumers can keep importing
// `QuestionType` (and the runtime list) from `types/game`.
export { QUESTION_TYPES } from "@razzia/common/constants"

export type { QuestionType } from "@razzia/common/constants"

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

// Single source of truth is the zod validator: a parsed quizz IS a `Quizz`, so
// the type is inferred from `questionValidator` / `quizzValidator` rather than
// hand-mirrored. Field semantics (defaults, slider rules, practice/bonus) live
// in `validators/quizz.ts`.
export type Question = z.infer<typeof questionValidator>

export type Quizz = z.infer<typeof quizzValidator>

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
