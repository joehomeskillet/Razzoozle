import {
  DEFAULT_MANAGER_PASSWORD,
  DISPLAY_NAME_MAX_LEN,
  EVENTS,
} from "@razzoozle/common/constants"
import type { Server } from "@razzoozle/common/types/game/socket"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { getGameConfig } from "@razzoozle/socket/services/config"
import Registry from "@razzoozle/socket/services/registry"
import { randomInt } from "crypto"

interface PairPayload {
  code: string
  // Optional: kept only as a legacy fallback for non-manager callers. The
  // manager is normally authorized by socket identity (see handlePair).
  managerPassword?: string
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

// WP-15 — fallback label for a display that supplied no (usable) name. Kept in
// sync with the de manager.json `display.status.unnamed` default.
const DISPLAY_DEFAULT_NAME = "Beamer"

// WP-15 — sanitise the UNTRUSTED client-supplied display name before it is
// stored + later rendered in the manager status card. Trim, strip control
// characters (incl. newlines), collapse to the length cap, fall back to a safe
// default. The card escapes via React, but this also bounds size + removes
// control bytes defensively.
const clampName = (name?: string): string => {
  if (typeof name !== "string") {
    return DISPLAY_DEFAULT_NAME
  }

  // oxlint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim()

  if (cleaned.length === 0) {
    return DISPLAY_DEFAULT_NAME
  }

  return cleaned.slice(0, DISPLAY_NAME_MAX_LEN)
}

// WP-15 — pending display names captured at REGISTER, keyed by the display's
// socket id, so handlePair can label the record at PAIR_SUCCESS time. The entry
// is consumed on pair; a missing entry just yields the default name.
const pendingDisplayNames = new Map<string, string>()

// WP-15 — push the live status list for a game to ITS CURRENT manager socket.
// Resolved fresh each call (game.manager.id changes across a manager reconnect),
// so a reconnecting manager always gets the broadcast at its new socket id. A
// missing game / detached manager (empty id) is a silent no-op.
const broadcastStatus = (io: Server, gameId: string): void => {
  const game = Registry.getInstance().getGameById(gameId)

  if (!game?.manager.id) {
    return
  }

  io.to(game.manager.id).emit(EVENTS.DISPLAY.STATUS, {
    displays: Registry.getInstance()
      .getDisplaysByGame(gameId)
      .map((d) => ({
        socketId: d.socketId,
        name: d.name,
        lastPingAt: d.lastPingAt,
      })),
  })
}

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

  const game = registry.getGameById(gameId)

  if (!game) {
    socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:game.notFound")

    return false
  }

  // Primary auth: the caller IS this game's authenticated manager (it ran
  // MANAGER.AUTH to create the game), matched by socket identity. Pairing
  // therefore works even though the client's in-memory password is gone after a
  // reload or the GET_CONFIG auto-navigation. Password stays only as a legacy
  // fallback for a non-manager caller.
  if (game.manager.id !== socket.id) {
    let config

    try {
      config = getGameConfig()
    } catch {
      socket.emit(
        EVENTS.DISPLAY.PAIR_ERROR,
        "errors:manager.failedToReadConfig",
      )

      return false
    }

    if (
      config.managerPassword === DEFAULT_MANAGER_PASSWORD ||
      managerPassword !== config.managerPassword
    ) {
      socket.emit(EVENTS.DISPLAY.PAIR_ERROR, "errors:manager.invalidPassword")

      return false
    }
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

  // WP-15 — begin the heartbeat record. Label it from the name captured at
  // REGISTER (already clamped on the way in), else the safe default. The kiosk
  // then pings periodically (DISPLAY.PING) to keep the manager card live.
  const pendingName = pendingDisplayNames.get(displaySocket.id)
  pendingDisplayNames.delete(displaySocket.id)
  registry.registerDisplay(
    displaySocket.id,
    game.gameId,
    clampName(pendingName),
  )
  broadcastStatus(io, game.gameId)

  console.log(`Display paired to game ${game.inviteCode}`)

  return true
}

export const displaySocketHandlers = (context: SocketContext) => {
  const { socket, io } = context
  const registry = Registry.getInstance()

  // Display registers (no client-chosen code); server mints + returns one.
  // WP-15 — the display may supply an up-front label (optional, back-compat:
  // old kiosks pass nothing). We stash the clamped name keyed by socket id so
  // handlePair can apply it to the heartbeat record on PAIR_SUCCESS.
  socket.on(EVENTS.DISPLAY.REGISTER, (data) => {
    const code = generateCode()
    registry.registerPairing(code, socket.id)

    if (data?.name !== undefined) {
      pendingDisplayNames.set(socket.id, clampName(data.name))
    }

    socket.emit(EVENTS.DISPLAY.REGISTERED, { code })
  })

  socket.on(EVENTS.DISPLAY.PAIR, (payload) => {
    handlePair(context, payload)
  })

  socket.on(EVENTS.DISPLAY.DISCONNECT, ({ code }) => {
    registry.removePairing(code)
  })

  // WP-15 — periodic heartbeat from a paired display. Bump lastPingAt (and
  // optionally refresh the clamped name), then re-emit STATUS so the manager
  // card's relative "last seen" resets. A ping from an unknown socket (e.g.
  // pre-pair, or after a restart before re-pair) is a no-op in touchDisplay.
  socket.on(EVENTS.DISPLAY.PING, ({ gameId, name }) => {
    registry.touchDisplay(
      socket.id,
      name !== undefined ? clampName(name) : undefined,
    )
    broadcastStatus(io, gameId)
  })

  // WP-15 — a display socket dropping removes its record and re-broadcasts so
  // the manager card drops the row immediately (don't wait for the 60s sweep).
  // Resolve the gameId from the record BEFORE removing it. Also clear any stale
  // pending name so the map can't leak across reconnects.
  socket.on("disconnect", () => {
    pendingDisplayNames.delete(socket.id)

    const gameId = registry.getDisplay(socket.id)?.gameId

    if (registry.removeDisplay(socket.id) && gameId) {
      broadcastStatus(io, gameId)
    }
  })
}
