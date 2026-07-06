import { EVENTS } from "@razzoozle/common/constants"
import type { EndGamePayload } from "@razzoozle/common/types/game"
import { getClientId } from "@razzoozle/socket/handlers/imageGenThrottle"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import manager from "@razzoozle/socket/services/manager"
import Registry from "@razzoozle/socket/services/registry"

export const registerGameHandlers = ({ socket }: SocketContext) => {
  const registry = Registry.getInstance()

  // ── Running-games admin panel (auth-gated) ────────────────────────────────
  // List every live game as a compact summary (no quiz content / solutions).
  socket.on(
    EVENTS.MANAGER.LIST_GAMES,
    manager.withAuth(socket, () => {
      socket.emit(
        EVENTS.MANAGER.GAMES_DATA,
        registry.getAllGames().map((g) => g.toSummary()),
      )
    }),
  )

  // End a game the requester OWNS. Ownership is verified via getManagerGame
  // (gameId + this client's clientId) — NEVER getGameById — so a manager can
  // never kill a foreign game. Reuses the wave-1 teardown helper pattern
  // (notifyManagerGone → registry.removeGame). A foreign / unknown gameId is a
  // silent no-op.
  socket.on(
    EVENTS.MANAGER.END_GAME,
    manager.withAuth(socket, (payload: EndGamePayload) => {
      const clientId = getClientId(socket)
      const game = registry.getManagerGame(payload?.gameId, clientId)

      if (!game) {
        return
      }

      game.notifyManagerGone()
      registry.removeGame(game.gameId)
    }),
  )
}
