import type {
  Player,
} from "@razzoozle/common/types/game"
import type {
  Socket,
} from "@razzoozle/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzoozle/common/types/game/status"
import { EVENTS } from "@razzoozle/common/constants"
import type { LowLatencyMode } from "@razzoozle/common/validators/game-config"
import { metrics } from "@razzoozle/socket/services/metrics"
import Registry from "@razzoozle/socket/services/registry"
import type { PlayerManager } from "@razzoozle/socket/services/game/player-manager"
import type { RoundManager } from "@razzoozle/socket/services/game/round-manager"
import type { Server } from "@razzoozle/common/types/game/socket"

const registry = Registry.getInstance()

/**
 * Reconnect a manager socket to an existing game.
 */
export function reconnectManagerImpl(
  io: Server,
  gameId: string,
  inviteCode: string,
  socket: Socket,
  round: RoundManager,
  playerManager: PlayerManager,
  managerStatus: { name: Status; data: StatusDataMap[Status] } | null,
  lastBroadcastStatus: { name: Status; data: StatusDataMap[Status] } | null,
  setManagerSocketId: (id: string) => void,
  setManagerConnected: (connected: boolean) => void,
): void {
  socket.join(gameId)
  setManagerSocketId(socket.id)
  setManagerConnected(true)

  const status = managerStatus ??
    lastBroadcastStatus ?? {
      name: STATUS.WAIT,
      data: { text: "game:waitingForPlayers" },
    }

  socket.emit(EVENTS.MANAGER.SUCCESS_RECONNECT, {
    gameId,
    currentQuestion: round.getReconnectInfo(),
    status,
    players: playerManager.getAll(),
  })
  socket.emit(EVENTS.GAME.TOTAL_PLAYERS, playerManager.count())

  registry.reactivateGame(gameId)
  console.log(`Manager reconnected to game ${inviteCode}`)
}

/**
 * Reconnect a player socket to an existing game.
 */
export function reconnectPlayerImpl(
  io: Server,
  gameId: string,
  inviteCode: string,
  socket: Socket,
  playerToken: string | undefined,
  round: RoundManager,
  playerManager: PlayerManager,
  lowLatency: LowLatencyMode,
  managerSocketId: string,
  playerStatus: Map<string, { name: Status; data: StatusDataMap[Status] }>,
  lastBroadcastStatus: { name: Status; data: StatusDataMap[Status] } | null,
  clearLobbyDisconnectTimerFn: (clientId: string) => void,
): void {
  const clientId = socket.handshake.auth.clientId as string
  const player = playerManager.findByClientId(clientId)

  if (!player) {
    return
  }

  // P2b — Token verification: if a token was minted for this clientId,
  // verify it matches. If mismatch, reject (anti-spoof). If no token was
  // ever minted (legacy/post-restart), allow clientId-only fallback.
  const storedToken = playerManager.getToken(clientId)
  if (storedToken !== undefined && playerToken !== storedToken) {
    socket.emit(EVENTS.GAME.RESET, "errors:game.playerNotFound")
    return
  }

  clearLobbyDisconnectTimerFn(clientId)

  // Takeover, not reject: on flaky wifi a reconnect often races ahead of the
  // old socket's "disconnect", so player.connected may still be true. Swapping
  // to the new socket recovers the session instead of evicting the player.
  socket.join(gameId)

  const oldSocketId = player.id
  playerManager.updateSocketId(oldSocketId, socket.id)
  player.connected = true

  const status = playerStatus.get(oldSocketId) ??
    lastBroadcastStatus ?? {
      name: STATUS.WAIT,
      data: { text: "game:waitingForPlayers" },
    }

  const oldStatus = playerStatus.get(oldSocketId)

  if (oldStatus) {
    playerStatus.delete(oldSocketId)
    playerStatus.set(socket.id, oldStatus)
  }

  // Low-latency mode: tell the client whether it already answered the current
  // question so resume renders "answered" instead of re-enabling buttons.
  // OPTIONAL field — omitted entirely in normal mode (client defaults false).
  const alreadyAnswered = lowLatency.enabled
    ? round.hasAnswered(clientId)
    : undefined

  if (lowLatency.enabled) {
    metrics.recordReconnect(gameId)
  }

  socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
    gameId,
    currentQuestion: round.getReconnectInfo(),
    status,
    player: { username: player.username, points: player.points },
    ...(alreadyAnswered !== undefined ? { alreadyAnswered } : {}),
  })
  io.to(managerSocketId).emit(EVENTS.MANAGER.PLAYER_RECONNECTED, {
    id: player.id,
    username: player.username,
  })
  socket.emit(EVENTS.GAME.TOTAL_PLAYERS, playerManager.count())

  console.log(
    `Player ${player.username} reconnected to game ${inviteCode}`,
  )
}
