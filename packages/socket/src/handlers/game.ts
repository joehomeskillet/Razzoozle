import { EVENTS } from "@razzia/common/constants"
import { inviteCodeValidator } from "@razzia/common/validators/auth"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getQuizz } from "@razzia/socket/services/config"
import Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import {
  addBotsValidator,
  selectedAnswerValidator,
} from "@razzia/socket/services/validators"
import { withGame } from "@razzia/socket/utils/game"

export const gameSocketHandlers = ({ io, socket }: SocketContext) => {
  const registry = Registry.getInstance()
  const clientId = socket.handshake.auth.clientId as string

  // Resolve the game this socket belongs to (as player or manager). Used by the
  // read-only, ownership-free handlers (clock ping / metrics report).
  const resolveOwnGame = () =>
    registry.getGameByPlayerSocketId(socket.id) ??
    registry.getGameByManagerSocketId(socket.id)

  const handleManagerLeave = (game: Game) => {
    // Give EVERY game (lobby or started) the same empty-grace window: a brief
    // host wifi blip must not destroy a not-yet-started lobby. The manager can
    // reconnect within EMPTY_GAME_TIMEOUT via reactivateGame (reconnectManager
    // restores the lobby). Truly abandoned games are RESET + removed by the
    // registry's cleanupEmptyGames once the grace window elapses.
    game.setManagerDisconnected()
    registry.markGameAsEmpty(game)
  }

  const handlePlayerLeave = (game: Game) => {
    if (!game.started) {
      const player = game.removePlayer(socket.id)

      if (player) {
        console.log(`Player ${player.username} left game ${game.gameId}`)
      }

      return
    }

    game.setPlayerDisconnected(socket.id)
  }

  const handlePlayerDisconnect = (game: Game) => {
    // A transport-level disconnect (wifi blip / tab-background / network switch)
    // is NOT an intentional leave — the client only emits EVENTS.PLAYER.LEAVE on
    // deliberate in-app navigation. So a player drop, whether the game is started
    // OR still in the lobby, keeps the player and marks them disconnected (grace),
    // allowing PLAYER.RECONNECT to recover the session. In the lobby this also arms
    // a per-player grace-removal timer (see services/game setPlayerDisconnected) so
    // a genuinely-gone player is cleared from the host roster after the grace window.
    game.setPlayerDisconnected(socket.id)
  }

  socket.on(EVENTS.PLAYER.RECONNECT, ({ gameId }) => {
    const game = registry.getPlayerGame(gameId, clientId)

    if (game) {
      game.reconnect(socket)

      return
    }

    socket.emit(EVENTS.GAME.RESET, "errors:game.notFound")
  })

  socket.on(EVENTS.MANAGER.RECONNECT, ({ gameId }) => {
    const game = registry.getManagerGame(gameId, clientId)

    if (game) {
      game.reconnect(socket)

      return
    }

    socket.emit(EVENTS.GAME.RESET, "errors:game.expired")
  })

  socket.on(EVENTS.GAME.CREATE, (quizzId) => {
    const quizzList = getQuizz()
    const quizz = quizzList.find((q) => q.id === quizzId)

    if (!quizz) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:quizz.notFound")

      return
    }

    const game = new Game(io, socket, quizz)
    registry.addGame(game)
  })

  socket.on(EVENTS.PLAYER.JOIN, (inviteCode) => {
    const result = inviteCodeValidator.safeParse(inviteCode)

    if (result.error) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

      return
    }

    const game = registry.getGameByInviteCode(inviteCode)

    if (!game) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.notFound")

      return
    }

    socket.emit(EVENTS.GAME.SUCCESS_ROOM, game.gameId)
  })

  socket.on(EVENTS.PLAYER.LOGIN, ({ gameId, data }) =>
    withGame(gameId, socket, (game) => game.join(socket, data.username)),
  )

  socket.on(EVENTS.MANAGER.KICK_PLAYER, ({ gameId, playerId }) =>
    withGame(gameId, socket, (game) => game.kickPlayer(socket, playerId)),
  )

  socket.on(EVENTS.MANAGER.START_GAME, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.start(socket)),
  )

  socket.on(EVENTS.MANAGER.SET_AUTO, ({ gameId, auto }) =>
    withGame(gameId, socket, (game) => game.setAutoMode(auto)),
  )

  // Sim mode: host adds N scripted bot opponents. Flat payload (matches
  // SET_AUTO), validated by addBotsValidator; the env / ownership / window gates
  // live in game.addBots so a malformed count is rejected here but the prod-
  // safety gate is enforced server-side regardless of the handler.
  socket.on(EVENTS.MANAGER.ADD_BOTS, ({ gameId, count }) =>
    withGame(gameId, socket, (game) => {
      const parsed = addBotsValidator.safeParse({ count })

      if (!parsed.success) {
        return
      }

      game.addBots(socket, parsed.data.count)
    }),
  )

  socket.on(EVENTS.PLAYER.SELECTED_ANSWER, ({ gameId, data }) =>
    withGame(gameId, socket, (game) => {
      // Harden against malformed/hostile payloads: require a finite integer
      // answerKey and an optional string clientMessageId, mirroring the JOIN/
      // username validation pattern. Guard `data` is an object first.
      if (typeof data !== "object" || data === null) {
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.invalidAnswer")

        return
      }

      const result = selectedAnswerValidator.safeParse(data)

      if (!result.success) {
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

        return
      }

      // Forward the optional per-tap clientMessageId (LL-mode dedup). A missing
      // id means "dedup by player+question only", i.e. today's behaviour. The
      // answer arg is `answerKeys` (number[]) for multiple-select, otherwise the
      // scalar `answerKey`; `answerText` carries the free-text for type-answer.
      // Per-question-type validity (array vs scalar vs text) is enforced
      // server-side in selectAnswer, which holds the live question.
      game.selectAnswer(
        socket,
        result.data.answerKeys ?? result.data.answerKey,
        result.data.clientMessageId,
        result.data.answerText,
      )
    }),
  )

  // Low-latency mode: UI-only clock sync. The handler is always registered, but
  // game.handleClockPing() is a no-op (sends nothing) unless lowLatencyMode is
  // enabled + clockSync is on, so normal mode is unaffected. We resolve the
  // game by the socket's own membership (player or manager) — no ownership
  // check, because a clock ping is a harmless, read-only request.
  socket.on(EVENTS.CLOCK.PING, (data) => {
    const clientSendMonoMs = data?.clientSendMonoMs

    if (typeof clientSendMonoMs !== "number") {
      return
    }

    const game = resolveOwnGame()

    if (game) {
      game.handleClockPing(socket, clientSendMonoMs)
    }
  })

  // Low-latency observability: a client reports a measured sample (RTT / clock
  // offset / ack latency). Resolved by the reporter's own socket membership and
  // folded into that game's room metrics. game.recordMetric is a no-op unless
  // low-latency mode is enabled, so normal mode is unaffected. Crash-guarded:
  // a malformed payload is dropped, never thrown.
  socket.on(EVENTS.METRICS.REPORT, (report) => {
    const kind = report?.kind
    const value = report?.value

    if (typeof kind !== "string" || typeof value !== "number") {
      return
    }

    const game = resolveOwnGame()

    if (game) {
      game.recordMetric(kind, value)
    }
  })

  // Low-latency observability: a manager opts in to health snapshots for its own
  // game. Manager-only (resolved via getManagerGame + clientId); no-op when the
  // game isn't found or low-latency mode is off.
  socket.on(EVENTS.METRICS.SUBSCRIBE, ({ gameId }) => {
    if (!gameId) {
      return
    }

    const game = registry.getManagerGame(gameId, clientId)

    if (game) {
      game.subscribeMetrics(socket)
    }
  })

  socket.on(EVENTS.MANAGER.ABORT_QUIZ, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.abortRound(socket)),
  )

  socket.on(EVENTS.MANAGER.NEXT_QUESTION, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.nextRound(socket)),
  )

  socket.on(EVENTS.MANAGER.SHOW_LEADERBOARD, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.showLeaderboard()),
  )

  socket.on(EVENTS.MANAGER.LEAVE, ({ gameId }) => {
    const game = registry.getManagerGame(gameId, clientId)

    if (game) {
      console.log(`Manager left game ${game.inviteCode}`)
      handleManagerLeave(game)
    }
  })

  socket.on(EVENTS.PLAYER.LEAVE, ({ gameId }) => {
    const game = registry.getPlayerGame(gameId, clientId)

    if (game) {
      handlePlayerLeave(game)
    }
  })

  socket.on("disconnect", () => {
    console.log(`A user disconnected : ${socket.id}`)

    const managerGame = registry.getGameByManagerSocketId(socket.id)

    if (managerGame) {
      console.log(`Manager disconnected from game ${managerGame.inviteCode}`)
      handleManagerLeave(managerGame)

      return
    }

    const playerGame = registry.getGameByPlayerSocketId(socket.id)

    if (playerGame) {
      handlePlayerDisconnect(playerGame)
    }
  })
}
