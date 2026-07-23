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
  // NEW — chosen avatar: a generated DiceBear SVG data-URI (auto-assigned on
  // join, re-rollable in the picker) or an ephemeral uploaded URL under
  // /media/avatars/<gameId>/. Optional for back-compat and snapshot restore.
  avatar?: string
  achievements?: string[]
  teamId?: string
  // NEW — pseudonymous salted hash for opt-in assignment tracking (Welle-2).
  // Only set by server when an assignment requires identification; absent for
  // legacy games or guest play. Optional for back-compat.
  identifierHash?: string
}

export interface Answer {
  clientId: string
  answerId: number
  // Multiple-select: the set of selected option indices (answerId is a sentinel).
  answerIds?: number[]
  // Type-answer: the raw submitted free-text (answerId is a sentinel).
  answerText?: string
  // Sequencing: the ordered item ids (answerId is a sentinel).
  answerOrder?: string[]
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
  // Label IDs assigned to this quiz (empty array when no labels).
  labelIds?: number[]
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
  // Sequencing: ordered item ids; null/absent when not applicable.
  answerOrder?: string[] | null
  // ms from question start to this player's answer; null/absent for no-answer or legacy results.
  responseMs?: number | null
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
  // Post-game manager recap (superlatives + hardest-question callout), persisted
  // with the result so the public share page can replay it. Optional + additive:
  // older saved results without it keep working unchanged.
  recap?: ManagerRecap
  // Quiz ID linking the result back to its source quiz. Optional for back-compat:
  // older results without it remain queryable by other fields.
  quizId?: string
}

// Solo play / team mode contracts.
export type SoloQuestion = Omit<
  Question,
  "solutions" | "correct" | "acceptedAnswers" | "chunks"
> & { shuffledChunks?: string[] }

export interface SoloCheckAnswerRequest {
  questionIndex: number
  answerId?: number
  answerIds?: number[]
  answerText?: string
  answerOrder?: string[]
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
  // Poll response: true if this is a poll question (neutral feedback, no sfx/haptic,
  // no streak impact). Absent or false for regular questions.
  poll?: boolean
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

// ── Post-game recap / awards (WP-A) ──────────────────────────────────────────
// All recap shapes are ADDITIVE + OPTIONAL on the FINISHED payload so old clients
// that don't read `recap` keep working unchanged.

// The canonical superlative keys. Each award is derived server-side at game end
// by reducing the per-player recap accumulators (argmax/argmin over non-bots).
// `hardest_question` is a quiz-level award (the question with the lowest correct%),
// not a per-player one — its winner label is the question number, value its %.
export type SuperlativeKey =
  | "fastest_finger"
  | "most_correct"
  | "most_wrong"
  | "longest_streak"
  | "biggest_climber"
  | "lucky_guesser"
  | "comeback_kid"
  | "most_achievements"
  | "hardest_question"

// One awarded superlative. `value` is the numeric stat that won it (ms for
// fastest_finger, a count/streak/climb for the rest, the correct% for
// hardest_question). `winnerName` is the player's username (or the question
// label for hardest_question). A superlative is OMITTED when nobody qualifies.
export interface Superlative {
  key: SuperlativeKey
  winnerName: string
  winnerAvatar?: string
  value: number
}

// MANAGER-side recap: the full awards list for the big-screen, plus the hardest
// question detail (index + correct%) for an optional callout.
export interface ManagerRecap {
  superlatives: Superlative[]
  hardestQuestion?: { questionIndex: number; correctPct: number }
}

// PER-PLAYER recap: this player's own end-of-game card stats, plus the single
// superlative THIS player won (if any) for the phone 1-card highlight.
export interface PlayerRecap {
  myRecap: {
    rank: number
    accuracyPct: number
    correct: number
    wrong: number
    fastestMs: number | null
    peakStreak: number
    achievements: string[]
  }
  highlight?: { key: SuperlativeKey; value: number }
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
  // Optional post-game recap (superlatives) so the share page can replay the
  // award reveal before the podium. Superlatives carry winner names, which the
  // share page already displays publicly — consistent, no new leak.
  recap?: ManagerRecap
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

// ─── Per-round recap awards (additive, optional) ──────────────────────────────
// Distinct from the end-game Superlative/ManagerRecap: these are short, per-round
// highlights shown on the Kahoot-style Result screen after EACH round. Computed
// server-side (up to 3 per round) and attached to SHOW_RESULT.roundRecap. Old
// clients ignore the field. Labels resolve via i18n `game:roundRecap.<key>`.
export type RoundRecapKey =
  | "fastest_finger"
  | "first_correct"
  | "streak"
  | "highest_round_score"
  | "rank_climber"
  | "achievement_unlock"
  | "slowest_player"
  | "most_wrong"

export interface RoundRecapAward {
  key: RoundRecapKey
  /** Display name of the player who won this award this round. */
  winnerName: string
  /** Winner avatar URL (generic-set URL or uploaded data-URL); falls back to initials. */
  winnerAvatar?: string
  /**
   * Numeric value for display, interpreted per key by formatRoundRecap:
   *   fastest_finger      → answer time in ms (→ "X.Xs")
   *   streak              → streak length (count)
   *   highest_round_score → round points (count)
   *   rank_climber        → spots climbed (count)
   *   most_wrong          → wrong-answer count
   *   slowest_player      → answer time in ms (→ "X.Xs")
   *   first_correct / achievement_unlock → omit (no value)
   */
  value?: number
}
