// Security regression: SET_AUTO + SHOW_LEADERBOARD must be host-only.
//
// Both handlers used to route through withGame(), which resolves a game by
// gameId ALONE (no ownership check) — so any joined player who knows the gameId
// could emit MANAGER.SET_AUTO / MANAGER.SHOW_LEADERBOARD to grief a live game
// (force auto-advance, or skip the result screen to the leaderboard). Every
// sibling host control gates on manager identity; these two did not.
//
// The fix routes both through managerAuth.withAuth + registry.getManagerGame
// (the exact PAUSE_GAME / RESUME_GAME ownership pattern). A non-host emit must
// be ignored: it gets MANAGER.UNAUTHORIZED and produces NO state change.
//
// Driven by the same lightweight fake sockets + fake IO harness as
// manager-reauth-on-reconnect.test.ts, against a real Game + gameSocketHandlers.
// The manager-auth singleton is driven directly via managerAuth.login.

import { EVENTS, EXAMPLE_QUIZZ } from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { STATUS } from "@razzoozle/common/types/game/status"
import { gameSocketHandlers } from "@razzoozle/socket/handlers/game"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import Game from "@razzoozle/socket/services/game"
import managerAuth from "@razzoozle/socket/services/manager"
import Registry from "@razzoozle/socket/services/registry"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

interface FakeSocket {
  id: string
  handshake: { auth: { clientId?: string } }
  emitted: Array<{ event: string; payload: unknown }>
  joined: string[]
  handlers: Map<string, (...args: unknown[]) => void>
  emit: (event: string, payload?: unknown) => boolean
  join: (room: string) => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
  to: (room: string) => { emit: (event: string, payload?: unknown) => boolean }
}

const ioEmitted: Array<{ target: string; event: string; payload: unknown }> = []

const makeFakeSocket = (id: string, clientId?: string): FakeSocket => {
  const socket: FakeSocket = {
    id,
    handshake: { auth: { clientId } },
    emitted: [],
    joined: [],
    handlers: new Map(),
    emit(event, payload) {
      socket.emitted.push({ event, payload })

      return true
    },
    join(room) {
      if (!socket.joined.includes(room)) {
        socket.joined.push(room)
      }
    },
    on(event, handler) {
      socket.handlers.set(event, handler)
    },
    to(room) {
      return {
        emit(event, payload) {
          ioEmitted.push({ target: room, event, payload })

          return true
        },
      }
    },
  }

  return socket
}

const fakeIo = {
  sockets: {
    sockets: new Map<string, FakeSocket>(),
  },
  to(room: string) {
    return {
      emit(event: string, payload?: unknown) {
        ioEmitted.push({ target: room, event, payload })

        return true
      },
    }
  },
}

const ctxOf = (socket: FakeSocket) =>
  ({ io: fakeIo, socket }) as unknown as SocketContext

// Read the private autoMode flag the same private-reflection way the round
// lifecycle tests reach into the RoundManager.
const autoModeOf = (game: Game): boolean =>
  (
    (game as unknown as { round: { autoMode: boolean } }).round
  ).autoMode

// Did showLeaderboard() broadcast its leaderboard STATUS to the manager?
const sawLeaderboardBroadcast = (): boolean =>
  ioEmitted.some(
    (e) =>
      e.event === EVENTS.GAME.STATUS &&
      (e.payload as { name?: string }).name === STATUS.SHOW_LEADERBOARD,
  )

describe("host-only guard on SET_AUTO + SHOW_LEADERBOARD", () => {
  let registry: Registry = Registry.getInstance()

  beforeEach(() => {
    registry = Registry.getInstance()
    registry.cleanup()
    ioEmitted.length = 0
  })

  afterEach(() => {
    registry.cleanup()
  })

  // Build a live game whose host (manager) is authenticated, plus a stranger
  // socket whose clientId is NOT the manager's. Both run the real handlers.
  const setup = () => {
    const managerSocket = makeFakeSocket("sock-host", "client-host")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)
    managerAuth.login(managerSocket as unknown as Socket)
    gameSocketHandlers(ctxOf(managerSocket))

    const strangerSocket = makeFakeSocket("sock-stranger", "client-stranger")
    gameSocketHandlers(ctxOf(strangerSocket))

    return { game, managerSocket, strangerSocket }
  }

  it("a non-host cannot trigger SET_AUTO (gets UNAUTHORIZED, autoMode unchanged)", () => {
    const { game, strangerSocket } = setup()

    expect(autoModeOf(game)).toBe(false)

    strangerSocket.handlers.get(EVENTS.MANAGER.SET_AUTO)!({
      gameId: game.gameId,
      auto: true,
    })

    expect(
      strangerSocket.emitted.some(
        (e) => e.event === EVENTS.MANAGER.UNAUTHORIZED,
      ),
    ).toBe(true)
    // The crux: no state change — auto-advance was NOT enabled by the stranger.
    expect(autoModeOf(game)).toBe(false)
  })

  it("a non-host cannot trigger SHOW_LEADERBOARD (gets UNAUTHORIZED, no broadcast)", () => {
    const { game, strangerSocket } = setup()

    strangerSocket.handlers.get(EVENTS.MANAGER.SHOW_LEADERBOARD)!({
      gameId: game.gameId,
    })

    expect(
      strangerSocket.emitted.some(
        (e) => e.event === EVENTS.MANAGER.UNAUTHORIZED,
      ),
    ).toBe(true)
    // The crux: the stranger could NOT skip the room to the leaderboard.
    expect(sawLeaderboardBroadcast()).toBe(false)
  })

  it("(positive control) the authenticated host CAN trigger SET_AUTO + SHOW_LEADERBOARD", () => {
    const { game, managerSocket } = setup()

    managerSocket.handlers.get(EVENTS.MANAGER.SET_AUTO)!({
      gameId: game.gameId,
      auto: true,
    })
    expect(
      managerSocket.emitted.some(
        (e) => e.event === EVENTS.MANAGER.UNAUTHORIZED,
      ),
    ).toBe(false)
    expect(autoModeOf(game)).toBe(true)

    ioEmitted.length = 0
    managerSocket.handlers.get(EVENTS.MANAGER.SHOW_LEADERBOARD)!({
      gameId: game.gameId,
    })
    expect(sawLeaderboardBroadcast()).toBe(true)
  })
})
