// Types for computeAchievementAwards (round-manager/achievement-awards.ts) —
// split out so both the ctx/param shapes and the (larger) computation stay
// under the agentic-coding module-size guideline.
import type {
  AchievementId,
  MergedAchievement,
} from "@razzoozle/common/achievements"
import type { Player, Question } from "@razzoozle/common/types/game"

// Per-player RECAP accumulator shape (mirrors RoundManager.recapStats' value
// type exactly, so `ctx.recapStats` structurally accepts the class field).
export interface RecapStat {
  username: string
  fastestMs: number | null
  peakStreak: number
  correct: number
  wrong: number
  answered: number
  bestClimb: number
  worstRankEver: number
  achievementCount: number
  achievementIds: string[]
  luckyGuess: boolean
}

// Per-player row shape read/written by computeAchievementAwards — the subset
// of the showResults `sortedPlayers` row fields achievement scoring touches.
export interface AchievementScoringRow {
  clientId: string
  username: string
  isBot?: boolean
  points: number
  lastPoints: number
  aScored: boolean
  aIsCorrect: boolean
  aBaseFactor: number
  aStreakAfter: number
  aResponseTimeMs: number | null
  aPointsBefore: number
  aPointsAfter: number
}

// State RoundManager owns across rounds (+ snapshot/restore) that the badge
// computation reads/mutates. Maps are passed BY REFERENCE — mutations here
// (ctx.gameCounters.set(...) etc.) are visible to the caller, exactly like the
// original `this.gameCounters.set(...)` mutations were.
export interface AchievementsCtx {
  gameCounters: Map<
    string,
    { answered: number; correct: number; ever: boolean }
  >
  recapStats: Map<string, RecapStat>
  questionStats: Map<number, { correct: number; total: number }>
  achievementsConfig: Map<AchievementId, MergedAchievement>
  answerReceivedAt: ReadonlyMap<string, number>
  currentQuestion: number
}

export interface ComputeAchievementAwardsParams {
  // Mutated in place: row.points / row.lastPoints get the per-badge bonus
  // folded in, and the array is RE-SORTED by points at the end (same as the
  // original inline code did to `sortedPlayers`).
  sortedPlayers: AchievementScoringRow[]
  // Mutated in place: the matching live player's `points` gets the bonus too.
  currentPlayers: Player[]
  rankBefore: ReadonlyMap<string, number>
  hasPriorRound: boolean
  firstCorrectId: string | null
  isLastScoredRound: boolean
  totalScoredQuestions: number
  question: Question
}

export interface ComputeAchievementAwardsResult {
  achievementsByClient: Map<string, string[]>
  bonusByClient: Map<string, number>
}
