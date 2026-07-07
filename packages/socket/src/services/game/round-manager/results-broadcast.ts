// Results emission + round-state rollover (second half of showResults) —
// extracted verbatim from RoundManager (round-manager.ts, Modul 9 of the SRP
// split, part 2 of 2). See results-stats.ts for the seam rationale.
//
// Consumes the ResultsStats bundle the compute half returned (destructured
// once below so every statement keeps its original local name), emits the
// per-player SHOW_RESULT + manager SHOW_RESPONSES screens, appends the
// question to questionsHistory (array by reference) and rolls the round state
// over. Field REASSIGNMENTS (leaderboard/tempOldLeaderboard/tempRoundRecap/
// roundRecapShown/playersAnswers/resultScreenActive/answerDeadlineAtServerMs)
// go through explicit setter callbacks — pause-resume.ts pattern — while
// Maps/arrays (lastResultPayloads/questionsHistory) mutate in place.
import type {
  Answer,
  Player,
  Question,
  QuestionResult,
  RoundRecapAward,
} from "@razzoozle/common/types/game"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzoozle/common/types/game/status"
import type { PlayerManager } from "@razzoozle/socket/services/game/player-manager"
import type { ScoreboardThrottle } from "@razzoozle/socket/services/game/scoreboard-throttle"
import Registry from "@razzoozle/socket/services/registry"
import { emitLifecycle } from "@razzoozle/socket/services/plugin-runtime"
import { AUTO_RESULT_MS } from "@razzoozle/socket/services/game/round-manager/auto-mode"
import { computeRoundRecap } from "@razzoozle/socket/services/game/round-manager/round-recap"
import type { ResultsStats } from "@razzoozle/socket/services/game/round-manager/results-stats"

type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface BroadcastResultsCtx {
  players: PlayerManager
  answerReceivedAt: ReadonlyMap<string, number>
  startTime: number
  autoMode: boolean
  lastResultPayloads: Map<string, StatusDataMap["SHOW_RESULT"]>
  send: SendFn
  getManagerId: () => string
  gameId: string
  playersAnswers: Answer[]
  setPlayersAnswers: (_v: Answer[]) => void
  questionsHistory: QuestionResult[]
  setLeaderboard: (_v: Player[]) => void
  setTempOldLeaderboard: (_v: Player[]) => void
  setTempRoundRecap: (_v: RoundRecapAward[]) => void
  setRoundRecapShown: (_v: boolean) => void
  setResultScreenActive: (_v: boolean) => void
  answerCountThrottle: ScoreboardThrottle<number>
  setAnswerDeadlineAtServerMs: (_v: number) => void
  scheduleAuto: () => void
}

