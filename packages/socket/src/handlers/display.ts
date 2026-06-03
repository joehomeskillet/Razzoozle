import { EVENTS } from "@razzia/common/constants"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getGameConfig } from "@razzia/socket/services/config"
import Registry from "@razzia/socket/services/registry"

interface PairPayload {
  code: string
  managerPassword: string
  gameId: string
}

// Validate a pairing attempt and, on success, join the display socket to the
// game room so it receives EVENTS.GAME.STATUS broadcasts. Emits PAIR_SUCCESS or
// PAIR_ERROR on the display socket. Returns true on success.
//
// Exported so it can be unit-tested with a mock socket without a live server.
export const handlePair = (
  { socket }: SocketContext,
  payload: PairPayload,
): boolean => {
  const registry = Registry.getInstance()
  const { code, managerPassword, gameId } = payload

  if (!registry.isPairingValid(code)) {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:display.invalidCode")

    return false
  }

  let config
  try {
    config = getGameConfig()
  } catch {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:failedToReadConfig")

    return false
  }

  // Same credential model as MANAGER.AUTH: the placeholder password is never
  // accepted, and the supplied password must match exactly.
  if (config.managerPassword === "PASSWORD") {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:manager.passwordNotConfigured")

    return false
  }

  if (managerPassword !== config.managerPassword) {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:manager.invalidPassword")

    return false
  }

  const game = registry.getGameById(gameId)

  if (!game) {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:game.notFound")

    return false
  }

  // Pairing is single-use: consume the code, then attach the display to the
  // game room so GAME.STATUS broadcasts reach the kiosk screen.
  registry.removePairing(code)
  socket.join(game.gameId)
  socket.emit(EVENTS.DISPLAY.PAIR_SUCCESS, { gameId: game.gameId })

  console.log(`Display paired to game ${game.inviteCode}`)

  return true
}

export const displaySocketHandlers = (context: SocketContext) => {
  const { socket } = context
  const registry = Registry.getInstance()

  socket.on(EVENTS.DISPLAY.REGISTER, ({ code }) => {
    registry.registerPairing(code, socket.id)
  })

  socket.on(EVENTS.DISPLAY.PAIR, (payload) => {
    handlePair(context, payload)
  })

  socket.on(EVENTS.DISPLAY.DISCONNECT, ({ code }) => {
    registry.removePairing(code)
  })
}
