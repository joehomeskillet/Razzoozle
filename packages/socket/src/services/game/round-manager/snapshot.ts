// Crash-recovery snapshot serialization — extracted verbatim from
// RoundManager.toSnapshot/restore/dispose/getReconnectInfo (round-manager.ts,
// Modul 2 of the SRP split).
//
// computeSnapshot and computeReconnectInfo are pure reads of the passed ctx.
// buildRestoreState is a PURE function of the incoming snapshot alone — every
// original assignment in restore() was either derived from `snap` or a
// hardcoded reset value (false/[]/0/null/undefined), never from existing
// `this.*` state — so it needs no ctx at all. disposeRoundState is the tiny
// clearAuto+throttle-cancel pair.
//
// The handful of remaining side effects that DO need live instance state
// (this.clearAuto() — owned by auto-mode.ts once extracted —,
// this.answerReceivedAt.clear(), the pauseWaiters drain, etc.) stay as a thin
// sequence of statements in RoundManager.restore()/dispose() themselves,
// exactly mirroring the original method bodies' order.
import type { Answer, Player, QuestionResult } from "@razzoozle/common/types/game"
import type {
  Status,
  StatusDataMap,
} from "@razzoozle/common/types/game/status"
import type { ScoreboardThrottle } from "@razzoozle/socket/services/game/scoreboard-throttle"

export interface GameCounter {
  answered: number
  correct: number
  ever: boolean
}

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

export interface QuestionStat {
  correct: number
  total: number
}

// Return shape of toSnapshot(). Kept structurally identical to the inline
// type the original method declared (and to Game.GameSnapshot['round'] in
// services/game/index.ts, which duplicates it) — no consumer changes.
export interface RoundSnapshot {
  started: boolean
  currentQuestion: number
  leaderboard: Player[]
  questionsHistory: QuestionResult[]
  autoMode: boolean
  paused: boolean
  pausedState: { status: Status; data: StatusDataMap[Status] } | null
  gameCounters?: Record<string, GameCounter>
  recapStats?: Record<string, RecapStat>
  questionStats?: Record<number, QuestionStat>
}

export interface ToSnapshotCtx {
  leaderboard: Player[]
  questionsHistory: QuestionResult[]
  started: boolean
  currentQuestion: number
  autoMode: boolean
  paused: boolean
  pausedState: { status: Status; data: StatusDataMap[Status] } | null
  gameCounters: ReadonlyMap<string, GameCounter>
  recapStats: ReadonlyMap<string, RecapStat>
  questionStats: ReadonlyMap<number, QuestionStat>
}

// Serialize only STABLE, serializable round state — never live timers, the
// in-flight question's partial answers, or per-tap dedup bookkeeping. Pure
// read; no behaviour change for a running game.
export function computeSnapshot(ctx: ToSnapshotCtx): RoundSnapshot {
  // Sim mode: bots must NEVER persist to a crash-recovery snapshot. Filter
  // them from BOTH the leaderboard AND each question's playerAnswers — a
  // reviewer trace proved that filtering only the player list still
  // resurrects bot ghosts via the round leaderboard / saved result on restore.
  // playerAnswers store the username (not isBot), so we derive the set of bot
  // usernames from the leaderboard and drop those entries by name.
  const botUsernames = new Set(
    ctx.leaderboard.filter((p) => p.isBot).map((p) => p.username),
  )
  // Drop bot clientIds from the persisted counters (a restored game must not
  // resurrect bot achievement state). Bots are identified via the leaderboard.
  const botClientIds = new Set(
    ctx.leaderboard.filter((p) => p.isBot).map((p) => p.clientId),
  )
  const gameCounters: Record<string, GameCounter> = {}

  for (const [clientId, counter] of ctx.gameCounters) {
    if (!botClientIds.has(clientId)) {
      gameCounters[clientId] = { ...counter }
    }
  }

  // Recap accumulator (WP-A): drop bot clientIds (a restored game must not
  // resurrect bot recap state) and deep-copy each scalar record.
  const recapStats: Record<string, RecapStat> = {}

  for (const [clientId, stat] of ctx.recapStats) {
    if (!botClientIds.has(clientId)) {
      recapStats[clientId] = {
        ...stat,
        achievementIds: [...stat.achievementIds],
      }
    }
  }

  // Per-question tally is not player-keyed (counts are already bot-free, since
  // bots never enter the loop branch that increments it) — copy verbatim.
  const questionStats: Record<number, QuestionStat> = {}

  for (const [index, q] of ctx.questionStats) {
    questionStats[index] = { ...q }
  }

  return {
    started: ctx.started,
    currentQuestion: ctx.currentQuestion,
    leaderboard: ctx.leaderboard.filter((p) => !p.isBot),
    questionsHistory: ctx.questionsHistory.map((q) => ({
      ...q,
      playerAnswers: q.playerAnswers.filter(
        (a) => !botUsernames.has(a.playerName),
      ),
    })),
    autoMode: ctx.autoMode,
    paused: ctx.paused,
    pausedState: ctx.pausedState,
    gameCounters,
    recapStats,
    questionStats,
  }
}

