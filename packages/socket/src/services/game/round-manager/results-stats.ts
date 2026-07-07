// Results computation (first half of showResults) — extracted verbatim from
// RoundManager (round-manager.ts, Modul 9 of the SRP split, part 1 of 2).
//
// showResults is cut at its natural compute/emit seam: everything up to and
// including `cleanedSorted` (pre-round snapshot, histograms, scoring,
// achievement awards, the cleaned rows) is computation and lives here;
// everything from players.replace() on (emission + round-state mutation) is
// results-broadcast.ts. This half reads hot class state by reference
// (playersAnswers/answerReceivedAt/leaderboard + the persistent achievement
// maps — the latter are MUTATED in place by computeAchievementAwards exactly
// as before) and returns every intermediate the broadcast half consumes as a
// single ResultsStats bundle.
import type {
  Answer,
  Player,
  Question,
  Quizz,
} from "@razzoozle/common/types/game"
import { normalizeText } from "@razzoozle/socket/services/game/text-match"
import { computeAchievementAwards } from "@razzoozle/socket/services/game/round-manager/achievement-awards"
import type { AchievementsCtx } from "@razzoozle/socket/services/game/round-manager/achievement-awards-types"
import {
  evalAnswer,
  type ScoredPlayerRow,
  scorePlayerAnswer,
} from "@razzoozle/socket/services/game/round-manager/scoring"
import type { PlayerManager } from "@razzoozle/socket/services/game/player-manager"

// A `sortedPlayers` row with the internal achievement-intermediate (aXxx)
// fields stripped — the shape showResults put on the wire / into the round
// leaderboard (TypeScript previously inferred this from the destructuring).
export type CleanedScoredRow = Omit<
  ScoredPlayerRow,
  | "aScored"
  | "aIsCorrect"
  | "aBaseFactor"
  | "aStreakAfter"
  | "aGotFirst"
  | "aResponseTimeMs"
  | "aPointsBefore"
  | "aPointsAfter"
>

export interface ComputeResultsStatsCtx extends AchievementsCtx {
  players: PlayerManager
  leaderboard: Player[]
  quizz: Quizz
  playersAnswers: Answer[]
  startTime: number
}

// Every intermediate the original showResults computed before its first
// emission, bundled so results-broadcast.ts can consume them unchanged.
export interface ResultsStats {
  currentPlayers: Player[]
  oldLeaderboard: Player[]
  hasPriorRound: boolean
  rankBefore: Map<string, number>
  totalType: Record<number, number>
  textResponses: Record<string, number> | undefined
  isPoll: boolean
  firstCorrectId: string | null
  sortedPlayers: ScoredPlayerRow[]
  cleanedSorted: CleanedScoredRow[]
  achievementsByClient: Map<string, string[]>
  bonusByClient: Map<string, number>
}

