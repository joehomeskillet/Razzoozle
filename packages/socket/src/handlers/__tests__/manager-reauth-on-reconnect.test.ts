// Regression test: manager re-auth on MANAGER.RECONNECT.
//
// `loggedClients` (the manager-auth Set in services/manager.ts) is in-memory and
// is wiped on every socket-server restart (deploy / crash-recovery). After a
// restart mid-game the host reconnects by emitting ONLY EVENTS.MANAGER.RECONNECT
// (it never re-sends MANAGER.AUTH). Without re-establishing auth on reconnect the
// manager regains the withGame controls (START/NEXT/...) but EVERY
// managerAuth.withAuth(...)-gated handler silently emits MANAGER.UNAUTHORIZED and
// no-ops: PAUSE_GAME, RESUME_GAME, and all quizz/theme/catalog/ai/media CRUD.
//
// The fix: the MANAGER.RECONNECT handler calls managerAuth.login(socket) when the
// reconnecting clientId matches the game's stored manager.clientId (a match is
// itself proof of prior authentication). This test proves that PAUSE_GAME works
// again after a reconnect even when the auth Set was cleared, and that a
// NON-matching clientId is NOT logged in.
//
// Driven by the same lightweight fake sockets + fake IO harness as
// lobby-disconnect.test.ts, against a real Game instance + gameSocketHandlers.

import { EVENTS, EXAMPLE_QUIZZ } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import { STATUS } from "@razzia/common/types/game/status"
import { gameSocketHandlers } from "@razzia/socket/handlers/game"
import type { SocketContext } from "@razzia/socket/handlers/types"
import Game from "@razzia/socket/services/game"
import managerAuth from "@razzia/socket/services/manager"
import Registry from "@razzia/socket/services/registry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

// Drive the game's round into a pausable status (SHOW_ROOM) so a subsequent
// pause() actually broadcasts STATUS.PAUSED — mirrors pause.test.ts's
// setCurrentStatus reflection (pause() rejects unless pauseState is pausable).
const setPausableStatus = (game: Game): void => {
  const round = (game as unknown as { round: unknown }).round as {
    pauseState: { status: string; data: unknown } | null
  }
  round.pauseState = {
    status: STATUS.SHOW_ROOM,
    data: { text: "game:waitingForPlayers" },
  }
}

describe("manager re-auth on MANAGER.RECONNECT", () => {
  let registry: Registry = Registry.getInstance()

  beforeEach(() => {
    registry = Registry.getInstance()
    registry.cleanup()
    ioEmitted.length = 0
  })

  afterEach(() => {
    registry.cleanup()
    vi.useRealTimers()
  })

  it("restores withAuth privileges so PAUSE_GAME works after a restart wiped the auth Set", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    // The game is now pausable (lobby SHOW_ROOM).
    setPausableStatus(game)

    // Simulate a server restart: the in-memory loggedClients Set is wiped, so
    // this manager's clientId is no longer considered logged in. Also mark the
    // manager disconnected (a real restart drops the transport) so reconnect is
    // not rejected by the "already connected" guard.
    managerAuth.logout(managerSocket as unknown as Socket)
    game.setManagerDisconnected()
    expect(managerAuth.isLogged(managerSocket as unknown as Socket)).toBe(false)

    // The host reconnects on a fresh socket (same durable clientId) and emits
    // ONLY MANAGER.RECONNECT — it never re-sends MANAGER.AUTH.
    const reSocket = makeFakeSocket("sock-manager-2", "client-manager")
    gameSocketHandlers(ctxOf(reSocket))
    reSocket.handlers.get(EVENTS.MANAGER.RECONNECT)!({ gameId: game.gameId })

    // Privileges restored: the reconnecting socket is now logged in...
    expect(managerAuth.isLogged(reSocket as unknown as Socket)).toBe(true)

    // ...and reconnect succeeded (not an expired/reset bounce).
    expect(
      reSocket.emitted.some(
        (e) => e.event === EVENTS.MANAGER.SUCCESS_RECONNECT,
      ),
    ).toBe(true)
    expect(
      reSocket.emitted.some((e) => e.event === EVENTS.GAME.RESET),
    ).toBe(false)

    // The crux: a subsequent PAUSE_GAME now passes the withAuth gate and the
    // game actually pauses — STATUS.PAUSED is broadcast to the room. (Before the
    // fix this silently emitted MANAGER.UNAUTHORIZED and no-opped.)
    ioEmitted.length = 0
    reSocket.handlers.get(EVENTS.MANAGER.PAUSE_GAME)!({ gameId: game.gameId })

    expect(
      reSocket.emitted.some((e) => e.event === EVENTS.MANAGER.UNAUTHORIZED),
    ).toBe(false)

    const pausedBroadcast = ioEmitted.find(
      (e) =>
        e.event === EVENTS.GAME.STATUS &&
        (e.payload as { name?: string }).name === STATUS.PAUSED,
    )
    expect(pausedBroadcast).toBeDefined()
    expect(
      (pausedBroadcast!.payload as { data?: { reason?: string } }).data?.reason,
    ).toBe("paused")
  })

  it("(negative guard) a MANAGER.RECONNECT with a NON-matching clientId does NOT log the socket in", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    managerAuth.logout(managerSocket as unknown as Socket)
    game.setManagerDisconnected()

    // A stranger socket whose clientId does NOT match the game's manager.
    const strangerSocket = makeFakeSocket("sock-stranger", "client-stranger")
    gameSocketHandlers(ctxOf(strangerSocket))
    strangerSocket.handlers.get(EVENTS.MANAGER.RECONNECT)!({
      gameId: game.gameId,
    })

    // getManagerGame does not resolve a game for this clientId, so no login and
    // the stranger gets the expired/reset bounce instead.
    expect(managerAuth.isLogged(strangerSocket as unknown as Socket)).toBe(false)
    expect(
      strangerSocket.emitted.some((e) => e.event === EVENTS.GAME.RESET),
    ).toBe(true)
  })
})
