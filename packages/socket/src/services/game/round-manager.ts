// oxlint-disable typescript/no-unnecessary-condition
import { EVENTS, MEDIA_TYPES } from "@razzia/common/constants"
import type {
  Answer,
  GameResult,
  Player,
  Question,
  QuestionResult,
  Quizz,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { timeToPoint } from "@razzia/socket/utils/game"
import sleep from "@razzia/socket/utils/sleep"
import { nanoid } from "nanoid"

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

  constructor(opts: RoundManagerOptions) {
    this.opts = opts
  }

  setAutoMode(on: boolean): void {
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

  isStarted(): boolean {
    return this.started
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

    this.opts.broadcast(STATUS.SHOW_START, {
      time: 3,
      subject: this.opts.quizz.subject,
    })

    await sleep(3)

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.START_COOLDOWN)
    await this.opts.cooldown.start(3)

    void this.newQuestion()
  }

  async newQuestion(): Promise<void> {
    if (!this.started) {
      return
    }

    this.clearAuto()

    const question = this.opts.quizz.questions[this.currentQuestion]

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    this.opts.broadcast(STATUS.SHOW_PREPARED, {
      totalAnswers: question.answers?.length ?? 0,
      questionNumber: this.currentQuestion + 1,
    })

    await sleep(2)

    if (!this.started) {
      return
    }

    const imageMedia =
      question.media?.type === MEDIA_TYPES.IMAGE ? question.media : undefined

    this.opts.broadcast(STATUS.SHOW_QUESTION, {
      question: question.question,
      media: imageMedia,
      cooldown: question.cooldown,
    })

    await sleep(question.cooldown)

    if (!this.started) {
      return
    }

    this.startTime = Date.now()

    this.opts.broadcast(STATUS.SELECT_ANSWER, {
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
    })

    await this.opts.cooldown.start(question.time)

    if (!this.started) {
      return
    }

    this.showResults(question)
  }

  private showResults(question: Question): void {
    const currentPlayers = this.opts.players.getAll()

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    const totalType = this.playersAnswers.reduce(
      (acc: Record<number, number>, { answerId }) => {
        acc[answerId] = (acc[answerId] || 0) + 1

        return acc
      },
      {},
    )

    const FIRST_CORRECT_BONUS = 100
    const isPoll = question.type === "poll"

    // Correctness + base factor (0..1) for a single answer, before multipliers.
    const evalAnswer = (answerId: number): { correct: boolean; base: number } => {
      if (
        question.type === "slider" &&
        question.min != null &&
        question.max != null &&
        question.correct != null
      ) {
        const range = question.max - question.min || 1
        const dist = Math.abs(answerId - question.correct)
        const accuracy = Math.max(0, 1 - dist / range)
        return {
          correct: dist <= Math.max(question.step ?? 0, range * 0.05),
          base: accuracy,
        }
      }
      const correct = question.solutions?.includes(answerId) ?? false
      return { correct, base: correct ? 1 : 0 }
    }

    // The first player (by answer arrival order) to get it right earns a flat bonus.
    let firstCorrectId: string | null = null
    if (!isPoll && !question.practice) {
      for (const a of this.playersAnswers) {
        if (evalAnswer(a.answerId).correct) {
          firstCorrectId = a.playerId
          break
        }
      }
    }

    const sortedPlayers = currentPlayers
      .map((player) => {
        const playerAnswer = this.playersAnswers.find(
          (a) => a.playerId === player.id,
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

        if (playerAnswer) {
          const ev = evalAnswer(playerAnswer.answerId)
          isCorrect = ev.correct
          rawPoints = ev.base * playerAnswer.points
        }

        const streakBefore = player.streak
        // Streak multiplier: +10% per consecutive correct, capped at +50%.
        const streakMult = isCorrect ? 1 + 0.1 * Math.min(streakBefore, 5) : 1
        const bonusMult = question.bonus ? 2 : 1

        let points = question.practice
          ? 0
          : Math.round(rawPoints * streakMult * bonusMult)

        let gotFirst = false
        if (!question.practice && isCorrect && player.id === firstCorrectId) {
          points += FIRST_CORRECT_BONUS
          gotFirst = true
        }

        player.points += points
        player.streak = isCorrect ? streakBefore + 1 : 0

        return {
          ...player,
          lastCorrect: isCorrect,
          lastPoints: points,
          lastPoll: false,
          lastStreak: player.streak,
          lastStreakBonus: isCorrect && streakBefore > 0 && !question.practice,
          lastBonus: !!question.bonus && isCorrect && !question.practice,
          lastFirstCorrect: gotFirst,
        }
      })
      .sort((a, b) => b.points - a.points)

    this.opts.players.replace(sortedPlayers)

    sortedPlayers.forEach((player, index) => {
      const rank = index + 1
      const aheadPlayer = sortedPlayers[index - 1]

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
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

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...question,
      responses: totalType,
      averageGuess,
    })

    this.questionsHistory.push({
      ...question,
      playerAnswers: currentPlayers.map((player) => ({
        playerName: player.username,
        answerId:
          this.playersAnswers.find((a) => a.playerId === player.id)?.answerId ??
          null,
      })),
    })

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard = oldLeaderboard
    this.playersAnswers = []

    if (this.autoMode) {
      this.scheduleAuto()
    }
  }

  selectAnswer(socket: Socket, answerId: number): void {
    const player = this.opts.players.findById(socket.id)
    const question = this.opts.quizz.questions[this.currentQuestion]

    if (!player) {
      return
    }

    if (this.playersAnswers.find((a) => a.playerId === socket.id)) {
      return
    }

    this.playersAnswers.push({
      playerId: player.id,
      answerId,
      points: timeToPoint(this.startTime, question.time),
    })

    this.opts.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
    })

    socket
      .to(this.opts.gameId)
      .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    this.opts.players.broadcastCount()

    if (this.playersAnswers.length === this.opts.players.count()) {
      this.opts.cooldown.abort()
    }
  }

  nextQuestion(socket: Socket): void {
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

    this.opts.cooldown.abort()
  }

  showLeaderboard(): void {
    const isLastRound =
      this.currentQuestion + 1 === this.opts.quizz.questions.length

    if (isLastRound) {
      this.started = false

      const top = this.leaderboard.slice(0, 3)

      this.opts.onGameFinished({
        id: `${Date.now()}-${nanoid(8)}`,
        subject: this.opts.quizz.subject,
        date: new Date().toISOString(),
        players: this.leaderboard.map((player, index) => ({
          username: player.username,
          points: player.points,
          rank: index + 1,
        })),
        questions: this.questionsHistory,
      })

      this.opts.send(this.opts.getManagerId(), STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
      })

      this.leaderboard.forEach((player, index) => {
        this.opts.send(player.id, STATUS.FINISHED, {
          subject: this.opts.quizz.subject,
          top,
          rank: index + 1,
        })
      })

      return
    }

    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
  }
}