export function computeResultsStats(
  ctx: ComputeResultsStatsCtx,
  question: Question,
): ResultsStats {
  const currentPlayers = ctx.players.getAll()

  const oldLeaderboard = (() => {
    if (ctx.leaderboard.length === 0) {
      return currentPlayers.map((p) => ({ ...p }))
    }

    return ctx.leaderboard.map((p) => ({ ...p }))
  })()

  // ── Achievements pre-round snapshot ───────────────────────────────────────
  // A prior round exists iff this.leaderboard was populated (round >= 1). The
  // `climber` badge needs the FULL pre-round ranking (not the top-5 slice), so
  // we rank EVERY current player by their points BEFORE this round's scoring.
  const hasPriorRound = ctx.leaderboard.length > 0
  const pointsBefore = new Map<string, number>()

  for (const p of currentPlayers) {
    pointsBefore.set(p.clientId, p.points)
  }

  // rankBefore: 1-based index over all players sorted by pre-round points desc.
  // Only meaningful when a prior round exists (else every climb is spurious).
  const rankBefore = new Map<string, number>()

  if (hasPriorRound) {
    const preRanked = [...currentPlayers].sort((a, b) => b.points - a.points)
    preRanked.forEach((p, index) => {
      rankBefore.set(p.clientId, index + 1)
    })
  }

  // Scored = the questions that actually count toward participation / 100%:
  // non-poll AND non-practice. Counted once for the whole quiz.
  const totalScoredQuestions = ctx.quizz.questions.filter(
    (q) => q.type !== "poll" && !q.practice,
  ).length
  // participation / perfect_game must fire on the last SCORED question — not
  // the literal last question. If the quiz ends on a poll/practice round, the
  // counters never reach their total inside the `aScored` branch (poll/practice
  // rows are skipped), so we anchor on the index of the final scored question.
  const lastScoredIndex = ctx.quizz.questions.reduce(
    (last, q, i) => (q.type !== "poll" && !q.practice ? i : last),
    -1,
  )
  const isLastScoredRound = ctx.currentQuestion === lastScoredIndex

  const totalType = ctx.playersAnswers.reduce(
    (acc: Record<number, number>, answer) => {
      // Multiple-select: increment EACH selected option's bucket so the
      // manager histogram shows how many players picked each option. All other
      // types keep the single-bucket behaviour (answerId === -1 for type-answer
      // lands in a bucket the text histogram ignores).
      if (answer.answerIds !== undefined) {
        for (const id of answer.answerIds) {
          acc[id] = (acc[id] || 0) + 1
        }
      } else {
        acc[answer.answerId] = (acc[answer.answerId] || 0) + 1
      }

      return acc
    },
    {},
  )

  // Type-answer: a parallel text-keyed histogram (normalized text -> count) so
  // the manager can see how the free-text answers clustered. undefined for all
  // other types. Keyed by the SAME normalization used for scoring so case/accent
  // variants collapse into one bar.
  const textResponses =
    question.type === "type-answer" || question.type === "sentence-builder"
      ? ctx.playersAnswers.reduce(
          (acc: Record<string, number>, { answerText }) => {
            const key = normalizeText(answerText ?? "")

            if (key) {
              acc[key] = (acc[key] || 0) + 1
            }

            return acc
          },
          {},
        )
      : undefined

  const isPoll = question.type === "poll"

  // Correctness/scoring math extracted to round-manager/scoring.ts (Modul 5
  // of the SRP split): evalAnswer (pure, `question` now an explicit param)
  // + scorePlayerAnswer (the per-player streak/bonus/points block).

  // The first player (by answer arrival order) to get it right earns a flat bonus.
  let firstCorrectId: string | null = null

  if (!isPoll && !question.practice) {
    for (const a of ctx.playersAnswers) {
      if (evalAnswer(question, a.answerId, a.answerIds, a.answerText).correct) {
        firstCorrectId = a.clientId

        break
      }
    }
  }

  const sortedPlayers = currentPlayers
    .map((player) => {
      const playerAnswer = ctx.playersAnswers.find(
        (a) => a.clientId === player.clientId,
      )

      // Achievements: server-receive response time for this player this round
      // (ALL modes). null when the player did not answer. Clamped to >= 0 so a
      // clock skew can't produce a negative "faster than instant" badge.
      const receivedAt = ctx.answerReceivedAt.get(player.clientId)
      const responseTimeMs =
        receivedAt !== undefined
          ? Math.max(0, receivedAt - ctx.startTime)
          : null

      // pointsBefore is captured BEFORE the mutation below (from the snapshot
      // taken before this map ran), so it is the player's pre-round total.
      const myPointsBefore =
        pointsBefore.get(player.clientId) ?? player.points

      return scorePlayerAnswer({
        player,
        playerAnswer,
        question,
        isPoll,
        firstCorrectId,
        myPointsBefore,
        responseTimeMs,
      })
    })
    .sort((a, b) => b.points - a.points)

  // ── Achievements: badge unlocks + configurable bonus points ───────────────
  // Extracted to round-manager/achievement-awards.ts (Modul 1 of the SRP
  // split). Mutates `sortedPlayers` (bonus folded into points/lastPoints,
  // re-sorted) and `currentPlayers` (live player points) in place, and the
  // persistent gameCounters/recapStats/questionStats maps — exactly as the
  // inline code did via `this.X` before the extraction.
  const { achievementsByClient, bonusByClient } = computeAchievementAwards(
    {
      gameCounters: ctx.gameCounters,
      recapStats: ctx.recapStats,
      questionStats: ctx.questionStats,
      achievementsConfig: ctx.achievementsConfig,
      answerReceivedAt: ctx.answerReceivedAt,
      currentQuestion: ctx.currentQuestion,
    },
    {
      sortedPlayers,
      currentPlayers,
      rankBefore,
      hasPriorRound,
      firstCorrectId,
      isLastScoredRound,
      totalScoredQuestions,
      question,
    },
  )

  // Persist the freshly-unlocked badges onto the live player objects so they
  // are visible in the roster / leaderboard payloads too. We DROP the internal
  // achievement-intermediate (aXxx) fields here so they never reach the wire.
  const cleanedSorted = sortedPlayers.map((row) => {
    const {
      aScored: _aScored,
      aIsCorrect: _aIsCorrect,
      aBaseFactor: _aBaseFactor,
      aStreakAfter: _aStreakAfter,
      aGotFirst: _aGotFirst,
      aResponseTimeMs: _aResponseTimeMs,
      aPointsBefore: _aPointsBefore,
      aPointsAfter: _aPointsAfter,
      ...rest
    } = row
    const unlocked = achievementsByClient.get(row.clientId)

    if (unlocked) {
      return { ...rest, achievements: unlocked }
    }

    // No fresh unlock this round: STRIP any prior-round `achievements` so a
    // stale badge can't ride into SHOW_LEADERBOARD / FINISHED / the roster
    // (rest is spread from persisted player objects that may still carry an
    // earlier round's achievements). Per-player SHOW_RESULT reads fresh from
    // achievementsByClient, so it is unaffected.
    const { achievements: _dropStale, ...cleanRest } = rest

    return cleanRest
  })

  return {
    currentPlayers,
    oldLeaderboard,
    hasPriorRound,
    rankBefore,
    totalType,
    textResponses,
    isPoll,
    firstCorrectId,
    sortedPlayers,
    cleanedSorted,
    achievementsByClient,
    bonusByClient,
  }
}
