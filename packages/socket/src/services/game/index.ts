import { EVENTS } from "@razzia/common/constants"
import type { Player, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type {
  MetricKind,
  MetricsHealthSnapshot,
} from "@razzia/common/types/game/socket"
import type { LowLatencyMode } from "@razzia/common/validators/game-config"
import { getGameConfig, saveResult } from "@razzia/socket/services/config"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { metrics } from "@razzia/socket/services/metrics"
import Registry from "@razzia/socket/services/registry"
import { createInviteCode } from "@razzia/socket/utils/game"
import { v7 as uuid } from "uuid"

const registry = Registry.getInstance()

class Game {
  readonly gameId: string
  readonly inviteCode: string

  private readonly io: Server
  private readonly _manager: {
    id: string
    clientId: string
    connected: boolean
  }
  private readonly playerManager: PlayerManager
  private readonly round: RoundManager
  private readonly cooldown: CooldownTimer
  // Low-latency mode config snapshot, read ONCE at game creation so a mid-game
  // config edit can't change behaviour for a running game. enabled=false =>
  // every LL branch in this game is skipped (normal mode).
  private readonly lowLatency: LowLatencyMode
  // Health-snapshot push throttle (low-latency observability). Coalesces bursts
  // of client metric reports into at most one HEALTH emit per window so a busy
  // room can't spam the host. null when no emit is currently scheduled.
  private healthPushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly HEALTH_PUSH_THROTTLE_MS = 1000

  private lastBroadcastStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private managerStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private playerStatus = new Map<
    string,
    { name: Status; data: StatusDataMap[Status] }
  >()

  constructor(io: Server, socket: Socket, quizz: Quizz) {
    const clientId = socket.handshake.auth.clientId as string

    this.io = io
    this.gameId = uuid()
    this.inviteCode = createInviteCode()
    this._manager = {
      id: socket.id,
      clientId,
      connected: true,
    }

    // Read the LL config once. getGameConfig() is zod-defaulted/back-compatible,
    // but guard the read so a config error can never crash game creation — fall
    // back to "disabled" (normal mode).
    this.lowLatency = (() => {
      try {
        return getGameConfig().lowLatencyMode
      } catch {
        return {
          enabled: false,
          clockSync: true,
          preloadNextQuestion: true,
          answerAck: true,
          scoreboardBroadcastThrottleMs: 100,
          maxLatencyCompensationMs: 150,
        }
      }
    })()

    this.cooldown = new CooldownTimer(io, this.gameId)

    this.playerManager = new PlayerManager(
      io,
      this.gameId,
      () => this._manager.id,
    )

    this.round = new RoundManager({
      quizz,
      players: this.playerManager,
      cooldown: this.cooldown,
      io,
      gameId: this.gameId,
      getManagerId: () => this._manager.id,
      broadcast: this.broadcastStatus.bind(this),
      send: this.sendStatus.bind(this),
      onNewQuestion: () => {
        this.playerStatus.clear()
        this.managerStatus = null
      },
      onGameFinished: saveResult,
      lowLatency: this.lowLatency,
    })

    socket.join(this.gameId)
    socket.emit(EVENTS.MANAGER.GAME_CREATED, {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
    })

    console.log(
      `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
    )
  }

  get manager() {
    return this._manager
  }

  get players(): Player[] {
    return this.playerManager.getAll()
  }

  get started(): boolean {
    return this.round.isStarted()
  }

  // ── Status broadcasting ──────────────────────────────────────────────────

  private broadcastStatus<T extends Status>(status: T, data: StatusDataMap[T]) {
    const statusData = { name: status, data }
    this.lastBroadcastStatus = statusData
    this.io.to(this.gameId).emit(EVENTS.GAME.STATUS, statusData)
  }

  private sendStatus<T extends Status>(
    target: string,
    status: T,
    data: StatusDataMap[T],
  ) {
    const statusData = { name: status, data }

    if (this._manager.id === target) {
      this.managerStatus = statusData
    } else {
      this.playerStatus.set(target, statusData)
    }

    this.io.to(target).emit(EVENTS.GAME.STATUS, statusData)
  }

  // Player actions

  join(socket: Socket, username: string) {
    this.playerManager.join(socket, username)
  }

  kickPlayer(socket: Socket, playerId: string) {
    if (this.playerManager.kick(socket, playerId)) {
      this.playerStatus.delete(playerId)
    }
  }

  // Reconnect

  reconnect(socket: Socket) {
    const { clientId } = socket.handshake.auth

    if (this._manager.clientId === clientId) {
      this.reconnectManager(socket)

      return
    }

    this.reconnectPlayer(socket)
  }

  private reconnectManager(socket: Socket) {
    if (this._manager.connected) {
      socket.emit(EVENTS.GAME.RESET, "errors:game.managerAlreadyConnected")

      return
    }

    socket.join(this.gameId)
    this._manager.id = socket.id
    this._manager.connected = true

    const status = this.managerStatus ??
      this.lastBroadcastStatus ?? {
        name: STATUS.WAIT,
        data: { text: "game:waitingForPlayers" },
      }

    socket.emit(EVENTS.MANAGER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      players: this.playerManager.getAll(),
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.count())

    registry.reactivateGame(this.gameId)
    console.log(`Manager reconnected to game ${this.inviteCode}`)
  }

  private reconnectPlayer(socket: Socket) {
    const clientId = socket.handshake.auth.clientId as string
    const player = this.playerManager.findByClientId(clientId)

    if (!player) {
      return
    }

    // Takeover, not reject: on flaky wifi a reconnect often races ahead of the
    // old socket's "disconnect", so player.connected may still be true. Swapping
    // to the new socket recovers the session instead of evicting the player.
    socket.join(this.gameId)

    const oldSocketId = player.id
    this.playerManager.updateSocketId(oldSocketId, socket.id)
    player.connected = true

    const status = this.playerStatus.get(oldSocketId) ??
      this.lastBroadcastStatus ?? {
        name: STATUS.WAIT,
        data: { text: "game:waitingForPlayers" },
      }

    const oldStatus = this.playerStatus.get(oldSocketId)

    if (oldStatus) {
      this.playerStatus.delete(oldSocketId)
      this.playerStatus.set(socket.id, oldStatus)
    }

    // Low-latency mode: tell the client whether it already answered the current
    // question so resume renders "answered" instead of re-enabling buttons.
    // OPTIONAL field — omitted entirely in normal mode (client defaults false).
    const alreadyAnswered = this.lowLatency.enabled
      ? this.round.hasAnswered(clientId)
      : undefined

    if (this.lowLatency.enabled) {
      metrics.recordReconnect(this.gameId)
    }

    socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      player: { username: player.username, points: player.points },
      ...(alreadyAnswered !== undefined ? { alreadyAnswered } : {}),
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.count())

    console.log(
      `Player ${player.username} reconnected to game ${this.inviteCode}`,
    )
  }

  // Disconnect helpers

  setManagerDisconnected() {
    this._manager.connected = false
  }

  removePlayer(socketId: string): Player | undefined {
    const player = this.playerManager.remove(socketId)

    if (player) {
      this.io.to(this._manager.id).emit(EVENTS.MANAGER.REMOVE_PLAYER, player.id)
      this.playerManager.broadcastCount()
    }

    return player
  }

  setPlayerDisconnected(socketId: string) {
    this.playerManager.setDisconnected(socketId)
    this.playerManager.broadcastCount()
  }

  // Game flow

  abortCooldown() {
    this.cooldown.abort()
  }

  async start(socket: Socket) {
    await this.round.start(socket)
  }

  selectAnswer(socket: Socket, answerId: number, clientMessageId?: string) {
    this.round.selectAnswer(socket, answerId, clientMessageId)
  }

  // Low-latency mode helpers exposed to the handler layer.

  get lowLatencyMode(): LowLatencyMode {
    return this.lowLatency
  }

  // UI-only clock sync: reply with the server wall clock. Gated by enabled +
  // clockSync so normal mode is an inert no-op. RTT and clock-offset are
  // measured on the CLIENT (the server can't observe a one-way ping's
  // round-trip), so the server only answers here; the host widget reads RTT/
  // offset from the client samples. Returns true if a pong was sent.
  handleClockPing(socket: Socket, clientSendMonoMs: number): boolean {
    if (!this.lowLatency.enabled || !this.lowLatency.clockSync) {
      return false
    }

    socket.emit(EVENTS.CLOCK.PONG, {
      clientSendMonoMs,
      serverNowMs: Date.now(),
    })

    return true
  }

  // P50/p95 health snapshot for the optional host widget. Cheap; empty in
  // normal mode (nothing is ever recorded when disabled).
  getMetrics(): MetricsHealthSnapshot {
    return metrics.snapshot(this.gameId)
  }

  // ── Low-latency observability ─────────────────────────────────────────────

  // Ingest a client-measured sample (RTT / clock-offset / answer-ack latency).
  // RTT and ack latency are inherently client-side measurements (a one-way
  // server ping has no observable round-trip), so the client reports them here
  // and the server aggregates per room. Gated by `enabled`: in normal mode this
  // is an inert no-op (nothing recorded, no host push), so it cannot change
  // today's behaviour. Every value is crash-guarded to a finite number.
  recordMetric(kind: MetricKind, value: number): void {
    if (!this.lowLatency.enabled) {
      return
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return
    }

    switch (kind) {
      case "rtt":
        metrics.recordRtt(this.gameId, value)

        break

      case "clockOffset":
        metrics.recordClockOffset(this.gameId, value)

        break

      case "answerAck":
        metrics.recordAnswerAck(this.gameId, value)

        break

      default:
        // Unknown kind from a future/garbled client — ignore safely.
        return
    }

    // Coalesce into a throttled push so the host widget refreshes without a
    // snapshot per individual report.
    this.scheduleHealthPush()
  }

  // A manager subscribes to health snapshots for ITS OWN game. We send one
  // immediate snapshot (so the widget isn't blank) and then rely on the
  // throttled push as new samples arrive. Gated by `enabled` + manager identity
  // so a player can't subscribe and normal mode never emits anything.
  subscribeMetrics(socket: Socket): void {
    if (!this.lowLatency.enabled) {
      return
    }

    if (this._manager.id !== socket.id) {
      return
    }

    socket.emit(EVENTS.METRICS.HEALTH, this.getMetrics())
  }

  // Push a fresh snapshot to the (connected) manager, throttled so a burst of
  // reports collapses into at most one emit per window.
  private scheduleHealthPush(): void {
    if (this.healthPushTimer) {
      return
    }

    this.healthPushTimer = setTimeout(() => {
      this.healthPushTimer = null

      // Only the manager socket receives health; players never see metrics.
      this.io
        .to(this._manager.id)
        .emit(EVENTS.METRICS.HEALTH, this.getMetrics())
    }, this.HEALTH_PUSH_THROTTLE_MS)
  }

  // Drop this game's metrics buffers + any pending health push. Called by the
  // registry on game removal so the per-room metrics map can't accumulate keys
  // across many enabled games over a long-lived server.
  disposeMetrics(): void {
    if (this.healthPushTimer) {
      clearTimeout(this.healthPushTimer)
      this.healthPushTimer = null
    }

    metrics.clear(this.gameId)
  }

  nextRound(socket: Socket) {
    this.round.nextQuestion(socket)
  }

  abortRound(socket: Socket) {
    this.round.abortQuestion(socket)
  }

  showLeaderboard() {
    this.round.showLeaderboard()
  }

  setAutoMode(on: boolean) {
    this.round.setAutoMode(on)
  }
}

export default Game
