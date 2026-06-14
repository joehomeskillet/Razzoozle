// oxlint-disable typescript/no-unnecessary-condition
import {
  EVENTS,
  FIRST_CORRECT_BONUS,
  MAX_LATENCY_COMPENSATION_MS,
  MEDIA_TYPES,
  SLIDER_TOLERANCE_FRACTION,
  STREAK_CAP,
  STREAK_STEP,
} from "@razzia/common/constants"
import type {
  Answer,
  GameResult,
  Player,
  Question,
  QuestionResult,
  Quizz,
} from "@razzia/common/types/game"
import type {
  AnswerAck,
  AnswerAckReason,
  Server,
  Socket,
} from "@razzia/common/types/game/socket"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type { LowLatencyMode } from "@razzia/common/validators/game-config"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { ScoreboardThrottle } from "@razzia/socket/services/game/scoreboard-throttle"
import {
  matchAnswer,
  normalizeText,
} from "@razzia/socket/services/game/text-match"
import { metrics } from "@razzia/socket/services/metrics"
import { timeToPoint } from "@razzia/socket/utils/game"
import sleep from "@razzia/socket/utils/sleep"
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
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private started = false
  private currentQuestion = 0
  private playersAnswers: Answer[] = []
  private startTime = 0
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private questionsHistory: QuestionResult[] = []
  private autoMode = false
  private autoTimer: ReturnType<typeof setTimeout> | null = null
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

  constructor(opts: RoundManagerOptions) {
    this.opts = opts
    this.ll = opts.lowLatency

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
    if (this.paused) {
      return
    }

    this.autoMode = on

    if (!on) {
      this.clearAuto()
    }
  }

  private clearAuto(): void {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer)
      this.autoTimer = null
    }
  }

  // Auto mode: after results, advance to leaderboard then the next question
  // automatically (with pauses), so the host doesn't click through every round.
  private scheduleAuto(): void {
    this.clearAuto()
    const AUTO_RESULT_MS = 6000
    const AUTO_LEADERBOARD_MS = 5000

    this.autoTimer = setTimeout(() => {
      if (!this.started || !this.autoMode) {
        return
      }

      this.showLeaderboard()

      if (!this.started) {
        return
      }

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

  private broadcast<T extends Status>(
    status: T,
    data: StatusDataMap[T],
  ): void {
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

    // Clear any timers/maps so a restored game starts from a clean slate.
    this.clearAuto()
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
      // Display-only attribution; undefined for non-submitted questions. Carries
      // NO correct-answer data — solutions stay server-side (anti-cheat).
      submittedBy: question.submittedBy,
    })

    await sleep(question.cooldown)

    if (!this.started) {
      return
    }

    this.startTime = Date.now()

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

        // Poll: opinion vote — neutral, no points, streak untouched.
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
        }
      })
      .sort((a, b) => b.points - a.points)

    this.opts.players.replace(sortedPlayers)

    sortedPlayers.forEach((player, index) => {
      const rank = index + 1
      const aheadPlayer = sortedPlayers[index - 1]

      this.send(player.id, STATUS.SHOW_RESULT, {
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
      })
    })

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

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard = oldLeaderboard
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
      answerIds: isMultiSelect
        ? [...new Set(answerId as number[])]
        : undefined,
      answerText: isTextAnswer ? answerText : undefined,
      points: timeToPoint(this.startTime, question.time),
    })

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

  // Sim mode: is the SELECT_ANSWER window currently open? Game.addBots refuses to
  // add bots mid-window (no remaining-time race into the next question).
  isAnswerWindowOpen(): boolean {
    return this.answerWindowOpen
  }

  showLeaderboard(): void {
    const isLastRound =
      this.currentQuestion + 1 === this.opts.quizz.questions.length

    if (isLastRound) {
      this.started = false

      const top = this.leaderboard.slice(0, 3)

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
      })

      this.send(this.opts.getManagerId(), STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
      })

      this.leaderboard.forEach((player, index) => {
        this.send(player.id, STATUS.FINISHED, {
          subject: this.opts.quizz.subject,
          top,
          rank: index + 1,
        })
      })

      return
    }

    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
  }
}