// Param shape of restore(). Kept structurally identical to the inline type the
// original method declared (and to Game.GameSnapshot['round']) — no consumer
// changes.
export interface RestoreSnapshotInput {
  started: boolean
  currentQuestion: number
  leaderboard: Player[]
  questionsHistory: QuestionResult[]
  autoMode: boolean
  paused?: boolean
  pausedState?: { status: Status; data: StatusDataMap[Status] } | null
  gameCounters?: Record<string, GameCounter>
  recapStats?: Record<string, RecapStat>
  questionStats?: Record<number, QuestionStat>
}

export interface RestoreState {
  started: boolean
  currentQuestion: number
  leaderboard: Player[]
  questionsHistory: QuestionResult[]
  autoMode: boolean
  paused: boolean
  pausedState: { status: Status; data: StatusDataMap[Status] } | null
  pauseState: { status: Status; data: StatusDataMap[Status] } | null
  playersAnswers: Answer[]
  startTime: number
  tempOldLeaderboard: Player[] | null
  answerDeadlineAtServerMs: number
  gameCounters: Map<string, GameCounter>
  recapStats: Map<string, RecapStat>
  questionStats: Map<number, QuestionStat>
  currentDisplayOrder: number[] | undefined
  currentShuffledChunks: string[] | undefined
  resultScreenActive: boolean
}

// Rebuild round state from a snapshot. We deliberately DO NOT resume a live
// question: playersAnswers is cleared, autoMode is forced false (a restored
// game must not auto-advance). leaderboard and questionsHistory are
// deep-copied so the snapshot object can't alias live state. Resume happens
// "at the leaderboard" (see Game.fromSnapshot). Pure function of `snap` alone
// — every field here is either derived from `snap` or a hardcoded reset value.
export function buildRestoreState(snap: RestoreSnapshotInput): RestoreState {
  return {
    started: snap.started,
    currentQuestion: snap.currentQuestion,
    leaderboard: snap.leaderboard.map((p) => ({ ...p })),
    questionsHistory: snap.questionsHistory.map((q) => ({ ...q })),
    // Force OFF: never auto-advance a restored game regardless of saved value.
    autoMode: false,
    paused: snap.paused ?? false,
    pausedState: snap.pausedState ?? null,
    pauseState: snap.pausedState ?? null,
    // No live question is resumed — drop partial answers + transient anchors.
    playersAnswers: [],
    startTime: 0,
    tempOldLeaderboard: null,
    answerDeadlineAtServerMs: 0,
    // Rebuild the per-player achievement counters so a resumed game keeps an
    // accurate participation / perfect_game / first_correct picture.
    gameCounters: new Map(
      Object.entries(snap.gameCounters ?? {}).map(([clientId, counter]) => [
        clientId,
        { ...counter },
      ]),
    ),
    // Rebuild the recap accumulator (WP-A) so a resumed game's end-of-game
    // superlatives stay accurate across a crash/restore.
    recapStats: new Map(
      Object.entries(snap.recapStats ?? {}).map(([clientId, stat]) => [
        clientId,
        { ...stat, achievementIds: [...stat.achievementIds] },
      ]),
    ),
    questionStats: new Map(
      Object.entries(snap.questionStats ?? {}).map(([index, q]) => [
        Number(index),
        { ...q },
      ]),
    ),
    currentDisplayOrder: undefined,
    currentShuffledChunks: undefined,
    resultScreenActive: false,
  }
}

// Clean up all pending timers to prevent leaks on game disposal.
export function disposeRoundState(ctx: {
  clearAuto: () => void
  answerCountThrottle: ScoreboardThrottle<number>
}): void {
  ctx.clearAuto()
  ctx.answerCountThrottle.cancel()
}

export function computeReconnectInfo(
  currentQuestion: number,
  totalQuestions: number,
): { current: number; total: number } {
  return {
    current: currentQuestion + 1,
    total: totalQuestions,
  }
}
