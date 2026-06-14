import { AVATARS_GENERIC, BOT, EVENTS } from "@razzia/common/constants"
import type { Player, QuestionResult, Quizz } from "@razzia/common/types/game"
import type {
  MetricKind,
  MetricsHealthSnapshot,
  Server,
  Socket,
} from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type { LowLatencyMode } from "@razzia/common/validators/game-config"
import { setAvatarValidator } from "@razzia/common/validators/avatar"
import {
  deleteGameAvatars,
  getGameConfig,
  saveEphemeralAvatar,
  saveResult,
} from "@razzia/socket/services/config"
import { BotManager } from "@razzia/socket/services/game/bot-manager"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { metrics } from "@razzia/socket/services/metrics"
import Registry from "@razzia/socket/services/registry"
import { createInviteCode } from "@razzia/socket/utils/game"
import { v7 as uuid } from "uuid"

const registry = Registry.getInstance()

// Serializable crash-recovery snapshot for a single game. Only STABLE state is
// captured — never live sockets, timers, or a mid-question's partial answers.
// `quizz` is included because a restored game must still be playable past the
// resume point (the leaderboard): the manager can advance to the next question,
// which reads from the quizz. It changes nothing about a normal running game.
export interface GameSnapshot {
  gameId: string
  inviteCode: string
  started: boolean
  managerClientId: string
  autoMode: boolean
  quizz: Quizz
  round: {
    started: boolean
    currentQuestion: number
    leaderboard: Player[]
    questionsHistory: QuestionResult[]
    autoMode: boolean
    paused: boolean
    pausedState: { status: Status; data: StatusDataMap[Status] } | null
  }
  players: Array<{
    clientId: string
    username: string
    points: number
    streak: number
    avatar?: string
  }>
}

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
  // Sim mode: owns bot identity + the per-question answer scheduler. Always
  // constructed (the code is in the prod bundle), but inert until addBots is
  // called — and addBots refuses unless RAHOOT_SIM_MODE === "1".
  private readonly botManager: BotManager
  // The game's quizz, kept so a crash-recovery snapshot can persist it and a
  // restored game stays playable past the resume point (manager can advance).
  private readonly quizz: Quizz
  // Low-latency mode config snapshot, read ONCE at game creation so a mid-game
  // config edit can't change behaviour for a running game. enabled=false =>
  // every LL branch in this game is skipped (normal mode).
  private readonly lowLatency: LowLatencyMode
  // Health-snapshot push throttle (low-latency observability). Coalesces bursts
  // of client metric reports into at most one HEALTH emit per window so a busy
  // room can't spam the host. null when no emit is currently scheduled.
  private healthPushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly HEALTH_PUSH_THROTTLE_MS = 1000

  // A lobby player whose socket merely dropped (wifi blip / tab-background) is
  // kept on the roster and marked disconnected so PLAYER.RECONNECT can recover
  // them. If they never come back within this window we remove them so genuinely-
  // gone players don't pile up as ghosts in the host's lobby roster. 45s is long
  // enough for a real mobile reconnect storm (reconnectionDelayMax:5000 x retries)
  // yet short enough to clear the roster before a host typically starts the game.
  private readonly LOBBY_DISCONNECT_GRACE_MS = 45_000

  // Pending per-player lobby grace-removal timers, keyed by clientId. A lobby
  // transport-disconnect arms one; it is cleared on reconnect / kick / removal /
  // game disposal so no timer ever dangles. Started-game disconnects do NOT arm
  // one (started-game grace + reconnect is handled by the round/reconnect flow).
  private lobbyDisconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()

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

  // `socket` is null ONLY for the crash-recovery restore path: a restored game
  // has no live socket yet (the manager re-binds later via the existing
  // reconnect flow). For a normal new game `socket` is always present and the
  // behaviour is byte-identical to before. On restore, `restore` carries the
  // SAVED identity (gameId/inviteCode/managerClientId) so the reused ids match
  // what reconnecting clients hold — gameId/inviteCode stay readonly.
  constructor(
    io: Server,
    socket: Socket | null,
    quizz: Quizz,
    restore?: { gameId: string; inviteCode: string; managerClientId: string },
  ) {
    const clientId = socket
      ? (socket.handshake.auth.clientId as string)
      : (restore?.managerClientId ?? "")

    this.io = io
    this.quizz = quizz
    this.gameId = restore ? restore.gameId : uuid()
    this.inviteCode = restore ? restore.inviteCode : createInviteCode()
    this._manager = {
      // No live socket on restore: detached until a real reconnect binds one.
      id: socket ? socket.id : "",
      clientId,
      connected: Boolean(socket),
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

    // Sim mode: bots submit via the EXISTING selectAnswer path (real dedup /
    // scoring / deadline / early-advance) using a synthetic socket stub, and
    // read the live roster for username dedup + per-question scheduling.
    this.botManager = new BotManager({
      submit: (stub, answerId) => {
        this.round.selectAnswer(stub, answerId)
      },
      roster: () => this.playerManager.getAll(),
    })

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
      // Sim mode: schedule bot answers when the window opens, cancel pending bot
      // timers at every window close (early-advance, results, abort).
      onQuestionOpen: (question) => {
        this.botManager.onQuestionOpen(question)
      },
      onAnswerWindowClose: () => {
        this.botManager.cancelPending()
      },
      lowLatency: this.lowLatency,
    })

    // Restore path: no live socket — skip the room join + GAME_CREATED emit +
    // creation log entirely. The manager re-binds (and lands at the leaderboard)
    // through the existing reconnect flow once its browser reconnects.
    if (socket) {
      socket.join(this.gameId)
      socket.emit(EVENTS.MANAGER.GAME_CREATED, {
        gameId: this.gameId,
        inviteCode: this.inviteCode,
      })

      console.log(
        `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
      )
    }
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

  // Tell every client still in the room that the manager is gone for good. Used
  // by the registry once a game's empty-grace window elapses (true abandonment),
  // so still-connected players get a clean RESET instead of being orphaned.
  notifyManagerGone(): void {
    this.io
      .to(this.gameId)
      .emit(EVENTS.GAME.RESET, "errors:game.managerDisconnected")
  }

  // Player actions

  join(socket: Socket, username: string, avatar?: string) {
    if (!avatar) {
      this.playerManager.join(socket, username)

      return
    }

    void (async () => {
      const resolvedAvatar = await this.resolveAvatar(socket, avatar)

      if (!resolvedAvatar) {
        return
      }

      this.playerManager.join(socket, username, resolvedAvatar)
    })()
  }

  async setAvatar(socket: Socket, avatar: unknown): Promise<void> {
    const resolvedAvatar = await this.resolveAvatar(socket, avatar)

    if (!resolvedAvatar) {
      return
    }

    const clientId = socket.handshake.auth.clientId as string
    const player = this.playerManager.setAvatar(clientId, resolvedAvatar)

    if (player) {
      this.playerManager.broadcastPlayerUpdate(player)
    }
  }

  private async resolveAvatar(
    socket: Socket,
    avatar: unknown,
  ): Promise<string | undefined> {
    if (avatar === undefined || avatar === null || avatar === "") {
      return undefined
    }

    const result = setAvatarValidator.safeParse({ avatar })

    if (!result.success) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

      return undefined
    }

    const value = result.data.avatar

    if ((AVATARS_GENERIC as readonly string[]).includes(value)) {
      return value
    }

    if (value.startsWith("data:")) {
      try {
        return await saveEphemeralAvatar(this.gameId, socket.id, value)
      } catch (error) {
        socket.emit(
          EVENTS.GAME.ERROR_MESSAGE,
          error instanceof Error ? error.message : "errors:avatar.invalid",
        )

        return undefined
      }
    }

    socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:avatar.invalid")

    return undefined
  }

  kickPlayer(socket: Socket, playerId: string) {
    const target = this.playerManager.findById(playerId)

    if (this.playerManager.kick(socket, playerId)) {
      this.playerStatus.delete(playerId)

      if (target) {
        this.clearLobbyDisconnectTimer(target.clientId)

        // Sim mode: if a bot was kicked, clear its pending answer timer so it
        // can't fire a selectAnswer for a now-removed roster entry.
        if (target.isBot) {
          this.botManager.cancelPending(target.clientId)
        }
      }
    }
  }

  // ── Sim mode: add scripted bot opponents ───────────────────────────────────
  // Three independent gates (per the feature contract):
  //   1. RUNTIME ENV gate — refuse unless RAHOOT_SIM_MODE === "1" (default off).
  //      The code is in the prod bundle; only the ABILITY is gated.
  //   2. OWNERSHIP gate — only the game's manager socket may add bots.
  //   3. WINDOW gate — never inject mid-answer-window (no remaining-time race).
  // Then clamps to the per-game ceiling (BOT.MAX_TOTAL), builds the bots,
  // inserts each, and broadcasts the count ONCE for the whole batch.
  addBots(socket: Socket, count: number): void {
    if (process.env.RAHOOT_SIM_MODE !== "1") {
      socket.emit(
        EVENTS.MANAGER.ERROR_MESSAGE,
        "errors:manager.simModeDisabled",
      )

      return
    }

    if (socket.id !== this._manager.id) {
      return
    }

    if (this.round.isAnswerWindowOpen()) {
      socket.emit(EVENTS.MANAGER.ERROR_MESSAGE, "errors:manager.simWindowOpen")

      return
    }

    // Clamp so the cumulative bot count never exceeds BOT.MAX_TOTAL.
    const existingBots = this.botManager.count()
    const room = Math.max(0, BOT.MAX_TOTAL - existingBots)
    const toAdd = Math.min(count, room)

    if (toAdd <= 0) {
      return
    }

    const bots = this.botManager.addBots(toAdd)

    for (const bot of bots) {
      this.playerManager.addBot(bot)
    }

    // One count broadcast for the whole batch (addBot intentionally skips it).
    this.playerManager.broadcastCount()
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

    this.clearLobbyDisconnectTimer(clientId)

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
    this.io.to(this._manager.id).emit(EVENTS.MANAGER.PLAYER_RECONNECTED, {
      id: player.id,
      username: player.username,
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
      this.clearLobbyDisconnectTimer(player.clientId)
      this.io.to(this._manager.id).emit(EVENTS.MANAGER.REMOVE_PLAYER, player.id)
      this.playerManager.broadcastCount()
    }

    return player
  }

  setPlayerDisconnected(socketId: string) {
    this.playerManager.setDisconnected(socketId)
    this.playerManager.broadcastCount()

    // Lobby-only grace: a not-yet-started game keeps the dropped player on the
    // roster briefly so a flaky-wifi reconnect lands them back in the waiting
    // screen. A started game's disconnect grace is handled by the reconnect flow,
    // so we do NOT arm a removal timer there.
    if (!this.started) {
      this.scheduleLobbyDisconnectRemoval(socketId)
    }
  }

  private scheduleLobbyDisconnectRemoval(socketId: string): void {
    const player = this.playerManager.findById(socketId)

    if (!player) {
      return
    }

    const { clientId } = player

    // Re-arm cleanly: cancel any prior pending timer for this player first so a
    // re-drop never leaks a timer or double-fires.
    this.clearLobbyDisconnectTimer(clientId)

    const timer = setTimeout(() => {
      this.lobbyDisconnectTimers.delete(clientId)

      // Idempotent + guarded: only remove a player who is STILL present, still
      // disconnected, in a STILL-unstarted game. If they reconnected
      // (connected:true) or the game started, this is a no-op.
      const current = this.playerManager.findByClientId(clientId)

      if (current && !current.connected && !this.started) {
        this.removePlayer(current.id)
      }
    }, this.LOBBY_DISCONNECT_GRACE_MS)

    this.lobbyDisconnectTimers.set(clientId, timer)
  }

  private clearLobbyDisconnectTimer(clientId: string): void {
    const timer = this.lobbyDisconnectTimers.get(clientId)

    if (timer) {
      clearTimeout(timer)
      this.lobbyDisconnectTimers.delete(clientId)
    }
  }

  // Game flow

  abortCooldown() {
    this.cooldown.abort()
  }

  async start(socket: Socket) {
    await this.round.start(socket)
  }

  selectAnswer(
    socket: Socket,
    answerId: number | number[],
    clientMessageId?: string,
    answerText?: string,
  ) {
    this.round.selectAnswer(socket, answerId, clientMessageId, answerText)
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

    // Clear any pending lobby grace-removal timers so a disposed/abandoned game
    // never leaks a timer (mirrors the healthPushTimer cleanup above).
    for (const timer of this.lobbyDisconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.lobbyDisconnectTimers.clear()

    // Sim mode: cancel all pending bot answer timers so removing a game never
    // leaves a setTimeout retaining a dead Game (and bot state is dropped).
    this.botManager.removeAll()

    deleteGameAvatars(this.gameId)
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

  pause(): void {
    this.round.pause()
  }

  resume(): void {
    this.round.resume()
  }

  // ── Crash-recovery snapshot ──────────────────────────────────────────────

  // Serialize the STABLE, durable game state for an at-rest snapshot. Pure read
  // — touches nothing about a running game, so normal gameplay is unchanged.
  toSnapshot(): GameSnapshot {
    const round = this.round.toSnapshot()

    return {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      started: this.started,
      managerClientId: this._manager.clientId,
      autoMode: round.autoMode,
      quizz: this.quizz,
      round,
      players: this.playerManager.toSnapshot(),
    }
  }

  // Reconstruct a DETACHED Game from a snapshot (no live sockets). The saved
  // gameId/inviteCode/managerClientId are reused so reconnecting clients match.
  // The manager stays connected:false until a real socket reconnects. The
  // screen resumes "at the leaderboard": lastBroadcastStatus is primed with a
  // SHOW_LEADERBOARD view built from the restored standings so a reconnecting
  // client lands on the clean standings rather than a half-finished question.
  static fromSnapshot(io: Server, snap: GameSnapshot): Game {
    const game = new Game(io, null, snap.quizz, {
      gameId: snap.gameId,
      inviteCode: snap.inviteCode,
      managerClientId: snap.managerClientId,
    })

    game.round.restore(snap.round)
    game.playerManager.restore(snap.players)

    // Prime the resume view: reconnecting clients (manager + players) get the
    // leaderboard as their "current" status via the existing reconnect flow,
    // which falls back to lastBroadcastStatus.
    const leaderboard = snap.round.leaderboard
      .slice(0, 5)
      .map((p) => ({ ...p }))
    game.lastBroadcastStatus = {
      name: STATUS.SHOW_LEADERBOARD,
      data: { oldLeaderboard: leaderboard, leaderboard },
    }

    return game
  }
}

export default Game
