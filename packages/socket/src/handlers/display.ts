import { EVENTS } from "@razzia/common/constants"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getGameConfig } from "@razzia/socket/services/config"
import Registry from "@razzia/socket/services/registry"
import { randomInt } from "crypto"

interface PairPayload {
  code: string
  managerPassword: string
  gameId: string
}

// Server-generated pairing code (CSPRNG, no ambiguous chars). The display never
// chooses its own code, so a code can't be guessed/forced by a client.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const generateCode = () =>
  Array.from(
    { length: 6 },
    () => CODE_CHARS[randomInt(CODE_CHARS.length)],
  ).join("")

// Validate a manager's pairing attempt and, on success, join the DISPLAY socket
// (the one that registered the code) to the game room so the kiosk receives
// GAME.STATUS broadcasts. The manager (caller) only triggers + gets confirmation.
export const handlePair = (
  { socket, io }: SocketContext,
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
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:manager.failedToReadConfig")

    return false
  }

  if (config.managerPassword === "PASSWORD") {
    socket.emit(
      EVENTS.DISPLAY.PAIR_ERROR,
      "errors:manager.passwordNotConfigured",
    )

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

  const pairing = registry.getPairing(code)
  const displaySocket = pairing
    ? io.sockets.sockets.get(pairing.socketId)
    : undefined

  if (!displaySocket) {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:display.notConnected")

    return false
  }

  // Single-use: consume the code, attach the DISPLAY (not the caller) to the
  // room, and tell both the display (to start mirroring) and the manager.
  registry.removePairing(code)
  displaySocket.join(game.gameId)
  displaySocket.emit(EVENTS.DISPLAY.PAIR_SUCCESS, { gameId: game.gameId })
  socket.emit(EVENTS.DISPLAY.PAIR_SUCCESS, { gameId: game.gameId })

  console.log(`Display paired to game ${game.inviteCode}`)

  return true
}

export const displaySocketHandlers = (context: SocketContext) => {
  const { socket } = context
  const registry = Registry.getInstance()

  // Display registers (no client-chosen code); server mints + returns one.
  socket.on(EVENTS.DISPLAY.REGISTER, () => {
    const code = generateCode()
    registry.registerPairing(code, socket.id)
    socket.emit(EVENTS.DISPLAY.REGISTERED, { code })
  })

  socket.on(EVENTS.DISPLAY.PAIR, (payload) => {
    handlePair(context, payload)
  })

  socket.on(EVENTS.DISPLAY.DISCONNECT, ({ code }) => {
    registry.removePairing(code)
  })
}
