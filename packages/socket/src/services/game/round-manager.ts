import {
  EVENTS,
  FIRST_CORRECT_BONUS,
  MAX_LATENCY_COMPENSATION_MS,
  MEDIA_TYPES,
  SLIDER_TOLERANCE_FRACTION,
  STREAK_CAP,
  STREAK_STEP,
  TEAMS,
} from "@razzoozle/common/constants"
import {
  type AchievementId,
  type MergedAchievement,
  mergeAchievementsConfig,
} from "@razzoozle/common/achievements"
import type {
  Answer,
  GameResult,
  ManagerRecap,
  Player,
  PlayerRecap,
  Question,
  QuestionResult,
  Quizz,
  RoundRecapAward,
  RoundRecapKey,
  Superlative,
  SuperlativeKey,
  TeamStanding,
} from "@razzoozle/common/types/game"
import type {
  AnswerAck,
  AnswerAckReason,
  Server,
  Socket,
} from "@razzoozle/common/types/game/socket"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzoozle/common/types/game/status"
import type { LowLatencyMode } from "@razzoozle/common/validators/game-config"
import { CooldownTimer } from "@razzoozle/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzoozle/socket/services/game/player-manager"
import { ScoreboardThrottle } from "@razzoozle/socket/services/game/scoreboard-throttle"
import {
  matchAnswer,
  normalizeText,
} from "@razzoozle/socket/services/game/text-match"
import { metrics } from "@razzoozle/socket/services/metrics"
import { timeToPoint } from "@razzoozle/socket/utils/game"
import sleep from "@razzoozle/socket/utils/sleep"
import { nanoid } from "nanoid"

// Server-side bookkeeping for a stored answer that never leaves the server: the
// authoritative receive timestamp and the per-tap dedup id. Kept separate from
// the shared `Answer` type (common layer) so this stays a server-only concern.
interface AnswerMeta {
  serverReceivedAtMs: number
  clientMessageId?: string
}

