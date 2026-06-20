import { EVENTS } from "@razzoozle/common/constants"
import { inviteCodeValidator } from "@razzoozle/common/validators/auth"
import { setAvatarValidator } from "@razzoozle/common/validators/avatar"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import {
  getGameConfig,
  getQuizz,
  saveAchievementsConfig,
  updateGameConfig,
} from "@razzoozle/socket/services/config"
import type { AchievementsConfig } from "@razzoozle/common/validators/achievements"
import Game from "@razzoozle/socket/services/game"
import managerAuth, { emitConfig } from "@razzoozle/socket/services/manager"
import Registry from "@razzoozle/socket/services/registry"
import {
  addBotsValidator,
  selectedAnswerValidator,
} from "@razzoozle/socket/services/validators"
import { withGame } from "@razzoozle/socket/utils/game"

export const gameSocketHandlers = ({ io, socket }: SocketContext) => {
  const registry = Registry.getInstance()
  const clientId = socket.handshake.auth.clientId as string

  // Resolve the game this socket belongs to (as player or manager). Used by the
  // read-only, ownership-free handlers (clock ping / metrics report).
  const resolveOwnGame = () =>
    registry.getGameByPlayerSocketId(socket.id) ??
    registry.getGameByManagerSocketId(socket.id)

  const handleManagerLeave = (game: Game, intentional: boolean) => {
    // Intentional leave on a not-yet-started lobby = tear down NOW. The host
    // clicked Exit, so the lobby must not linger host-less yet joinable for the
    // full empty-grace window (the P0 ghost-game bug). notifyManagerGone sends a
    // clean RESET to anyone still in the room, then removeGame drops it from the
    // registry (un-joinable, disposes timers/metrics).
    if (intentional && !game.started) {
      game.notifyManagerGone()
      registry.removeGame(game.gameId)

      return
    }

    // Otherwise (a transport-level disconnect, or a leave on a started game)
    // keep the empty-grace window: a brief host wifi blip must not destroy a
    // game. The manager can reconnect within EMPTY_GAME_TIMEOUT via
    // reactivateGame (reconnectManager restores the lobby). Truly abandoned
    // games are RESET + removed by the registry's cleanupEmptyGames once the
    // grace window elapses.
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
      // A clientId that matches a game's stored manager.clientId is itself proof
      // of prior authentication, so a manager who reconnects (or whose game was
      // restored from a crash-recovery snapshot, where loggedClients is NOT
      // persisted) must regain withAuth privileges. The loggedClients Set is
      // in-memory and is wiped on every socket-server restart — without this the
      // manager regains the withGame controls but pause/resume + every manager
      // CRUD handler silently 401s (MANAGER.UNAUTHORIZED) until the host
      // re-enters the password at /manager.
      managerAuth.login(socket)
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

    // Global active-game cap: bound concurrent in-memory games so an
    // unauthenticated flood of CREATE events can't exhaust server memory. No
    // manager-auth gate here — CREATE happens before auth in the host flow, so
    // the cap alone bounds the DoS without breaking create-before-auth.
    const MAX_ACTIVE_GAMES = 100

    if (registry.getGameCount() >= MAX_ACTIVE_GAMES) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.serverBusy")

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

    socket.emit(EVENTS.GAME.SUCCESS_ROOM, {
      gameId: game.gameId,
      requireIdentifier: (() => {
        try {
          return getGameConfig().requireIdentifier ?? false
        } catch {
          return false
        }
      })(),
    })
  })

  socket.on(EVENTS.PLAYER.LOGIN, ({ gameId, data }) =>
    withGame(gameId, socket, (game) => {
      void game.join(socket, data.username, data.avatar, data.identifier)
    }),
  )

  socket.on(EVENTS.PLAYER.SET_AVATAR, (payload) => {
    if (typeof payload !== "object" || payload === null) {
      return
    }

    const raw = payload as {
      avatar?: unknown
      data?: { avatar?: unknown }
    }
    const avatar = raw.avatar ?? raw.data?.avatar

    const result = setAvatarValidator.safeParse({ avatar })

    if (!result.success) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

      return
    }

    // The AvatarPicker emits `{ avatar }` with NO gameId — resolve the socket's
    // own game by membership (mirrors SELECT_TEAM). Requiring a gameId here meant
    // every real pick was silently dropped, so no avatar ever reached the
    // roster / leaderboard / podium (they all fell back to initials).
    const game = resolveOwnGame()

    if (game) {
      void game.setAvatar(socket, result.data.avatar)
    }
  })

  // Player picks a team (team mode). No gameId in the payload — resolve the
  // socket's own game by membership. The teamId is validated server-side
  // (against the TEAMS enum) and ignored when team mode is off, so a malformed
  // or hostile payload is a harmless no-op.
  socket.on(EVENTS.PLAYER.SELECT_TEAM, (payload: unknown) => {
    const teamId = (payload as { teamId?: unknown } | null | undefined)?.teamId

    if (typeof teamId !== "string") {
      return
    }

    const game = resolveOwnGame()

    if (game) {
      game.selectTeam(socket, teamId)
    }
  })

  socket.on(EVENTS.MANAGER.KICK_PLAYER, ({ gameId, playerId }) =>
    withGame(gameId, socket, (game) => game.kickPlayer(socket, playerId)),
  )

  socket.on(EVENTS.MANAGER.START_GAME, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.start(socket)),
  )

  // Host-only: toggle auto-advance. Routed via withAuth + getManagerGame (same
  // ownership gate as PAUSE_GAME / RESUME_GAME) rather than the ownership-free
  // withGame — withGame resolves by gameId alone, so any joined player could
  // emit SET_AUTO to grief a live game (force auto-advance). A non-host emit is
  // ignored (no state change).
  socket.on(
    EVENTS.MANAGER.SET_AUTO,
    managerAuth.withAuth(
      socket,
      (payload: { gameId?: string; auto?: boolean } | undefined) => {
        const game = registry.getManagerGame(payload?.gameId ?? "", clientId)

        if (game) {
          game.setAutoMode(payload?.auto === true)
        }
      },
    ),
  )

  socket.on(
    EVENTS.MANAGER.PAUSE_GAME,
    managerAuth.withAuth(socket, (payload: { gameId?: string } | undefined) => {
      const game = registry.getManagerGame(payload?.gameId ?? "", clientId)

      if (game) {
        game.pause()
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER.RESUME_GAME,
    managerAuth.withAuth(socket, (payload: { gameId?: string } | undefined) => {
      const game = registry.getManagerGame(payload?.gameId ?? "", clientId)

      if (game) {
        game.resume()
      }
    }),
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

  // Persist a partial game-config patch (auth-gated — mirrors PAUSE_GAME /
  // RESUME_GAME). Accepts `teamMode`, `lowLatencyEnabled` (the
  // `lowLatencyMode.enabled` master switch), and `joinLocked`; malformed or
  // empty payloads are silently dropped (no error event, consistent with other
  // no-op guards).
  socket.on(
    EVENTS.MANAGER.SET_GAME_CONFIG,
    managerAuth.withAuth(socket, (payload: unknown) => {
      const patchPayload = payload as
        | { teamMode?: unknown; lowLatencyEnabled?: unknown; joinLocked?: unknown; randomizeAnswers?: unknown; scoringMode?: unknown }
        | null
        | undefined

      const patch: { teamMode?: boolean; lowLatencyEnabled?: boolean; joinLocked?: boolean; randomizeAnswers?: boolean; scoringMode?: "speed" | "accuracy" } = {}

      if (typeof patchPayload?.teamMode === "boolean") {
        patch.teamMode = patchPayload.teamMode
      }
      if (typeof patchPayload?.lowLatencyEnabled === "boolean") {
        patch.lowLatencyEnabled = patchPayload.lowLatencyEnabled
      }
      if (typeof patchPayload?.joinLocked === "boolean") {
        patch.joinLocked = patchPayload.joinLocked
      }
      if (typeof patchPayload?.randomizeAnswers === "boolean") {
        patch.randomizeAnswers = patchPayload.randomizeAnswers
      }
      if (typeof patchPayload?.scoringMode === "string" && ["speed", "accuracy"].includes(patchPayload.scoringMode)) {
        patch.scoringMode = patchPayload.scoringMode as "speed" | "accuracy"
      }

      // No recognised field → nothing to persist.
      if (
        patch.teamMode === undefined &&
        patch.lowLatencyEnabled === undefined &&
        patch.joinLocked === undefined &&
        patch.randomizeAnswers === undefined
        && patch.scoringMode === undefined
      ) {
        return
      }

      try {
        updateGameConfig(patch)
        // Apply joinLocked live so the gate takes effect immediately (unlike
        // teamMode/lowLatencyEnabled which are snapshots read at game creation).
        if (patch.joinLocked !== undefined) {
          const game = resolveOwnGame()
          if (game) {
            game.setJoinLocked(patch.joinLocked)
          }
        }
        // Round-trip the saved value back so the manager's toggle reflects the
        // persisted config rather than its optimistic local state.
        emitConfig(socket)
      } catch {
        // Validation failure is non-fatal for the socket session.
      }
    }),
  )

  // Persist a partial achievements-config patch (auth-gated — mirrors
  // SET_GAME_CONFIG). The payload must be `{ config: { [id]: {...} } }`; a
  // malformed payload (missing / non-object config) is a silent no-op.
  // saveAchievementsConfig deep-merges the patch into the stored record,
  // validates it, and safe-writes; we then round-trip the merged list back via
  // emitConfig so the manager's editor reflects the persisted config.
  socket.on(
    EVENTS.MANAGER.SET_ACHIEVEMENTS_CONFIG,
    managerAuth.withAuth(socket, (payload: unknown) => {
      const config = (payload as { config?: unknown } | null | undefined)
        ?.config

      if (typeof config !== "object" || config === null) {
        return
      }

      try {
        saveAchievementsConfig(config as AchievementsConfig)
        emitConfig(socket)
      } catch {
        // Validation failure is non-fatal for the socket session.
      }
    }),
  )

  socket.on(EVENTS.MANAGER.ABORT_QUIZ, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.abortRound(socket)),
  )

  socket.on(EVENTS.MANAGER.NEXT_QUESTION, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.nextRound(socket)),
  )

  // Host-only: advance to the leaderboard screen. Routed via withAuth +
  // getManagerGame (same ownership gate as PAUSE_GAME / RESUME_GAME) rather than
  // the ownership-free withGame — withGame resolves by gameId alone, so any
  // joined player could emit SHOW_LEADERBOARD to grief a live game (skip the
  // result screen). A non-host emit is ignored (no state change).
  socket.on(
    EVENTS.MANAGER.SHOW_LEADERBOARD,
    managerAuth.withAuth(socket, (payload: { gameId?: string } | undefined) => {
      const game = registry.getManagerGame(payload?.gameId ?? "", clientId)

      if (game) {
        game.showLeaderboard()
      }
    }),
  )

  // ── Host live controls (#12) ──────────────────────────────────────────────
  // Skip the current question (end early → reveal results) and force-reveal the
  // answer share the same withGame + internal-ownership guard as ABORT_QUIZ /
  // NEXT_QUESTION (the round method checks socket.id === managerId). ADJUST_TIMER
  // additionally validates + clamps deltaSeconds to a sane host range so a
  // malformed/hostile value can never blow up the countdown.
  socket.on(EVENTS.MANAGER.SKIP_QUESTION, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.skipQuestion(socket)),
  )

  socket.on(EVENTS.MANAGER.REVEAL_ANSWER, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.revealAnswer(socket)),
  )

  socket.on(EVENTS.MANAGER.ADJUST_TIMER, ({ gameId, deltaSeconds }) =>
    withGame(gameId, socket, (game) => {
      if (
        typeof deltaSeconds !== "number" ||
        !Number.isFinite(deltaSeconds) ||
        deltaSeconds === 0
      ) {
        return
      }

      // Clamp to a sane per-action host range (+/- 60s) so one event can't push
      // the countdown to an absurd value; the host UI taps this repeatedly for
      // larger shifts.
      const delta = Math.max(-60, Math.min(60, Math.trunc(deltaSeconds)))

      game.adjustTimer(socket, delta)
    }),
  )

  socket.on(EVENTS.MANAGER.LEAVE, ({ gameId }) => {
    const game = registry.getManagerGame(gameId, clientId)

    if (game) {
      console.log(`Manager left game ${game.inviteCode}`)
      // Intentional leave (the host clicked Exit): tear down a not-yet-started
      // lobby immediately so it can't linger host-less yet joinable.
      handleManagerLeave(game, true)
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
      // Transport-level drop (wifi blip / tab close): NOT intentional. Keep the
      // 5-minute empty-grace + reconnect path for every game.
      handleManagerLeave(managerGame, false)

      return
    }

    const playerGame = registry.getGameByPlayerSocketId(socket.id)

    if (playerGame) {
      handlePlayerDisconnect(playerGame)
    }
  })
}