export function broadcastResults(
  ctx: BroadcastResultsCtx,
  question: Question,
  stats: ResultsStats,
): void {
  const {
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
  } = stats

  ctx.players.replace(cleanedSorted)

  // The question is OVER, so the correct answer is now safe to reveal in the
  // per-player RESULT payload (anti-cheat: it is NEVER added to the live
  // SHOW_QUESTION / SELECT_ANSWER payloads above). Built as a display string
  // per question type so the wrong-answer "Too bad" screen can show what the
  // right answer was. undefined for poll (no correct answer) and when the
  // question carries no solution data.
  const correctAnswer = ((): string | undefined => {
    if (isPoll) {
      return undefined
    }

    if (question.type === "slider") {
      return question.correct != null
        ? `${question.correct}${question.unit ? ` ${question.unit}` : ""}`
        : undefined
    }

    if (question.type === "type-answer") {
      return question.acceptedAnswers?.[0]
    }

    // choice / boolean / multiple-select: map solution indices to answer texts.
    const texts = (question.solutions ?? [])
      .map((i) => question.answers?.[i])
      .filter((t): t is string => typeof t === "string")

    return texts.length > 0 ? texts.join(", ") : undefined
  })()

  // FIX 9: when auto-mode is already on at results time, the SHOW_RESULT screen
  // will auto-advance after AUTO_RESULT_MS — carry that as autoAdvanceMs so the
  // client can render a local countdown. Absent in manual mode (old clients
  // ignore it). The cache below also feeds the FIX 8 mid-screen re-send.
  // ── Per-round recap (additive, optional) ──────────────────────────────────
  // Game-wide highlights for THIS round, same array on every player's payload.
  // Built from the intermediate `sortedPlayers` rows (which still carry the
  // aXxx fields) — cleanedSorted has them stripped. Best-effort: an empty array
  // means we omit the field so old clients are unaffected.
  const rankAfterByClient = new Map<string, number>()
  sortedPlayers.forEach((row, index) => {
    rankAfterByClient.set(row.clientId, index + 1)
  })
  const roundRecap = computeRoundRecap(
    sortedPlayers.map((row) => ({
      clientId: row.clientId,
      username: row.username,
      avatar: row.avatar,
      isBot: row.isBot,
      aIsCorrect: row.aIsCorrect,
      aResponseTimeMs: row.aResponseTimeMs,
      aStreakAfter: row.aStreakAfter,
      lastPoints: row.lastPoints,
      answeredThisRound: ctx.answerReceivedAt.has(row.clientId),
    })),
    rankAfterByClient,
    rankBefore,
    achievementsByClient,
    firstCorrectId,
    hasPriorRound,
  )

  ctx.lastResultPayloads.clear()

  cleanedSorted.forEach((player, index) => {
    const rank = index + 1
    const aheadPlayer = cleanedSorted[index - 1]
    const unlocked = achievementsByClient.get(player.clientId)
    const bonusPoints = bonusByClient.get(player.clientId) ?? 0

    const resultPayload: StatusDataMap["SHOW_RESULT"] = {
      correct: player.lastCorrect,
      message: player.lastPoll
        ? "game:pollThanks"
        : player.lastCorrect
          ? "game:correct"
          : "game:wrong",
      points: player.lastPoints,
      myPoints: player.points,
      rank,
      aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      streak: player.lastStreak,
      streakBonus: player.lastStreakBonus,
      bonus: player.lastBonus,
      firstCorrect: player.lastFirstCorrect,
      poll: player.lastPoll,
      // Total players in this game, so the client can suppress a hollow "1st
      // place" label in a solo (single-player) game (W1-D FIX 2).
      playerCount: cleanedSorted.length,
      ...(correctAnswer !== undefined ? { correctAnswer } : {}),
      ...(question.type === "sentence-builder" && question.chunks
        ? { correctChunks: question.chunks }
        : {}),
      ...(unlocked ? { achievements: unlocked } : {}),
      ...(bonusPoints > 0 ? { bonusPoints } : {}),
      ...(roundRecap.length > 0 ? { roundRecap } : {}),
    }

    // Cache WITHOUT autoAdvanceMs; emitResultCountdown adds the live remaining
    // time on a mid-screen re-send so a late toggle gets an accurate value.
    ctx.lastResultPayloads.set(player.id, resultPayload)

    ctx.send(player.id, STATUS.SHOW_RESULT, {
      ...resultPayload,
      ...(ctx.autoMode ? { autoAdvanceMs: AUTO_RESULT_MS } : {}),
    })
  emitLifecycle("onResult", { gameId: ctx.gameId, status: "SHOW_RESULT", data: {} })
  })

  // The post-results screen is now on display: a subsequent setAutoMode(true)
  // (FIX 8) arms the advance for THIS screen. Cleared once we leave it.
  ctx.setResultScreenActive(true)

  const guesses = ctx.playersAnswers.map((a) => a.answerId)
  const averageGuess =
    question.type === "slider" && guesses.length
      ? Math.round(guesses.reduce((s, v) => s + v, 0) / guesses.length)
      : undefined

  ctx.send(ctx.getManagerId(), STATUS.SHOW_RESPONSES, {
    ...question,
    // Question is validator-inferred, so these are optional; the status
    // payload requires concrete arrays. Default to empty for slider/poll.
    solutions: question.solutions ?? [],
    answers: question.answers ?? [],
    responses: totalType,
    averageGuess,
    // Type-answer (MANAGER-ONLY send — players never receive SHOW_RESPONSES):
    // the normalized text histogram plus the authored accepted answers and the
    // match mode so the host result view can render them. Gated to type-answer
    // so other types carry none of these (acceptedAnswers/matchMode are
    // anti-cheat-sensitive and must never leak to a player-facing payload).
    textResponses,
    acceptedAnswers:
      question.type === "type-answer" ? question.acceptedAnswers : undefined,
    matchMode:
      question.type === "type-answer" ? question.matchMode : undefined,
    correctChunks:
      question.type === "sentence-builder" ? question.chunks : undefined,
    // Per-round recap awards — same highlights the phone shows on SHOW_RESULT
    // — so the presenter/projector displays them at result-reveal time too.
    // Read from the local `roundRecap` const (computed above); safe to read
    // here, well before tempRoundRecap is cleared after SHOW_LEADERBOARD.
    ...(roundRecap.length > 0 ? { roundRecap } : {}),
  })

  ctx.questionsHistory.push({
    ...question,
    playerAnswers: currentPlayers.map((player) => {
      const playerAnswer = ctx.playersAnswers.find(
        (a) => a.clientId === player.clientId,
      )

      return {
        playerName: player.username,
        answerId: playerAnswer?.answerId ?? null,
        // Multiple-select selected set / type-answer free text, persisted so
        // the saved-result view can render the player's actual answer. null
        // when not applicable (matches PlayerAnswerRecord).
        answerIds: playerAnswer?.answerIds ?? null,
        answerText: playerAnswer?.answerText ?? null,
        // ms from question start to answer; null when no answer or legacy results.
        responseMs: (() => {
          const receivedAt = ctx.answerReceivedAt.get(player.clientId)
          return receivedAt !== undefined
            ? Math.max(0, receivedAt - ctx.startTime)
            : null
        })(),
      }
    }),
  })

  // Use the cleaned rows (avatar/achievements preserved, internal aXxx fields
  // dropped) as the round leaderboard so the between-questions SHOW_LEADERBOARD
  // rows carry `avatar` (bug #4 fix) without leaking achievement intermediates.
  ctx.setLeaderboard(cleanedSorted)
  ctx.setTempOldLeaderboard(oldLeaderboard)
  ctx.setTempRoundRecap(roundRecap)
  ctx.setRoundRecapShown(false)
  ctx.setPlayersAnswers([])

  // Low-latency mode: the question is over — drop any pending throttled count
  // and close the answer window so a late tap is rejected as `too_late`.
  ctx.answerCountThrottle.cancel()
  ctx.setAnswerDeadlineAtServerMs(0)

  // The round's STABLE, snapshotted state (leaderboard/questionsHistory/
  // scores) just changed — mark the crash-recovery snapshot stale so the
  // next periodic saveSnapshot() actually persists this round's outcome.
  Registry.getInstance().markDirty()

  if (ctx.autoMode) {
    ctx.scheduleAuto()
  }
}