type BroadcastFn = <T extends Status>(
  _status: T,
  _data: StatusDataMap[T],
) => void
type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface RoundManagerOptions {
  quizz: Quizz
  players: PlayerManager
  cooldown: CooldownTimer
  io: Server
  gameId: string
  getManagerId: () => string
  broadcast: BroadcastFn
  send: SendFn
  onNewQuestion: () => void
  onGameFinished: (_result: GameResult) => void
  // Sim mode: fired right after the SELECT_ANSWER broadcast (answer window now
  // open) so the BotManager can schedule its per-bot answers; and at EVERY point
  // the window closes (early-advance abort, showResults, abortQuestion) so the
  // BotManager can cancel pending bot timers (no late-bot race into the next Q).
  // OPTIONAL — absent in normal mode / unit-test fakes => no-op.
  onQuestionOpen?: (_question: Question) => void
  onAnswerWindowClose?: () => void
  // Low-latency mode config (already defaulted by the zod validator). When
  // `enabled` is false every branch below is skipped => normal mode unchanged.
  lowLatency: LowLatencyMode
  // Team mode: read ONCE at game creation (like lowLatency). When false the
  // team-standings aggregation in showLeaderboard/FINISHED is skipped entirely
  // (the optional `teamStandings` field stays undefined). OPTIONAL — absent in
  // unit-test fakes => treated as false (normal, no-teams behaviour).
  teamMode?: boolean
  // Manager-editable achievements config, merged with the registry defaults and
  // read ONCE at game creation (like teamMode). Drives the enable/disable gate +
  // the per-badge numeric thresholds in showResults. OPTIONAL — absent in unit-
  // test fakes => the constructor falls back to the registry defaults, so the
  // SHIPPED hardcoded behaviour is preserved.
  achievements?: MergedAchievement[]
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private started = false
  private currentQuestion = 0
  private playersAnswers: Answer[] = []
  private startTime = 0
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private tempRoundRecap: RoundRecapAward[] | null = null
  // True once the per-round recap screen (SHOW_ROUND_RECAP) has been emitted for
  // the current round, so showLeaderboard() only interposes it ONCE (first call
  // → recap screen, second call → real leaderboard). Reset each round in
  // showResults().
  private roundRecapShown = false
  private questionsHistory: QuestionResult[] = []
  private autoMode = false
  private autoTimer: ReturnType<typeof setTimeout> | null = null
  // Auto-mode advance durations (ms). Hoisted to class level so setAutoMode (the
  // mid-screen immediacy path) and showResults/showLeaderboard (the countdown
  // emit) read the SAME values scheduleAuto arms its timers with.
  private static readonly AUTO_RESULT_MS = 6000
  private static readonly AUTO_LEADERBOARD_MS = 5000
  // FIX 8/9 bookkeeping: true while the post-results screen is showing (set at the
  // end of showResults, cleared once showLeaderboard runs). Lets setAutoMode arm
  // the advance for the screen ALREADY on display when auto-mode is toggled on.
  private resultScreenActive = false
  // Per-player (socketId -> SHOW_RESULT payload) cache of the round's result
  // screen, kept so a mid-screen auto-mode toggle can RE-SEND the full payload
  // with autoAdvanceMs added (re-sending the complete screen avoids any client
  // merge-vs-replace assumption). Cleared once the screen is left.
  private lastResultPayloads = new Map<string, StatusDataMap["SHOW_RESULT"]>()
  // Sim mode: true while the SELECT_ANSWER window is open. Gates Game.addBots
  // (no mid-window bot injection) via isAnswerWindowOpen().
  private answerWindowOpen = false
  private paused = false
  private pauseState: { status: Status; data: StatusDataMap[Status] } | null =
    null
  private pausedState: { status: Status; data: StatusDataMap[Status] } | null =
    null
  private pauseWaiters: Array<() => void> = []

  // ── Low-latency mode state (only populated when enabled) ──────────────────
  private readonly ll: LowLatencyMode
  // Monotonic server sequence stamped on each SELECT_ANSWER broadcast. Lets a
  // reconnecting client detect a stale view. Starts at 0; first question = 1.
  private serverSeq = 0
  // Per-answer server-side bookkeeping keyed by clientId (receive ts + dedup id).
  private answerMeta = new Map<string, AnswerMeta>()
  // Set of clientMessageIds already accepted this question (dedup by id).
  private seenMessageIds = new Set<string>()
  // Server wall-clock deadline for the current question (for too_late checks).
  private answerDeadlineAtServerMs = 0
  // Leading+trailing throttle for the live answered-count broadcast.
  private readonly answerCountThrottle: ScoreboardThrottle<number>

  // ── Achievements bookkeeping ──────────────────────────────────────────────
  // Server-receive timestamp per clientId for the CURRENT question, for ALL
  // modes (LL mode also tracks this in answerMeta, but achievements need it even
  // in normal mode). Cleared at each newQuestion()/showResults boundary. Used to
  // derive responseTimeMs = received - this.startTime for the timing badges.
  private answerReceivedAt = new Map<string, number>()
  // Per-player game counters that SURVIVE across rounds (and snapshot/restore),
  // keyed by the durable clientId: how many scored questions they answered, how
  // many they got right, and whether they have EVER answered correctly. Drives
  // participation / perfect_game / first_correct.
  private gameCounters = new Map<
    string,
    { answered: number; correct: number; ever: boolean }
  >()
  // Per-player RECAP accumulator (WP-A) — scalar-only, persistent across rounds
  // and snapshot-safe, mirroring gameCounters. Updated INSIDE the showResults
  // sortedPlayers loop (reads the already-computed aXxx fields — zero recompute).
  // Drives the end-of-game superlatives + each player's myRecap card. Bots never
  // enter this map (sim-mode contract). No per-answer arrays (room-scale memory).
  private recapStats = new Map<
    string,
    {
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
  >()
  // Per-QUESTION correctness tally (WP-A), keyed by 0-based question index, for
  // the hardest_question superlative (lowest correct%). Snapshot-safe; scalar.
  private questionStats = new Map<number, { correct: number; total: number }>()
  // Manager-editable achievements config as an O(1) id → MergedAchievement map,
  // built ONCE at construction. Drives the enabled gate + the per-badge numeric
  // thresholds in showResults. Falls back to the registry defaults when the
  // option is absent (unit-test fakes), so the SHIPPED behaviour is preserved.
  private readonly achievementsConfig: Map<AchievementId, MergedAchievement>

  constructor(opts: RoundManagerOptions) {
    this.opts = opts
    this.ll = opts.lowLatency

    // Default to the registry defaults (mergeAchievementsConfig({})) when no
    // config is passed — keeps the unit-test fakes and any legacy caller on the
    // SHIPPED hardcoded thresholds / all-enabled behaviour.
    const merged = opts.achievements ?? mergeAchievementsConfig({})
    this.achievementsConfig = new Map(merged.map((a) => [a.id, a]))

    // Throttle only the chatter (answered count). delayMs 0 when disabled =>
    // emits immediately, byte-identical to today.
    const throttleMs = this.ll.enabled
      ? this.ll.scoreboardBroadcastThrottleMs
      : 0
    this.answerCountThrottle = new ScoreboardThrottle<number>(
      throttleMs,
      (count) => {
        this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.PLAYER_ANSWER, count)
      },
    )
  }

  setAutoMode(on: boolean): void {
    // Always record the intent — even while paused. scheduleAuto()'s pause
    // handling (waitWhilePaused) already defers the actual advance, so storing
    // autoMode during a pause is safe and avoids a silent UI(on)/server(off)
    // desync where auto-advance never resumes after un-pausing.
    this.autoMode = on

    if (!on) {
      this.clearAuto()

      return
    }

    // FIX 8 (immediacy): toggled ON while a result screen is already showing —
    // arm the advance for THAT screen now instead of waiting for the next phase
    // boundary. Guard against a duplicate timer (do nothing if one is pending).
    // scheduleAuto() re-sends the result payload with autoAdvanceMs (FIX 9) so
    // the client gets the countdown for the screen it is already on.
    if (this.started && this.resultScreenActive && this.autoTimer === null) {
      this.scheduleAuto()
      // FIX 9: the SHOW_RESULT screen was already broadcast WITHOUT a countdown
      // (auto-mode was off then) — re-send it with autoAdvanceMs so the client
      // can render the local countdown for the screen it is already on.
      this.emitResultCountdown(RoundManager.AUTO_RESULT_MS)
    }
  }

  private clearAuto(): void {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer)
      this.autoTimer = null
    }
  }

  // FIX 9 (mid-screen re-send): re-deliver the cached SHOW_RESULT payload to each
  // player with autoAdvanceMs added, so a client already sitting on the result
  // screen gets the countdown when auto-mode is toggled on. Re-sends the FULL
  // cached payload (not a partial), so it is safe regardless of how the client
  // applies the screen state. No-op when the cache is empty (not on the result
  // screen / already advanced).
  private emitResultCountdown(autoAdvanceMs: number): void {
    if (this.lastResultPayloads.size === 0) {
      return
    }

    for (const [socketId, payload] of this.lastResultPayloads) {
      this.send(socketId, STATUS.SHOW_RESULT, { ...payload, autoAdvanceMs })
    }
  }

  // Auto mode: after results, advance to leaderboard then the next question
  // automatically (with pauses), so the host doesn't click through every round.
  private scheduleAuto(): void {
    this.clearAuto()
    const AUTO_RESULT_MS = RoundManager.AUTO_RESULT_MS
    const AUTO_LEADERBOARD_MS = RoundManager.AUTO_LEADERBOARD_MS

    // After the leaderboard dwell, advance to the next question (honouring pause).
    const advanceToNext = () => {
      this.autoTimer = setTimeout(() => {
        if (this.paused) {
          void this.waitWhilePaused().then(() => {
            if (!this.started || !this.autoMode) {
              return
            }

            if (this.opts.quizz.questions[this.currentQuestion + 1]) {
              this.currentQuestion += 1
              void this.newQuestion()
            }
          })

          return
        }

        if (!this.started || !this.autoMode) {
          return
        }

        if (this.opts.quizz.questions[this.currentQuestion + 1]) {
          this.currentQuestion += 1
          void this.newQuestion()
        }
      }, AUTO_LEADERBOARD_MS)
    }

    this.autoTimer = setTimeout(() => {
      if (!this.started || !this.autoMode) {
        return
      }

      // First hop off the result screen: showLeaderboard() may divert to the
      // per-round recap screen (manager-only). Detect via roundRecapShown.
      this.showLeaderboard()

      if (!this.started) {
        return
      }

      if (this.roundRecapShown) {
        // We are on the recap screen — hold it for AUTO_RESULT_MS, then the
        // SECOND showLeaderboard() passes the guard and shows the real board.
        this.autoTimer = setTimeout(() => {
          if (!this.started || !this.autoMode) {
            return
          }

          this.showLeaderboard()

          if (!this.started) {
            return
          }

          advanceToNext()
        }, AUTO_RESULT_MS)
      } else {
        advanceToNext()
      }
    }, AUTO_RESULT_MS)
  }

  private isPausableStatus(status: Status): boolean {
    return (
      status === STATUS.SHOW_LEADERBOARD ||
      status === STATUS.SHOW_START ||
      status === STATUS.SHOW_PREPARED ||
      status === STATUS.WAIT ||
      status === STATUS.SHOW_ROOM
    )
  }

  private rememberPauseState<T extends Status>(
    status: T,
    data: StatusDataMap[T],
  ): void {
    this.pauseState = { status, data }
  }

  private broadcast<T extends Status>(status: T, data: StatusDataMap[T]): void {
    this.rememberPauseState(status, data)
    this.opts.broadcast(status, data)
  }

  private send<T extends Status>(
    target: string,
    status: T,
    data: StatusDataMap[T],
  ): void {
    if (target === this.opts.getManagerId()) {
      this.rememberPauseState(status, data)
    }

    this.opts.send(target, status, data)
  }

  private waitWhilePaused(): Promise<void> {
    if (!this.paused) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.pauseWaiters.push(resolve)
    })
  }

  pause(): void {
    if (this.paused) {
      return
    }

    if (!this.pauseState || !this.isPausableStatus(this.pauseState.status)) {
      console.log("Pause rejected: current status is not pausable")

      return
    }

    this.paused = true
    this.pausedState = this.pauseState
    this.opts.broadcast(STATUS.PAUSED, { reason: "paused" })
  }

  resume(): void {
    if (!this.paused) {
      return
    }

    const state = this.pausedState
    this.paused = false
    this.pausedState = null

    if (state) {
      this.broadcast(state.status, state.data)
    }

    const waiters = this.pauseWaiters
    this.pauseWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  isPaused(): boolean {
    return this.paused
  }

  isStarted(): boolean {
    return this.started
  }

  // Public read of the 0-based current question index. Used by Game.toSnapshot
  // (and as a getter the task asks for) without exposing the mutable field.
  getCurrentQuestion(): number {
    return this.currentQuestion
  }

  // ── Crash-recovery snapshot ──────────────────────────────────────────────
  // Serialize only STABLE, serializable round state — never live timers, the
  // in-flight question's partial answers, or per-tap dedup bookkeeping. Pure
  // read; no behaviour change for a running game.
  toSnapshot(): {
    started: boolean
    currentQuestion: number
    leaderboard: Player[]
    questionsHistory: QuestionResult[]
    autoMode: boolean
    paused: boolean
    pausedState: { status: Status; data: StatusDataMap[Status] } | null
    // Per-player achievement counters keyed by clientId. Survives restore so a
    // resumed game keeps participation / perfect_game / first_correct accurate.
    // Serialized as a plain object (a Map can't be structured-cloned to JSON).
    gameCounters?: Record<
      string,
      { answered: number; correct: number; ever: boolean }
    >
    // Per-player recap accumulator (WP-A) — survives restore so a resumed game
    // keeps accurate end-of-game superlatives. Serialized as a plain object.
    recapStats?: Record<
      string,
      {
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
    >
    // Per-question correctness tally (WP-A) for the hardest_question superlative.
    questionStats?: Record<number, { correct: number; total: number }>
  } {
    // Sim mode: bots must NEVER persist to a crash-recovery snapshot. Filter
    // them from BOTH the leaderboard AND each question's playerAnswers — a
    // reviewer trace proved that filtering only the player list still
    // resurrects bot ghosts via the round leaderboard / saved result on restore.
    // playerAnswers store the username (not isBot), so we derive the set of bot
    // usernames from the leaderboard and drop those entries by name.
    const botUsernames = new Set(
      this.leaderboard.filter((p) => p.isBot).map((p) => p.username),
    )
    // Drop bot clientIds from the persisted counters (a restored game must not
    // resurrect bot achievement state). Bots are identified via the leaderboard.
    const botClientIds = new Set(
      this.leaderboard.filter((p) => p.isBot).map((p) => p.clientId),
    )
    const gameCounters: Record<
      string,
      { answered: number; correct: number; ever: boolean }
    > = {}

    for (const [clientId, counter] of this.gameCounters) {
      if (!botClientIds.has(clientId)) {
        gameCounters[clientId] = { ...counter }
      }
    }

    // Recap accumulator (WP-A): drop bot clientIds (a restored game must not
    // resurrect bot recap state) and deep-copy each scalar record.
    const recapStats: Record<
      string,
      {
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
    > = {}

    for (const [clientId, stat] of this.recapStats) {
      if (!botClientIds.has(clientId)) {
        recapStats[clientId] = {
          ...stat,
          achievementIds: [...stat.achievementIds],
        }
      }
    }

    // Per-question tally is not player-keyed (counts are already bot-free, since
    // bots never enter the loop branch that increments it) — copy verbatim.
    const questionStats: Record<number, { correct: number; total: number }> = {}

    for (const [index, q] of this.questionStats) {
      questionStats[index] = { ...q }
    }

    return {
      started: this.started,
      currentQuestion: this.currentQuestion,
      leaderboard: this.leaderboard.filter((p) => !p.isBot),
      questionsHistory: this.questionsHistory.map((q) => ({
        ...q,
        playerAnswers: q.playerAnswers.filter(
          (a) => !botUsernames.has(a.playerName),
        ),
      })),
      autoMode: this.autoMode,
      paused: this.paused,
      pausedState: this.pausedState,
      gameCounters,
      recapStats,
      questionStats,
    }
  }

  // Rebuild round state from a snapshot. We deliberately DO NOT resume a live
  // question: playersAnswers is cleared, autoMode is forced false (a restored
  // game must not auto-advance), every timer/map is reset. leaderboard and
  // questionsHistory are deep-copied so the snapshot object can't alias live
  // state. Resume happens "at the leaderboard" (see Game.fromSnapshot).
  restore(snap: {
    started: boolean
    currentQuestion: number
    leaderboard: Player[]
    questionsHistory: QuestionResult[]
    autoMode: boolean
    paused?: boolean
    pausedState?: { status: Status; data: StatusDataMap[Status] } | null
    gameCounters?: Record<
      string,
      { answered: number; correct: number; ever: boolean }
    >
    recapStats?: Record<
      string,
      {
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
    >
    questionStats?: Record<number, { correct: number; total: number }>
  }): void {
    this.started = snap.started
    this.currentQuestion = snap.currentQuestion
    this.leaderboard = snap.leaderboard.map((p) => ({ ...p }))
    this.questionsHistory = snap.questionsHistory.map((q) => ({ ...q }))
    // Force OFF: never auto-advance a restored game regardless of saved value.
    this.autoMode = false
    this.paused = snap.paused ?? false
    this.pausedState = snap.pausedState ?? null
    this.pauseState = snap.pausedState ?? null

    // No live question is resumed — drop partial answers + transient anchors.
    this.playersAnswers = []
    this.startTime = 0
    this.tempOldLeaderboard = null
    this.answerDeadlineAtServerMs = 0

    // Rebuild the per-player achievement counters so a resumed game keeps an
    // accurate participation / perfect_game / first_correct picture. The
    // per-question answerReceivedAt is transient and starts empty.
    this.gameCounters = new Map(
      Object.entries(snap.gameCounters ?? {}).map(([clientId, counter]) => [
        clientId,
        { ...counter },
      ]),
    )
    // Rebuild the recap accumulator (WP-A) so a resumed game's end-of-game
    // superlatives stay accurate across a crash/restore.
    this.recapStats = new Map(
      Object.entries(snap.recapStats ?? {}).map(([clientId, stat]) => [
        clientId,
        { ...stat, achievementIds: [...stat.achievementIds] },
      ]),
    )
    this.questionStats = new Map(
      Object.entries(snap.questionStats ?? {}).map(([index, q]) => [
        Number(index),
        { ...q },
      ]),
    )
    this.answerReceivedAt.clear()

    // Clear any timers/maps so a restored game starts from a clean slate.
    this.clearAuto()
    this.resultScreenActive = false
    this.lastResultPayloads.clear()
    this.seenMessageIds.clear()
    this.answerMeta.clear()
    this.answerCountThrottle.cancel()
    const waiters = this.pauseWaiters
    this.pauseWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  getReconnectInfo() {
    return {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    }
  }

  async start(socket: Socket): Promise<void> {
    if (this.opts.getManagerId() !== socket.id) {
      return
    }

    if (this.started) {
      return
    }

    if (this.opts.players.count() === 0) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.noPlayersConnected")

      return
    }

    this.started = true

    this.broadcast(STATUS.SHOW_START, {
      time: 3,
      subject: this.opts.quizz.subject,
    })

    await sleep(3)
    await this.waitWhilePaused()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.START_COOLDOWN)
    this.pauseState = null
    await this.opts.cooldown.start(3)

    void this.newQuestion()
  }

  async newQuestion(): Promise<void> {
    if (!this.started) {
      return
    }

    this.clearAuto()
    // Leaving the result screen for a fresh question — drop its FIX 8/9 state.
    this.resultScreenActive = false
    this.lastResultPayloads.clear()
    await this.waitWhilePaused()

    const question = this.opts.quizz.questions[this.currentQuestion]

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    this.broadcast(STATUS.SHOW_PREPARED, {
      totalAnswers: question.answers?.length ?? 0,
      questionNumber: this.currentQuestion + 1,
    })

    await sleep(2)
    await this.waitWhilePaused()

    if (!this.started) {
      return
    }
    this.pauseState = null

    const imageMedia =
      question.media?.type === MEDIA_TYPES.IMAGE ? question.media : undefined

    this.broadcast(STATUS.SHOW_QUESTION, {
      question: question.question,
      media: imageMedia,
      cooldown: question.cooldown,
      // Answer TEXTS only, so the presenter big-screen can render the Kahoot-style
      // colored answer tiles during the question phase. Slider questions have no
      // discrete answers (only min/max), so we omit them there — mirrors the
      // SELECT_ANSWER guard below. Carries NO solutions/correct (anti-cheat):
      // identical to what SELECT_ANSWER already broadcasts to all clients next.
      ...(question.type === "slider" ? {} : { answers: question.answers }),
      // Display-only attribution; undefined for non-submitted questions. Carries
      // NO correct-answer data — solutions stay server-side (anti-cheat).
      submittedBy: question.submittedBy,
    })

    await sleep(question.cooldown)

    if (!this.started) {
      return
    }

    this.startTime = Date.now()

    // Achievements: reset the per-question receive-time map (ALL modes) so a
    // stale timestamp from a prior question can never leak into this round's
    // timing badges (speed_demon / lucky_guess / speedy_gonzales).
    this.answerReceivedAt.clear()

    // Low-latency mode: reset per-question dedup bookkeeping and stamp the
    // server-authoritative timing anchors. All guarded by `enabled` so normal
    // mode neither computes nor emits any of this (the optional status fields
    // stay `undefined` and old clients ignore them).
    let llAnchors: {
      serverSeq?: number
      serverNowMs?: number
      questionStartAtServerMs?: number
      answerDeadlineAtServerMs?: number
    } = {}

    if (this.ll.enabled) {
      this.answerMeta.clear()
      this.seenMessageIds.clear()
      this.serverSeq += 1

      const serverNowMs = this.startTime
      // Deadline mirrors the existing cooldown.start(question.time) below.
      this.answerDeadlineAtServerMs = serverNowMs + question.time * 1000

      llAnchors = {
        serverSeq: this.serverSeq,
        serverNowMs,
        questionStartAtServerMs: serverNowMs,
        answerDeadlineAtServerMs: this.answerDeadlineAtServerMs,
      }
    }

    this.broadcast(STATUS.SELECT_ANSWER, {
      question: question.question,
      media: question.media,
      time: question.time,
      totalPlayer: this.opts.players.count(),
      type: question.type,
      ...(question.type === "slider"
        ? {
            min: question.min,
            max: question.max,
            step: question.step,
            unit: question.unit,
          }
        : { answers: question.answers }),
      ...llAnchors,
      // Display-only attribution; same value carried through both phases. NO
      // solutions/correct field is ever broadcast to clients (anti-cheat).
      submittedBy: question.submittedBy,
    })

    // Sim mode: the answer window is now open — let the BotManager schedule its
    // per-bot answers against the real selectAnswer path.
    this.answerWindowOpen = true
    this.opts.onQuestionOpen?.(question)

    await this.opts.cooldown.start(question.time)

    if (!this.started) {
      return
    }

    this.showResults(question)
  }

  // ── Achievements config helpers ───────────────────────────────────────────
  // enabled gate: a badge with `enabled === false` in the merged config is
  // skipped entirely (never pushed). A missing entry (never happens once merged
  // off the registry, but defensive) defaults to enabled.
  private achievementEnabled(id: AchievementId): boolean {
    return this.achievementsConfig.get(id)?.enabled ?? true
  }

  // configured numeric threshold for a badge, falling back to `fallback` (the
  // shipped default) when the config carries no number for it. Merged config
  // already clamped the value to the registry [min,max], so this is read-only.
  private achievementThreshold(id: AchievementId, fallback: number): number {
    return this.achievementsConfig.get(id)?.threshold ?? fallback
  }

  // Per-badge bonus points awarded when the badge unlocks. Falls back to 0 when
  // the merged config carries no number for it (registry holds no per-id bonus),
  // so an empty/missing config reproduces the previous scoring exactly. Merged
  // config already clamped the value to [0, BONUS_MAX], so this is read-only.
  private achievementBonus(id: AchievementId): number {
    return this.achievementsConfig.get(id)?.bonus ?? 0
  }

  // ── Per-round recap awards (additive, optional) ───────────────────────────
  // Build up to 3 game-wide RoundRecapAward highlights for THIS round from the
  // already-computed per-player intermediate rows (the aXxx fields + rankBefore
  // + the freshly-unlocked achievements). Bots are excluded. Awards are picked
  // by the SPEC priority list; we prefer variety (a clientId already used as a
  // winner is de-prioritised but allowed when nothing else qualifies). Returns
  // an empty array when nothing qualifies — the caller then omits the field so
  // old clients are unaffected. NEVER throws.
  private computeRoundRecap(
    rows: ReadonlyArray<{
      clientId: string
      username: string
      avatar?: string
      isBot?: boolean
      aIsCorrect: boolean
      aResponseTimeMs: number | null
      aStreakAfter: number
      lastPoints: number
      answeredThisRound: boolean
    }>,
    rankAfterByClient: ReadonlyMap<string, number>,
    rankBefore: ReadonlyMap<string, number>,
    achievementsByClient: ReadonlyMap<string, string[]>,
    firstCorrectId: string | null,
    hasPriorRound: boolean,
  ): RoundRecapAward[] {
    try {
      // Only non-bot players are eligible for any highlight.
      const eligible = rows.filter((r) => !r.isBot)
      if (eligible.length === 0) {
        // ponytail: no human players this round — nothing to highlight.
        return []
      }

      const awards: RoundRecapAward[] = []
      const used = new Set<string>()

      const findRow = (clientId: string) =>
        eligible.find((r) => r.clientId === clientId)

      // Push one award if a winning row exists; prefer a not-yet-used winner but
      // accept an already-used one rather than skipping a real highlight. The
      // `pick` callback resolves the winning row (or null) given a candidate set.
      const add = (
        key: RoundRecapKey,
        candidates: ReadonlyArray<{ clientId: string; metric: number }>,
        order: "max" | "min",
        value: (metric: number) => number | undefined,
      ): void => {
        if (awards.length >= 3 || candidates.length === 0) {
          return
        }
        const better = (a: number, b: number) =>
          order === "max" ? a > b : a < b
        // Prefer a fresh winner; fall back to the best overall if all are used.
        const pickFrom = (
          pool: ReadonlyArray<{ clientId: string; metric: number }>,
        ): { clientId: string; metric: number } | null => {
          let best: { clientId: string; metric: number } | null = null
          for (const c of pool) {
            if (best === null || better(c.metric, best.metric)) {
              best = c
            }
          }
          return best
        }
        const fresh = candidates.filter((c) => !used.has(c.clientId))
        const winner = pickFrom(fresh) ?? pickFrom(candidates)
        if (winner === null) {
          return
        }
        const row = findRow(winner.clientId)
        if (row === undefined) {
          return
        }
        const v = value(winner.metric)
        awards.push({
          key,
          winnerName: row.username,
          ...(row.avatar !== undefined ? { winnerAvatar: row.avatar } : {}),
          ...(v !== undefined ? { value: v } : {}),
        })
        used.add(winner.clientId)
      }

      // 1. fastest_finger — correct answerer, smallest response time (ms).
      add(
        "fastest_finger",
        eligible
          .filter((r) => r.aIsCorrect && r.aResponseTimeMs !== null)
          .map((r) => ({
            clientId: r.clientId,
            metric: r.aResponseTimeMs!,
          })),
        "min",
        (ms) => ms,
      )

      // 2. first_correct — first correct answerer this round (arrival order). No value.
      if (
        awards.length < 3 &&
        firstCorrectId !== null &&
        findRow(firstCorrectId) !== undefined
      ) {
        add(
          "first_correct",
          [{ clientId: firstCorrectId, metric: 0 }],
          "max",
          () => undefined,
        )
      }

      // 3. streak — highest current streak >= 2 (value = streak length).
      add(
        "streak",
        eligible
          .filter((r) => r.aStreakAfter >= 2)
          .map((r) => ({ clientId: r.clientId, metric: r.aStreakAfter })),
        "max",
        (n) => n,
      )

      // 4. highest_round_score — most points gained THIS round (> 0).
      add(
        "highest_round_score",
        eligible
          .filter((r) => r.lastPoints > 0)
          .map((r) => ({ clientId: r.clientId, metric: r.lastPoints })),
        "max",
        (n) => n,
      )

      // 5. rank_climber — biggest positive rank improvement vs pre-round order.
      if (hasPriorRound) {
        const climbers: { clientId: string; metric: number }[] = []
        for (const r of eligible) {
          const before = rankBefore.get(r.clientId)
          const after = rankAfterByClient.get(r.clientId)
          if (before !== undefined && after !== undefined) {
            const climbed = before - after
            if (climbed > 0) {
              climbers.push({ clientId: r.clientId, metric: climbed })
            }
          }
        }
        add("rank_climber", climbers, "max", (n) => n)
      } else {
        // ponytail: round 1 has no pre-round order — rank_climber is meaningless.
      }

      // 6. achievement_unlock — a player who unlocked an achievement this round. No value.
      if (awards.length < 3) {
        const unlockers: { clientId: string; metric: number }[] = []
        for (const r of eligible) {
          const got = achievementsByClient.get(r.clientId)
          if (got !== undefined && got.length > 0) {
            unlockers.push({ clientId: r.clientId, metric: got.length })
          }
        }
        add("achievement_unlock", unlockers, "max", () => undefined)
      }

      // 7. slowest_player (filler) — largest response time among answerers (ms).
      add(
        "slowest_player",
        eligible
          .filter((r) => r.answeredThisRound && r.aResponseTimeMs !== null)
          .map((r) => ({
            clientId: r.clientId,
            metric: r.aResponseTimeMs!,
          })),
        "max",
        (ms) => ms,
      )

      // 8. most_wrong (filler) — per-round this is 0/1 wrong per player, so the
      // count is 1 for any wrong answerer; surfaced only as a last-resort filler.
      add(
        "most_wrong",
        eligible
          .filter((r) => r.answeredThisRound && !r.aIsCorrect)
          .map((r) => ({ clientId: r.clientId, metric: 1 })),
        "max",
        (n) => n,
      )

      return awards.slice(0, 3)
    } catch {
      // ponytail: recap is best-effort — any unexpected error yields no awards
      // and the caller omits the field (old clients keep working).
      return []
    }
  }

  private showResults(question: Question): void {
    // Sim mode: the window is closing — cancel pending bot timers first so no
    // late bot answer can land after results are computed.
    this.answerWindowOpen = false
    this.opts.onAnswerWindowClose?.()

    const currentPlayers = this.opts.players.getAll()

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    // ── Achievements pre-round snapshot ───────────────────────────────────────
    // A prior round exists iff this.leaderboard was populated (round >= 1). The
    // `climber` badge needs the FULL pre-round ranking (not the top-5 slice), so
    // we rank EVERY current player by their points BEFORE this round's scoring.
    const hasPriorRound = this.leaderboard.length > 0
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
    const totalScoredQuestions = this.opts.quizz.questions.filter(
      (q) => q.type !== "poll" && !q.practice,
    ).length
    // participation / perfect_game must fire on the last SCORED question — not
    // the literal last question. If the quiz ends on a poll/practice round, the
    // counters never reach their total inside the `aScored` branch (poll/practice
    // rows are skipped), so we anchor on the index of the final scored question.
    const lastScoredIndex = this.opts.quizz.questions.reduce(
      (last, q, i) => (q.type !== "poll" && !q.practice ? i : last),
      -1,
    )
    const isLastScoredRound = this.currentQuestion === lastScoredIndex

    const totalType = this.playersAnswers.reduce(
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
      question.type === "type-answer"
        ? this.playersAnswers.reduce(
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

    // Correctness + base factor (0..1) for a single answer, before multipliers.
    // answerIds carries a multiple-select player's selected set; answerText the
    // type-answer free text. Both are undefined for choice/boolean/slider/poll.
    const evalAnswer = (
      answerId: number,
      answerIds?: number[],
      answerText?: string,
    ): { correct: boolean; base: number } => {
      // Type-answer: server-authoritative text match (anti-cheat — acceptedAnswers
      // never leave the server). All-or-nothing (base 1 on a match, else 0).
      if (question.type === "type-answer") {
        if (!answerText || !question.acceptedAnswers?.length) {
          return { correct: false, base: 0 }
        }

        const correct = matchAnswer(
          answerText,
          question.acceptedAnswers,
          question.matchMode ?? "normalized",
        )

        return { correct, base: correct ? 1 : 0 }
      }

      if (
        question.type === "slider" &&
        question.min != null &&
        question.max != null &&
        question.correct != null
      ) {
        const range = question.max - question.min || 1
        const dist = Math.abs(answerId - question.correct)
        const accuracy = Math.max(0, 1 - dist / range)
        const within =
          dist <=
          Math.max(question.step ?? 0, range * SLIDER_TOLERANCE_FRACTION)

        return { correct: within, base: within ? accuracy : 0 }
      }

      // Multiple-select: all-or-nothing. The selected set must equal solutions
      // EXACTLY by size and content (order irrelevant — Set comparison). No
      // partial credit.
      if (question.type === "multiple-select" && answerIds !== undefined) {
        // Dedupe solutions too: a hand-crafted/imported quiz could carry
        // duplicate indices (the validator only enforces length>=2), which would
        // otherwise let a wrong same-size selection score as correct.
        const solutions = [...new Set(question.solutions ?? [])]

        if (answerIds.length !== solutions.length) {
          return { correct: false, base: 0 }
        }

        const selectedSet = new Set(answerIds)
        const correct = solutions.every((s) => selectedSet.has(s))

        return { correct, base: correct ? 1 : 0 }
      }

      const correct = question.solutions?.includes(answerId) ?? false

      return { correct, base: correct ? 1 : 0 }
    }

    // The first player (by answer arrival order) to get it right earns a flat bonus.
    let firstCorrectId: string | null = null

    if (!isPoll && !question.practice) {
      for (const a of this.playersAnswers) {
        if (evalAnswer(a.answerId, a.answerIds, a.answerText).correct) {
          firstCorrectId = a.clientId

          break
        }
      }
    }

    const sortedPlayers = currentPlayers
      .map((player) => {
        const playerAnswer = this.playersAnswers.find(
          (a) => a.clientId === player.clientId,
        )

        // Poll: opinion vote — neutral, no points, streak untouched. No
        // achievement is ever awarded on a poll (gated below via aScored=false).
        if (isPoll) {
          return {
            ...player,
            lastCorrect: false,
            lastPoints: 0,
            lastPoll: true,
            lastStreak: player.streak,
            lastStreakBonus: false,
            lastBonus: false,
            lastFirstCorrect: false,
            // Achievement intermediates (internal, stripped before the wire).
            aScored: false,
            aIsCorrect: false,
            aBaseFactor: 0,
            aStreakAfter: player.streak,
            aGotFirst: false,
            aResponseTimeMs: null as number | null,
            aPointsBefore: player.points,
            aPointsAfter: player.points,
          }
        }

        let isCorrect = false
        let rawPoints = 0
        let baseFactor = 0

        if (playerAnswer) {
          const ev = evalAnswer(
            playerAnswer.answerId,
            playerAnswer.answerIds,
            playerAnswer.answerText,
          )
          isCorrect = ev.correct
          baseFactor = ev.base
          rawPoints = ev.base * playerAnswer.points
        }

        // Achievements: server-receive response time for this player this round
        // (ALL modes). null when the player did not answer. Clamped to >= 0 so a
        // clock skew can't produce a negative "faster than instant" badge.
        const receivedAt = this.answerReceivedAt.get(player.clientId)
        const responseTimeMs =
          receivedAt !== undefined
            ? Math.max(0, receivedAt - this.startTime)
            : null

        // pointsBefore is captured BEFORE the mutation below (from the snapshot
        // taken before this map ran), so it is the player's pre-round total.
        const myPointsBefore =
          pointsBefore.get(player.clientId) ?? player.points

        const streakBefore = player.streak
        // Streak multiplier: +10% per consecutive correct, capped at +50%.
        const streakMult = isCorrect
          ? 1 + STREAK_STEP * Math.min(streakBefore, STREAK_CAP)
          : 1
        const bonusMult = question.bonus ? 2 : 1

        let points = question.practice
          ? 0
          : Math.round(rawPoints * streakMult * bonusMult)

        let gotFirst = false

        if (
          !question.practice &&
          isCorrect &&
          player.clientId === firstCorrectId
        ) {
          // Scale the first-correct bonus by accuracy (full for choice/boolean,
          // proportional for slider) so a fast near-miss can't beat an accurate one.
          points += Math.round(FIRST_CORRECT_BONUS * baseFactor)
          gotFirst = true
        }

        player.points += points
        // Practice questions don't touch the streak (they award no points).
        player.streak = question.practice
          ? streakBefore
          : isCorrect
            ? streakBefore + 1
            : 0

        return {
          ...player,
          lastCorrect: isCorrect,
          lastPoints: points,
          lastPoll: false,
          lastStreak: player.streak,
          lastStreakBonus: isCorrect && streakBefore > 0 && !question.practice,
          lastBonus: Boolean(question.bonus) && isCorrect && !question.practice,
          lastFirstCorrect: gotFirst,
          // Achievement intermediates (internal, stripped before the wire). A
          // scored question is one that counts toward streaks/points: non-poll,
          // non-practice. Practice answers never unlock anything.
          aScored: !question.practice,
          aIsCorrect: isCorrect,
          aBaseFactor: baseFactor,
          aStreakAfter: player.streak,
          aGotFirst: gotFirst,
          aResponseTimeMs: responseTimeMs,
          aPointsBefore: myPointsBefore,
          aPointsAfter: player.points,
        }
      })
      .sort((a, b) => b.points - a.points)

    // ── Achievements: compute per player AFTER points/streak are finalized ────
    // rankAfter = 1-based index in the just-sorted list (FULL list, not top-5).
    // underdog needs every player's before/after totals, so we resolve them from
    // the sorted rows. Counters (answered/correct/everCorrect) are updated here,
    // surviving across rounds via this.gameCounters (+ snapshot/restore).
    const achievementsByClient = new Map<string, string[]>()

    sortedPlayers.forEach((row, index) => {
      // Bots never earn achievements and must not mutate the persistent
      // gameCounters (per the sim-mode contract: bots are excluded from
      // counters and badges in live play). Short-circuit before any mutation.
      if (row.isBot) {
        return
      }

      const rankAfter = index + 1
      const unlocked: string[] = []

      // Only a SCORED answer (non-poll, non-practice) can unlock anything. Poll/
      // practice rows still get the persistent counters left untouched.
      if (row.aScored) {
        const counter = this.gameCounters.get(row.clientId) ?? {
          answered: 0,
          correct: 0,
          ever: false,
        }
        const answeredThisRound = this.answerReceivedAt.has(row.clientId)
        // Count this round into the persistent per-player totals.
        const everBefore = counter.ever
        const nextCounter = {
          answered: counter.answered + (answeredThisRound ? 1 : 0),
          correct: counter.correct + (row.aIsCorrect ? 1 : 0),
          ever: counter.ever || row.aIsCorrect,
        }
        this.gameCounters.set(row.clientId, nextCounter)

        const rt = row.aResponseTimeMs

        // Push a badge only when it is enabled in the merged config. A disabled
        // badge is never unlocked even if its condition holds. Every condition
        // reads its numeric threshold from the merged config (clamped to the
        // registry range); the fallback is the SHIPPED default, so an empty/
        // missing config reproduces the previous hardcoded behaviour exactly.
        const award = (id: AchievementId, condition: boolean): void => {
          if (condition && this.achievementEnabled(id)) {
            unlocked.push(id)
          }
        }

        // ── Bronze ────────────────────────────────────────────────────────────
        // first_correct: this player's FIRST EVER correct answer in the game.
        award("first_correct", row.aIsCorrect && !everBefore)

        // lucky_guess: correct AND answered in the last `lastPercent`% of the
        // window (default 5 → rt >= 95% of the window in ms).
        const luckyLastPercent = this.achievementThreshold("lucky_guess", 5)
        award(
          "lucky_guess",
          row.aIsCorrect &&
            rt !== null &&
            rt >= (1 - luckyLastPercent / 100) * question.time * 1000,
        )

        // participation: answered EVERY scored question. Awarded on the last
        // scored round once the running answered count reaches the scored total.
        award(
          "participation",
          isLastScoredRound &&
            totalScoredQuestions > 0 &&
            nextCounter.answered === totalScoredQuestions,
        )

        // ── Silver ────────────────────────────────────────────────────────────
        // speed_demon: correct in under `maxMs` (default 1000).
        const speedMaxMs = this.achievementThreshold("speed_demon", 1000)
        award("speed_demon", row.aIsCorrect && rt !== null && rt < speedMaxMs)

        // streak_3: streak hit exactly the configured value (default 3).
        award(
          "streak_3",
          row.aStreakAfter === this.achievementThreshold("streak_3", 3),
        )

        // sharpshooter: slider question, correct, accuracy > `minAccuracyPct`%
        // (default 95 → baseFactor > 0.95).
        const sharpMinPct = this.achievementThreshold("sharpshooter", 95)
        award(
          "sharpshooter",
          question.type === "slider" &&
            row.aIsCorrect &&
            row.aBaseFactor > sharpMinPct / 100,
        )

        // climber: moved up >= `minRanksUp` ranks vs the prior round (default 3,
        // skip round 1).
        const climberMinUp = this.achievementThreshold("climber", 3)
        const climbedBefore = hasPriorRound
          ? rankBefore.get(row.clientId)
          : undefined
        award(
          "climber",
          climbedBefore !== undefined &&
            climbedBefore - rankAfter >= climberMinUp,
        )

        // ── Gold ──────────────────────────────────────────────────────────────
        // first_responder: the round's first correct answer (by arrival order).
        award(
          "first_responder",
          firstCorrectId !== null && row.clientId === firstCorrectId,
        )

        // streak_5 + perfect_round both fire at their configured streak (both
        // default 5). Each reads its own threshold so the manager can split them.
        award(
          "streak_5",
          row.aStreakAfter === this.achievementThreshold("streak_5", 5),
        )
        award(
          "perfect_round",
          row.aStreakAfter === this.achievementThreshold("perfect_round", 5),
        )

        // underdog: beat someone who was > `minPointsAhead` pts ahead pre-round
        // (default 2000) and now sits below this player.
        const underdogMinAhead = this.achievementThreshold("underdog", 2000)
        award(
          "underdog",
          sortedPlayers.some(
            (other) =>
              other.clientId !== row.clientId &&
              other.aPointsBefore - row.aPointsBefore > underdogMinAhead &&
              row.aPointsAfter > other.aPointsAfter,
          ),
        )

        // ── Diamant ───────────────────────────────────────────────────────────
        // streak_10: streak hit exactly the configured value (default 10).
        award(
          "streak_10",
          row.aStreakAfter === this.achievementThreshold("streak_10", 10),
        )

        // speedy_gonzales: correct in under `maxMs` (default 400).
        const speedyMaxMs = this.achievementThreshold("speedy_gonzales", 400)
        award(
          "speedy_gonzales",
          row.aIsCorrect && rt !== null && rt < speedyMaxMs,
        )

        // perfect_game: 100% correct over all scored questions (last scored round).
        award(
          "perfect_game",
          isLastScoredRound &&
            totalScoredQuestions > 0 &&
            nextCounter.correct === totalScoredQuestions,
        )
      }

      if (unlocked.length > 0) {
        // Defensive cap: never emit an unbounded list (≤ 20 per the spec).
        achievementsByClient.set(row.clientId, unlocked.slice(0, 20))
      }

      // ── RECAP accumulator (WP-A) ────────────────────────────────────────────
      // Fold THIS round's already-computed per-player fields into the persistent
      // scalar accumulator (bots are excluded — they returned at the top). Only a
      // SCORED row contributes to correctness/streak/timing/achievements; poll &
      // practice rows leave those untouched (mirrors gameCounters above).
      const recap = this.recapStats.get(row.clientId) ?? {
        username: row.username,
        fastestMs: null as number | null,
        peakStreak: 0,
        correct: 0,
        wrong: 0,
        answered: 0,
        bestClimb: 0,
        worstRankEver: index + 1,
        achievementCount: 0,
        achievementIds: [] as string[],
        luckyGuess: false,
      }
      // Keep the freshest display name (a player can rename mid-game).
      recap.username = row.username

      if (row.aScored) {
        const answeredThisRound = this.answerReceivedAt.has(row.clientId)
        const rt = row.aResponseTimeMs

        if (answeredThisRound) {
          recap.answered += 1
          if (rt !== null) {
            recap.fastestMs =
              recap.fastestMs === null ? rt : Math.min(recap.fastestMs, rt)
          }
        }

        if (row.aIsCorrect) {
          recap.correct += 1
        } else if (answeredThisRound) {
          // wrong = an actual incorrect submission (a no-show is neither).
          recap.wrong += 1
        }

        recap.peakStreak = Math.max(recap.peakStreak, row.aStreakAfter)

        // bestClimb: largest single-round upward rank move (only meaningful once
        // a prior round exists; rankBefore is empty on round 1 → no climb).
        const climbedFrom = hasPriorRound
          ? rankBefore.get(row.clientId)
          : undefined
        if (climbedFrom !== undefined) {
          recap.bestClimb = Math.max(recap.bestClimb, climbedFrom - rankAfter)
        }

        // worstRankEver: the lowest (highest-numbered) rank this player ever
        // held, tracked across rounds so comeback_kid can measure climb from the
        // nadir.
        recap.worstRankEver = Math.max(recap.worstRankEver, index + 1)

        // luckyGuess: a correct answer that landed in the last ~10% of the timer.
        if (row.aIsCorrect && rt !== null && rt >= 0.9 * question.time * 1000) {
          recap.luckyGuess = true
        }

        // Per-question correctness tally for hardest_question (non-bot only).
        const q = this.questionStats.get(this.currentQuestion) ?? {
          correct: 0,
          total: 0,
        }
        q.total += answeredThisRound ? 1 : 0
        q.correct += row.aIsCorrect ? 1 : 0
        this.questionStats.set(this.currentQuestion, q)
      }

      // Union the badges unlocked THIS round into the full-game set (capped) —
      // BEFORE achievements are stripped from the player below.
      if (unlocked.length > 0) {
        for (const id of unlocked) {
          if (!recap.achievementIds.includes(id)) {
            recap.achievementIds.push(id)
          }
        }
        recap.achievementCount += unlocked.length
        if (recap.achievementIds.length > 50) {
          recap.achievementIds = recap.achievementIds.slice(0, 50)
        }
      }

      this.recapStats.set(row.clientId, recap)
    })

    // ── Achievements: award configurable BONUS POINTS (Wave B) ────────────────
    // Second pass over the scored rows: sum each client's per-badge bonus over
    // the ids it just unlocked. When the sum > 0 we (1) add it to the LIVE player
    // object's `points` so any subsequent read of the roster stays consistent,
    // (2) fold it into the row's `points` + `lastPoints` so the SHOW_RESULT
    // payload (myPoints / +points) and the round leaderboard reflect the bonus,
    // and (3) record it in bonusByClient for the per-player SHOW_RESULT field.
    // Default bonus is 0 (registry holds no per-id bonus), so a config without
    // any bonus override leaves scoring byte-identical to the shipped behaviour.
    const bonusByClient = new Map<string, number>()

    for (const row of sortedPlayers) {
      // Bots never earn achievements (and so never any bonus) — skip entirely.
      if (row.isBot) {
        continue
      }

      const unlocked = achievementsByClient.get(row.clientId)

      if (!unlocked || unlocked.length === 0) {
        continue
      }

      const bonus = unlocked.reduce(
        (sum, id) => sum + this.achievementBonus(id as AchievementId),
        0,
      )

      if (bonus > 0) {
        // (1) LIVE player object — find by durable clientId among the players
        // whose `points` was just mutated in the scoring map above.
        const livePlayer = currentPlayers.find(
          (p) => p.clientId === row.clientId,
        )

        if (livePlayer) {
          livePlayer.points += bonus
        }

        // (2) Row totals feeding SHOW_RESULT + the round leaderboard.
        row.points += bonus
        row.lastPoints += bonus

        // (3) Per-player bonus, surfaced as SHOW_RESULT.bonusPoints when > 0.
        bonusByClient.set(row.clientId, bonus)
      }
    }

    // RE-SORT after folding the bonus in so rank / aheadOf reflect the new totals.
    sortedPlayers.sort((a, b) => b.points - a.points)

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

    this.opts.players.replace(cleanedSorted)

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
    const roundRecap = this.computeRoundRecap(
      sortedPlayers.map((row) => ({
        clientId: row.clientId,
        username: row.username,
        avatar: row.avatar,
        isBot: row.isBot,
        aIsCorrect: row.aIsCorrect,
        aResponseTimeMs: row.aResponseTimeMs,
        aStreakAfter: row.aStreakAfter,
        lastPoints: row.lastPoints,
        answeredThisRound: this.answerReceivedAt.has(row.clientId),
      })),
      rankAfterByClient,
      rankBefore,
      achievementsByClient,
      firstCorrectId,
      hasPriorRound,
    )

    this.lastResultPayloads.clear()

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
        ...(unlocked ? { achievements: unlocked } : {}),
        ...(bonusPoints > 0 ? { bonusPoints } : {}),
        ...(roundRecap.length > 0 ? { roundRecap } : {}),
      }

      // Cache WITHOUT autoAdvanceMs; emitResultCountdown adds the live remaining
      // time on a mid-screen re-send so a late toggle gets an accurate value.
      this.lastResultPayloads.set(player.id, resultPayload)

      this.send(player.id, STATUS.SHOW_RESULT, {
        ...resultPayload,
        ...(this.autoMode
          ? { autoAdvanceMs: RoundManager.AUTO_RESULT_MS }
          : {}),
      })
    })

    // The post-results screen is now on display: a subsequent setAutoMode(true)
    // (FIX 8) arms the advance for THIS screen. Cleared once we leave it.
    this.resultScreenActive = true

    const guesses = this.playersAnswers.map((a) => a.answerId)
    const averageGuess =
      question.type === "slider" && guesses.length
        ? Math.round(guesses.reduce((s, v) => s + v, 0) / guesses.length)
        : undefined

    this.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
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
      // Per-round recap awards — same highlights the phone shows on SHOW_RESULT
      // — so the presenter/projector displays them at result-reveal time too.
      // Read from the local `roundRecap` const (computed above); safe to read
      // here, well before tempRoundRecap is cleared after SHOW_LEADERBOARD.
      ...(roundRecap.length > 0 ? { roundRecap } : {}),
    })

    this.questionsHistory.push({
      ...question,
      playerAnswers: currentPlayers.map((player) => {
        const playerAnswer = this.playersAnswers.find(
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
        }
      }),
    })

    // Use the cleaned rows (avatar/achievements preserved, internal aXxx fields
    // dropped) as the round leaderboard so the between-questions SHOW_LEADERBOARD
    // rows carry `avatar` (bug #4 fix) without leaking achievement intermediates.
    this.leaderboard = cleanedSorted
    this.tempOldLeaderboard = oldLeaderboard
    this.tempRoundRecap = roundRecap
    this.roundRecapShown = false
    this.playersAnswers = []

    // Low-latency mode: the question is over — drop any pending throttled count
    // and close the answer window so a late tap is rejected as `too_late`.
    this.answerCountThrottle.cancel()
    this.answerDeadlineAtServerMs = 0

    if (this.autoMode) {
      this.scheduleAuto()
    }
  }

  selectAnswer(
    socket: Socket,
    answerId: number | number[],
    clientMessageId?: string,
    answerText?: string,
  ): void {
    if (this.paused) {
      return
    }

    // SERVER receive timestamp — the only clock trusted for scoring. Captured
    // first thing so the value is unaffected by anything below it.
    const serverReceivedAtMs = Date.now()

    // Resolve + key answers by the durable clientId (not the volatile socket.id)
    // so a tap re-sent after a wifi blip + reconnect is matched, not lost.
    const clientId = socket.handshake.auth.clientId as string
    const player = this.opts.players.findByClientId(clientId)
    const question = this.opts.quizz.questions[this.currentQuestion]

    if (!player) {
      // No durable session for this socket — reject (only acked in LL mode).
      this.rejectAnswer(
        socket,
        "invalid_question",
        serverReceivedAtMs,
        clientMessageId,
      )

      return
    }

    if (!question) {
      this.rejectAnswer(
        socket,
        "invalid_question",
        serverReceivedAtMs,
        clientMessageId,
      )

      return
    }

    // Per-question-type payload guards (ANTI-CHEAT — reject mismatched shapes a
    // hostile client could craft to bypass the answer UI). These reject silently
    // (LL mode acks via rejectAnswer; normal mode is a no-op, like every other
    // pre-accept reject here):
    //   - multiple-select MUST carry an array of keys; a scalar is malformed.
    //   - any non-multiple-select type MUST NOT carry an array (a scalar-only
    //     type can't be smuggled an index set).
    //   - type-answer MUST carry non-empty trimmed text (an empty string would
    //     otherwise score as a (failing) answer; reject it so it can't occupy
    //     the player's one slot or pollute the histogram).
    const isMultiSelect = question.type === "multiple-select"
    const isTextAnswer = question.type === "type-answer"
    const trimmedText = answerText?.trim() ?? ""

    if (isMultiSelect && !Array.isArray(answerId)) {
      this.rejectAnswer(
        socket,
        "invalid_question",
        serverReceivedAtMs,
        clientMessageId,
      )

      return
    }

    if (!isMultiSelect && Array.isArray(answerId)) {
      this.rejectAnswer(
        socket,
        "invalid_question",
        serverReceivedAtMs,
        clientMessageId,
      )

      return
    }

    if (isTextAnswer && !trimmedText) {
      this.rejectAnswer(
        socket,
        "invalid_question",
        serverReceivedAtMs,
        clientMessageId,
      )

      return
    }

    // Idempotent within the question: a retry for the same clientId is a no-op.
    // In LL mode we additionally dedup by the per-tap clientMessageId so a
    // socket.io auto-retry of the *same* tap is caught even before the player
    // record check (and is acked as `duplicate` rather than silently dropped).
    const alreadyAnswered = Boolean(
      this.playersAnswers.find((a) => a.clientId === clientId),
    )
    const duplicateMessageId =
      this.ll.enabled &&
      clientMessageId !== undefined &&
      this.seenMessageIds.has(clientMessageId)

    if (alreadyAnswered || duplicateMessageId) {
      this.rejectAnswer(
        socket,
        "duplicate",
        serverReceivedAtMs,
        clientMessageId,
      )

      return
    }

    // Low-latency mode: reject answers that arrived after the server-side
    // deadline (with an optional, clamped, server-side compensation window so a
    // tap that left in time but landed slightly late still counts). Scoring is
    // NEVER derived from a client-supplied timestamp — only this server clock.
    if (this.ll.enabled && this.answerDeadlineAtServerMs > 0) {
      const compensation = Math.max(
        0,
        Math.min(this.ll.maxLatencyCompensationMs, MAX_LATENCY_COMPENSATION_MS),
      )

      if (serverReceivedAtMs > this.answerDeadlineAtServerMs + compensation) {
        this.rejectAnswer(
          socket,
          "too_late",
          serverReceivedAtMs,
          clientMessageId,
        )

        return
      }
    }

    // Accept: score strictly from the server clock (startTime captured at
    // question start). timeToPoint uses Date.now() internally, matching today.
    this.playersAnswers.push({
      // The Answer `clientId` holds the durable clientId (not the volatile
      // socket.id) so reconnects still match the right answer.
      clientId,
      // Multiple-select / type-answer store a -1 sentinel in answerId and carry
      // their real payload in answerIds / answerText respectively (the guards
      // above already proved the shapes match the question type). dedupe the
      // multi-select keys so a client can't pad the histogram with repeats.
      answerId: isMultiSelect || isTextAnswer ? -1 : (answerId as number),
      answerIds: isMultiSelect ? [...new Set(answerId as number[])] : undefined,
      answerText: isTextAnswer ? answerText : undefined,
      points: timeToPoint(this.startTime, question.time),
    })

    // Achievements (ALL modes): stamp the server receive time so showResults can
    // derive responseTimeMs for the timing badges. Independent of LL mode's
    // answerMeta (which only exists when LL is enabled).
    this.answerReceivedAt.set(clientId, serverReceivedAtMs)

    if (this.ll.enabled) {
      this.answerMeta.set(clientId, { serverReceivedAtMs, clientMessageId })

      if (clientMessageId !== undefined) {
        this.seenMessageIds.add(clientMessageId)
      }

      this.emitAck(socket, {
        accepted: true,
        reason: "ok",
        serverReceivedAtMs,
        clientMessageId,
      })
    }

    this.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
    })

    // The live answered-count is "chatter": throttled in LL mode, immediate
    // otherwise. It is NEVER a game-state transition, so throttling it is safe.
    if (this.ll.enabled) {
      this.answerCountThrottle.push(this.playersAnswers.length)
    } else {
      socket
        .to(this.opts.gameId)
        .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    }

    if (this.playersAnswers.length === this.opts.players.count()) {
      // All in — flush any pending throttled count so the manager sees the
      // final number immediately, then end the question.
      this.answerCountThrottle.cancel()
      // Sim mode (CRITICAL): close the window + cancel pending bot timers HERE,
      // not only in showResults. cooldown.abort() only resolves on the next ~1s
      // interval tick (cooldown-timer.ts), so cancelling solely in showResults
      // leaves a ~1s gap where a late bot timer could fire into the next Q.
      this.answerWindowOpen = false
      this.opts.onAnswerWindowClose?.()
      this.opts.cooldown.abort()
    }
  }

  // Emit an answer ack (LL mode only) and record reject metrics. A rejected
  // answer in normal mode is a silent no-op exactly as before.
  private rejectAnswer(
    socket: Socket,
    reason: AnswerAckReason,
    serverReceivedAtMs: number,
    clientMessageId?: string,
  ): void {
    if (!this.ll.enabled) {
      return
    }

    metrics.recordRejected(this.opts.gameId, reason)
    this.emitAck(socket, {
      accepted: false,
      reason,
      serverReceivedAtMs,
      clientMessageId,
    })
  }

  private emitAck(socket: Socket, ack: AnswerAck): void {
    if (!this.ll.enabled || !this.ll.answerAck) {
      return
    }

    socket.emit(EVENTS.PLAYER.ANSWER_ACK, ack)
  }

  // Low-latency mode reconnect helper: did this clientId already answer the
  // current (in-flight) question? Used to render "answered" on resume instead
  // of re-enabling the buttons. Always false / harmless in normal mode.
  hasAnswered(clientId: string): boolean {
    return Boolean(this.playersAnswers.find((a) => a.clientId === clientId))
  }

  nextQuestion(socket: Socket): void {
    if (this.paused) {
      return
    }

    if (!this.started) {
      return
    }

    if (socket.id !== this.opts.getManagerId()) {
      return
    }

    if (!this.opts.quizz.questions[this.currentQuestion + 1]) {
      return
    }

    this.currentQuestion += 1
    void this.newQuestion()
  }

  abortQuestion(socket: Socket): void {
    if (!this.started) {
      return
    }

    if (socket.id !== this.opts.getManagerId()) {
      return
    }

    // Sim mode: window closing on a manager abort — cancel pending bot timers.
    this.answerWindowOpen = false
    this.opts.onAnswerWindowClose?.()
    this.opts.cooldown.abort()
  }

  // ── Host live controls (#12) ──────────────────────────────────────
  // Manager skips the live question early: end the answer window NOW and let the
  // cooldown resolve so newQuestion()'s awaited cooldown.start() falls through to
  // showResults() — i.e. proceed exactly as if the timer had elapsed. This is the
  // same server action as a force-reveal (revealAnswer below delegates here), and
  // mirrors abortQuestion's window-close + cooldown.abort sequence. Ownership-
  // guarded like nextQuestion/abortQuestion.
  skipQuestion(socket: Socket): void {
    if (!this.started) {
      return
    }

    if (socket.id !== this.opts.getManagerId()) {
      return
    }

    // No live answer window (e.g. pre-game START_COOLDOWN intro) — nothing to skip.
    if (!this.answerWindowOpen) {
      return
    }

    // Sim mode: window closing — cancel pending bot timers (no late-bot race).
    this.answerWindowOpen = false
    this.opts.onAnswerWindowClose?.()
    this.opts.cooldown.abort()
  }

  // Manager force-reveals the answer while the question is live. Semantically the
  // same as skipping (end early → showResults discloses the solution), so reuse
  // the abort/reveal path rather than duplicate the window-close logic.
  revealAnswer(socket: Socket): void {
    this.skipQuestion(socket)
  }

  // Manager extends (+) or shortens (-) the running countdown by deltaSeconds.
  // Ownership-guarded; ignored while paused or when no countdown is active. Shifts
  // the cooldown's remaining time (which re-emits the new value to the room) and,
  // in low-latency mode, the server-authoritative answer deadline so the too_late
  // check stays consistent with the new window. A no-op when there is no live
  // countdown (e.g. on the leaderboard).
  adjustTimer(socket: Socket, deltaSeconds: number): void {
    if (!this.started || this.paused) {
      return
    }

    if (socket.id !== this.opts.getManagerId()) {
      return
    }

    if (!this.answerWindowOpen || !this.opts.cooldown.isActive()) {
      return
    }

    this.opts.cooldown.adjust(deltaSeconds)

    // Low-latency mode: keep the server-side deadline in lock-step with the
    // adjusted window so a late answer is accepted/rejected against the new time.
    // Floored at the question start so a large shorten can't move it into the past
    // before the question began. Untouched in normal mode (deadline stays 0).
    if (this.ll.enabled && this.answerDeadlineAtServerMs > 0) {
      this.answerDeadlineAtServerMs = Math.max(
        this.startTime,
        this.answerDeadlineAtServerMs + deltaSeconds * 1000,
      )
    }
  }

  // Sim mode: is the SELECT_ANSWER window currently open? Game.addBots refuses to
  // add bots mid-window (no remaining-time race into the next question).
  isAnswerWindowOpen(): boolean {
    return this.answerWindowOpen
  }

  // ── Teams ──────────────────────────────────────────────────────────────────
  // Assign a player to one of the fixed teams. No-op when team mode is off or the
  // teamId is not a valid TEAMS member (anti-tamper). Re-broadcasts the player so
  // the host roster + lobby reflect the choice. Returns the updated player (or
  // undefined when nothing changed) so the caller can decide whether to emit.
  selectTeam(clientId: string, teamId: string): Player | undefined {
    if (!this.opts.teamMode) {
      return undefined
    }

    if (!(TEAMS as readonly string[]).includes(teamId)) {
      return undefined
    }

    const player = this.opts.players.findByClientId(clientId)

    if (!player) {
      return undefined
    }

    player.teamId = teamId

    return player
  }

  // Aggregate team points = SUM of member `points`, with member counts, sorted by
  // points desc. Returns undefined when team mode is off (so the optional payload
  // field stays absent in normal mode). Only players WITH a teamId contribute —
  // bots never have one, so they are naturally excluded.
  private computeTeamStandings(): TeamStanding[] | undefined {
    if (!this.opts.teamMode) {
      return undefined
    }

    const byTeam = new Map<string, { points: number; playerCount: number }>()

    for (const player of this.opts.players.getAll()) {
      const teamId = player.teamId

      if (!teamId || !(TEAMS as readonly string[]).includes(teamId)) {
        continue
      }

      const entry = byTeam.get(teamId) ?? { points: 0, playerCount: 0 }
      entry.points += player.points
      entry.playerCount += 1
      byTeam.set(teamId, entry)
    }

    return [...byTeam.entries()]
      .map(([teamId, { points, playerCount }]) => ({
        teamId,
        points,
        playerCount,
      }))
      .sort((a, b) => b.points - a.points)
  }

  // ── Post-game recap / awards derivation (WP-A) ────────────────────────────
  // Reduce the per-player recap accumulator into the manager-side superlatives
  // list + per-player recap cards. Pure read of recapStats/questionStats — call
  // ONCE at game end. Returns the manager payload, a per-clientId player payload
  // map, and a per-clientId map of the single superlative that player won (for
  // the phone highlight). Bots are already absent from recapStats.
  private buildRecap(finalRanks: Map<string, number>): {
    manager: ManagerRecap
    perPlayer: Map<string, PlayerRecap>
  } {
    const entries = [...this.recapStats.entries()]
    // clientId -> avatar lookup for superlative winner cards. The cleaned round
    // leaderboard rows carry avatar (bug #4 fix); recapStats does not, so we map
    // it here once and attach it to each award below.
    const avatarByClient = new Map<string, string | undefined>()
    for (const p of this.leaderboard) {
      avatarByClient.set(p.clientId, p.avatar)
    }

    // argmax/argmin helpers over the non-bot entries. A superlative is only
    // produced when at least one entry qualifies (predicate true) AND the best
    // value clears the floor (e.g. nobody climbed → no biggest_climber).
    const award = (
      key: SuperlativeKey,
      pick: (stat: (typeof entries)[number][1]) => number | null,
      better: (a: number, b: number) => boolean,
      floor?: (value: number) => boolean,
    ): { clientId: string; superlative: Superlative } | null => {
      let bestId: string | null = null
      let bestVal = 0
      let bestName = ""
      for (const [clientId, stat] of entries) {
        const v = pick(stat)
        if (v === null) {
          continue
        }
        if (bestId === null || better(v, bestVal)) {
          bestId = clientId
          bestVal = v
          bestName = stat.username
        }
      }
      if (bestId === null) {
        return null
      }
      if (floor && !floor(bestVal)) {
        return null
      }
      return {
        clientId: bestId,
        superlative: {
          key,
          winnerName: bestName,
          winnerAvatar: avatarByClient.get(bestId),
          value: bestVal,
        },
      }
    }

    const max = (a: number, b: number): boolean => a > b
    const min = (a: number, b: number): boolean => a < b

    const winners: Array<{
      clientId: string
      superlative: Superlative
    } | null> = [
      // fastest_finger: lowest single-answer time (only players who answered).
      award("fastest_finger", (s) => s.fastestMs, min),
      // most_correct: highest correct count (skip if nobody got any right).
      award(
        "most_correct",
        (s) => s.correct,
        max,
        (v) => v > 0,
      ),
      // most_wrong (playful): highest wrong count (skip if nobody was wrong).
      award(
        "most_wrong",
        (s) => s.wrong,
        max,
        (v) => v > 0,
      ),
      // longest_streak: highest peak streak (skip if nobody built one).
      award(
        "longest_streak",
        (s) => s.peakStreak,
        max,
        (v) => v > 0,
      ),
      // biggest_climber: largest single-round upward rank move.
      award(
        "biggest_climber",
        (s) => s.bestClimb,
        max,
        (v) => v > 0,
      ),
      // lucky_guesser: a player who landed a correct answer in the last ~10%.
      award(
        "lucky_guesser",
        (s) => (s.luckyGuess ? s.correct : null),
        max,
        (v) => v > 0,
      ),
      // most_achievements: highest full-game badge count (skip if zero).
      award(
        "most_achievements",
        (s) => s.achievementIds.length,
        max,
        (v) => v > 0,
      ),
    ]

    const superlatives: Superlative[] = []
    const highlightByClient = new Map<
      string,
      { key: SuperlativeKey; value: number }
    >()

    for (const w of winners) {
      if (!w) {
        continue
      }
      superlatives.push(w.superlative)
      // First award a player wins becomes their phone highlight (one card).
      if (!highlightByClient.has(w.clientId)) {
        highlightByClient.set(w.clientId, {
          key: w.superlative.key,
          value: w.superlative.value,
        })
      }
    }

    // comeback_kid: argmax of (worstRankEver - finalRank) — how far a player
    // climbed from their lowest-ever rank to their final standing. Distinct from
    // biggest_climber (largest single-ROUND jump). Needs finalRanks, so it can't
    // use the generic award() helper. Skip if nobody net-improved.
    let comeback: { clientId: string; superlative: Superlative } | null = null
    let bestComeback = 0
    for (const [clientId, stat] of entries) {
      const finalRank = finalRanks.get(clientId)
      if (finalRank === undefined) {
        continue
      }
      const climb = stat.worstRankEver - finalRank
      if (comeback === null || climb > bestComeback) {
        comeback = {
          clientId,
          superlative: {
            key: "comeback_kid",
            winnerName: stat.username,
            winnerAvatar: avatarByClient.get(clientId),
            value: climb,
          },
        }
        bestComeback = climb
      }
    }
    if (comeback !== null && bestComeback > 0) {
      superlatives.push(comeback.superlative)
      if (!highlightByClient.has(comeback.clientId)) {
        highlightByClient.set(comeback.clientId, {
          key: comeback.superlative.key,
          value: comeback.superlative.value,
        })
      }
    }

    // hardest_question: the SCORED question with the lowest correct% (>=1 answer).
    // Quiz-level award — winnerName is the human 1-based question label.
    let hardest: { questionIndex: number; correctPct: number } | undefined
    for (const [index, q] of this.questionStats) {
      if (q.total <= 0) {
        continue
      }
      const pct = Math.round((q.correct / q.total) * 100)
      if (hardest === undefined || pct < hardest.correctPct) {
        hardest = { questionIndex: index, correctPct: pct }
      }
    }
    if (hardest !== undefined) {
      superlatives.push({
        key: "hardest_question",
        winnerName: `#${hardest.questionIndex + 1}`,
        value: hardest.correctPct,
      })
    }

    const manager: ManagerRecap = {
      superlatives,
      ...(hardest !== undefined ? { hardestQuestion: hardest } : {}),
    }

    // Per-player recap cards.
    const perPlayer = new Map<string, PlayerRecap>()
    for (const [clientId, stat] of entries) {
      const answered = stat.answered
      const accuracyPct =
        answered > 0 ? Math.round((stat.correct / answered) * 100) : 0
      const myRecap: PlayerRecap["myRecap"] = {
        rank: finalRanks.get(clientId) ?? 0,
        accuracyPct,
        correct: stat.correct,
        wrong: stat.wrong,
        fastestMs: stat.fastestMs,
        peakStreak: stat.peakStreak,
        achievements: [...stat.achievementIds],
      }
      const highlight = highlightByClient.get(clientId)
      perPlayer.set(clientId, {
        myRecap,
        ...(highlight ? { highlight } : {}),
      })
    }

    return { manager, perPlayer }
  }

  // Manager-only interstitial: the per-round recap highlights get their OWN
  // full-screen page (reusing RecapSequence) BEFORE the leaderboard, instead of
  // cramping the answer-reveal screen. Players are unaffected (they keep their
  // inline recap on SHOW_RESULT). Only reached when tempRoundRecap is non-empty.
  // Does NOT clear tempRoundRecap — showLeaderboard() still reads it for the
  // SHOW_LEADERBOARD payload and clears it there.
  showRoundRecap(): void {
    // Leaving the post-results screen — drop its FIX 8/9 bookkeeping so a late
    // setAutoMode(true) can't re-arm / re-send a screen that is gone.
    this.resultScreenActive = false
    this.lastResultPayloads.clear()
    this.roundRecapShown = true
    this.send(this.opts.getManagerId(), STATUS.SHOW_ROUND_RECAP, {
      roundRecap: this.tempRoundRecap ?? [],
    })
  }

  showLeaderboard(): void {
    // First hop off the answer-reveal screen: divert to the per-round recap
    // screen (its OWN full-screen page) when there is a non-empty recap that
    // has not been shown yet. NOT on the last round — that goes straight to
    // FINISHED / Podium, which owns the end-of-game recap.
    const isLastRoundForRecap =
      this.currentQuestion + 1 === this.opts.quizz.questions.length
    if (
      !isLastRoundForRecap &&
      !this.roundRecapShown &&
      this.tempRoundRecap &&
      this.tempRoundRecap.length > 0
    ) {
      this.showRoundRecap()
      return
    }

    // We are leaving the post-results screen: drop its FIX 8/9 bookkeeping so a
    // late setAutoMode(true) can't re-arm / re-send a screen that is gone.
    this.resultScreenActive = false
    this.lastResultPayloads.clear()

    const isLastRound =
      this.currentQuestion + 1 === this.opts.quizz.questions.length

    if (isLastRound) {
      this.started = false

      // Attach FULL-GAME achievements onto the podium slice so the FINISHED
      // top[] can render medals. We STOP stripping achievements here: read each
      // top player's accumulated full-game badge set from recapStats (bots carry
      // none). Back-compat: players without an entry simply get no achievements.
      const top = this.leaderboard.slice(0, 3).map((p) => {
        const stat = this.recapStats.get(p.clientId)
        return stat && stat.achievementIds.length > 0
          ? { ...p, achievements: [...stat.achievementIds] }
          : { ...p }
      })

      // Final human ranks (1..N) keyed by clientId — matches the per-player emit
      // index+1 below and feeds each myRecap.rank.
      const finalRanks = new Map<string, number>()
      this.leaderboard
        .filter((p) => !p.isBot)
        .forEach((p, index) => {
          finalRanks.set(p.clientId, index + 1)
        })

      // Derive the recap ONCE (manager superlatives + per-player cards).
      const { manager: managerRecap, perPlayer: playerRecaps } =
        this.buildRecap(finalRanks)

      // Sim mode: the PERSISTED result must never carry bots (they would pollute
      // the real results archive / history UI). Mirror toSnapshot's filter here —
      // this saved-result path is independent of toSnapshot and reads the live
      // unfiltered arrays. Rank is computed over humans only (1..N). The live
      // FINISHED `top` display is intentionally left unfiltered (bots stay
      // visible during play, per the feature contract).
      const botUsernames = new Set(
        this.leaderboard.filter((p) => p.isBot).map((p) => p.username),
      )

      this.opts.onGameFinished({
        id: `${Date.now()}-${nanoid(8)}`,
        subject: this.opts.quizz.subject,
        date: new Date().toISOString(),
        players: this.leaderboard
          .filter((p) => !p.isBot)
          .map((player, index) => ({
            username: player.username,
            points: player.points,
            rank: index + 1,
          })),
        questions: this.questionsHistory.map((q) => ({
          ...q,
          playerAnswers: q.playerAnswers.filter(
            (a) => !botUsernames.has(a.playerName),
          ),
        })),
        // Persist the manager recap so the public share page can replay the
        // superlative reveal before the podium. Only when there are awards.
        ...(managerRecap && managerRecap.superlatives.length > 0
          ? { recap: managerRecap }
          : {}),
      })

      // Team mode: final team standings (undefined when team mode is off, so the
      // optional payload field is simply absent in normal mode).
      const finalTeamStandings = this.computeTeamStandings()

      this.send(this.opts.getManagerId(), STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
        ...(finalTeamStandings ? { teamStandings: finalTeamStandings } : {}),
        // MANAGER recap: the full awards list + hardest-question callout.
        recap: managerRecap,
        // Echo the auto-mode flag so the end-game screen knows the host advanced
        // automatically (client display-only; old clients ignore it).
        autoMode: this.autoMode,
      })

      this.leaderboard.forEach((player, index) => {
        // Bots have no real socket — emitting to a `bot:<id>` target would
        // pollute playerStatus + push to a nonexistent room. Skip the emit; the
        // index still advances so each human keeps its live (unfiltered)
        // `index + 1` rank, unchanged from before.
        if (player.isBot) {
          return
        }
        // PER-PLAYER recap: this player's own card + the single award they won
        // (if any). Bots carry no recap entry, so this is simply absent for them.
        const myPlayerRecap = this.recapStats.has(player.clientId)
          ? playerRecaps.get(player.clientId)
          : undefined
        this.send(player.id, STATUS.FINISHED, {
          subject: this.opts.quizz.subject,
          top,
          rank: index + 1,
          ...(finalTeamStandings ? { teamStandings: finalTeamStandings } : {}),
          ...(myPlayerRecap ? { recap: myPlayerRecap } : {}),
        })
      })

      return
    }

    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard
    // Team mode: between-questions team standings (undefined when off → absent).
    const teamStandings = this.computeTeamStandings()

    this.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
      ...(teamStandings ? { teamStandings } : {}),
      // FIX 9: in auto-mode the leaderboard auto-advances to the next question
      // after AUTO_LEADERBOARD_MS — carry it so the client can render a local
      // countdown. Absent in manual mode (old clients ignore it).
      ...(this.autoMode
        ? { autoAdvanceMs: RoundManager.AUTO_LEADERBOARD_MS }
        : {}),
      ...(this.tempRoundRecap && this.tempRoundRecap.length > 0
        ? { roundRecap: this.tempRoundRecap }
        : {}),
    })

    this.tempOldLeaderboard = null
    this.tempRoundRecap = null
  }
}
