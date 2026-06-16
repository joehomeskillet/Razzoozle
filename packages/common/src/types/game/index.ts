import type { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { z } from "zod"

import type {
  questionValidator,
  quizzValidator,
} from "@razzoozle/common/validators/quizz"

// Re-export the single-source question kinds so consumers can keep importing
// `QuestionType` (and the runtime list) from `types/game`.
export { QUESTION_TYPES } from "@razzoozle/common/constants"

export type { QuestionType } from "@razzoozle/common/constants"

export interface Player {
  id: string
  clientId: string
  connected: boolean
  username: string
  points: number
  streak: number
  // NEW — true for sim bots (server-side scripted opponents); absent/false for
  // humans. Carried along by the `...player` spreads in scoring/snapshot so it's
  // available to filter on (bots are never persisted to a crash-recovery snapshot).
  isBot?: boolean
  // NEW — chosen avatar: a generic-set URL/id (see AVATARS_GENERIC) or an
  // ephemeral uploaded URL under /media/avatars/<gameId>/. Optional for
  // back-compat and snapshot restore.
  avatar?: string
  achievements?: string[]
  teamId?: string
}

export interface Answer {
  clientId: string
  answerId: number
  // Multiple-select: the set of selected option indices (answerId is a sentinel).
  answerIds?: number[]
  // Type-answer: the raw submitted free-text (answerId is a sentinel).
  answerText?: string
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
  // Hidden from the play list while true (still listed in management + editable).
  archived?: boolean
  // Convenience for list UIs (avoids loading every quiz to show a count).
  questionCount?: number
}

export interface GameUpdateQuestion {
  current: number
  total: number
}

export interface PlayerAnswerRecord {
  playerName: string
  answerId: number | null
  // Multiple-select selected set; null/absent when not applicable.
  answerIds?: number[] | null
  // Type-answer submitted text; null/absent when not applicable.
  answerText?: string | null
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

// Solo play / team mode contracts.
export type SoloQuestion = Omit<
  Question,
  "solutions" | "correct" | "acceptedAnswers"
>

export interface SoloCheckAnswerRequest {
  questionIndex: number
  answerId?: number
  answerIds?: number[]
  answerText?: string
}

export interface SoloCheckAnswerResponse {
  correct: boolean
  points: number
  // BOUNDED solo badges only. Server contributes the honestly-computable,
  // non-spoofable badge(s) — currently `sharpshooter` for a slider answer whose
  // accuracy clears the registry threshold. NO timing/streak/multiplayer badge
  // is computed server-side. Client merges client-derived streak badges on top.
  achievements?: string[]
  // Slider accuracy fraction (0..1) the server used to decide `sharpshooter`.
  // Absent for non-slider questions. Informational; the same value drives the
  // server badge decision so the client never has to recompute it.
  accuracy?: number
}

export interface SoloScoreEntry {
  playerName: string
  score: number
  answeredAt: string
}

export interface TeamStanding {
  teamId: string
  points: number
  playerCount: number
}

export interface GameResultMeta {
  id: string
  subject: string
  date: string
  playerCount: number
}

// PUBLIC, shareable post-event leaderboard. Deliberately OMITS `questions`
// (per-question answers/solutions) — privacy + anti-cheat: never leak the quiz
// content on a public link. Only the final ranking is shared.
export interface SharedResult {
  id: string
  subject: string
  date: string
  players: GameResultPlayer[]
}

// Running-games admin panel (MANAGER.LIST_GAMES / GAMES_DATA / END_GAME).
// A compact, read-only summary of a live game for the host's "Laufende Spiele"
// list. Deliberately carries NO quiz content / solutions — only metadata the
// host needs to identify and (optionally) end a game it owns.
export interface GameSummary {
  gameId: string
  inviteCode: string
  subject: string
  playerCount: number
  started: boolean
  managerConnected: boolean
  createdAt: number
}

// MANAGER.GAMES_DATA response payload (the full summary list).
export type GamesDataPayload = GameSummary[]

// MANAGER.END_GAME request payload.
export interface EndGamePayload {
  gameId: string
}
