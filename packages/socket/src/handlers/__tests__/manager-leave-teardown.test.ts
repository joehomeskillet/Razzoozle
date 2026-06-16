// Regression test for W1-A: game-teardown on intentional manager exit.
//
// The confirmed P0 ghost-game bug: handleManagerLeave treated an intentional
// MANAGER.LEAVE (host clicks Exit) the SAME as a transport-level disconnect, so
// a not-yet-started lobby lingered host-less yet joinable for the full 5-minute
// empty-grace window.
//
// The fix distinguishes intent from a transport drop:
//   - intentional leave on a NOT-yet-started lobby  → tear down NOW
//     (notifyManagerGone + registry.removeGame): un-joinable immediately.
//   - a transport disconnect                        → keep the empty-grace
//     window (setManagerDisconnected + markGameAsEmpty) so a wifi blip can
//     reconnect within EMPTY_GAME_TIMEOUT.
//
// Driven by the same lightweight fake sockets + fake IO harness as
// lobby-disconnect.test.ts / manager-reauth-on-reconnect.test.ts, against a real
// Game instance + gameSocketHandlers. The Registry singleton is cleaned up
// between tests.

import { EVENTS, EXAMPLE_QUIZZ } from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { gameSocketHandlers } from "@razzoozle/socket/handlers/game"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import Game from "@razzoozle/socket/services/game"
import Registry from "@razzoozle/socket/services/registry"
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

describe("W1-A — game teardown on intentional manager leave", () => {
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

  it("an intentional MANAGER.LEAVE on a not-yet-started lobby removes the game immediately (un-joinable, RESET broadcast)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)
    gameSocketHandlers(ctxOf(managerSocket))

    const inviteCode = game.inviteCode
    const gameId = game.gameId

    expect(registry.getGameById(gameId)).toBeDefined()
    expect(registry.getGameByInviteCode(inviteCode)).toBeDefined()
    expect(game.started).toBe(false)

    // Host clicks Exit in the lobby.
    managerSocket.handlers.get(EVENTS.MANAGER.LEAVE)!({ gameId })

    // The game is gone from the registry — no host-less joinable lobby remains.
    expect(registry.getGameById(gameId)).toBeUndefined()
    expect(registry.getGameByInviteCode(inviteCode)).toBeUndefined()
    expect(registry.getGameCount()).toBe(0)

    // It was NOT parked in the empty-grace list (it was torn down, not graced).
    expect(registry.getEmptyGameCount()).toBe(0)

    // Anyone still in the room got a clean RESET (manager gone).
    const resets = ioEmitted.filter(
      (e) => e.target === gameId && e.event === EVENTS.GAME.RESET,
    )
    expect(resets.length).toBeGreaterThanOrEqual(1)
  })

  it("after an intentional lobby leave, a fresh PLAYER.JOIN on the old invite code is rejected (not joinable)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)
    gameSocketHandlers(ctxOf(managerSocket))

    const inviteCode = game.inviteCode

    managerSocket.handlers.get(EVENTS.MANAGER.LEAVE)!({ gameId: game.gameId })

    // A latecomer tries to join via the now-dead invite code.
    const joinerSocket = makeFakeSocket("sock-joiner", "client-joiner")
    gameSocketHandlers(ctxOf(joinerSocket))
    joinerSocket.handlers.get(EVENTS.PLAYER.JOIN)!(inviteCode)

    // They are told the game does not exist — the ghost lobby is unreachable.
    expect(
      joinerSocket.emitted.some(
        (e) =>
          e.event === EVENTS.GAME.ERROR_MESSAGE &&
          e.payload === "errors:game.notFound",
      ),
    ).toBe(true)
    expect(
      joinerSocket.emitted.some((e) => e.event === EVENTS.GAME.SUCCESS_ROOM),
    ).toBe(false)
  })

  it("(regression) a transport DISCONNECT on a lobby game keeps it alive during the grace window (parked empty, not removed)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)
    gameSocketHandlers(ctxOf(managerSocket))

    const gameId = game.gameId

    // The transport drops (wifi blip / tab background) — NOT an intentional Exit.
    managerSocket.handlers.get("disconnect")!()

    // The game still exists and is parked in the empty-grace list (reconnectable),
    // and the manager is marked disconnected — NOT torn down.
    expect(registry.getGameById(gameId)).toBeDefined()
    expect(registry.getGameCount()).toBe(1)
    expect(registry.getEmptyGameCount()).toBe(1)
    expect(game.manager.connected).toBe(false)

    // No teardown RESET was broadcast (the grace path does not notifyManagerGone).
    const resets = ioEmitted.filter(
      (e) => e.target === gameId && e.event === EVENTS.GAME.RESET,
    )
    expect(resets.length).toBe(0)
  })

  it("(regression) a transport DISCONNECT followed by MANAGER.RECONNECT restores the game (grace + reconnect intact)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)
    gameSocketHandlers(ctxOf(managerSocket))

    const gameId = game.gameId

    managerSocket.handlers.get("disconnect")!()
    expect(game.manager.connected).toBe(false)
    expect(registry.getEmptyGameCount()).toBe(1)

    // The host reconnects on a fresh socket with the same durable clientId.
    const reSocket = makeFakeSocket("sock-manager-2", "client-manager")
    gameSocketHandlers(ctxOf(reSocket))
    reSocket.handlers.get(EVENTS.MANAGER.RECONNECT)!({ gameId })

    // Reconnect succeeded and the game is reactivated (off the empty list).
    expect(
      reSocket.emitted.some(
        (e) => e.event === EVENTS.MANAGER.SUCCESS_RECONNECT,
      ),
    ).toBe(true)
    expect(game.manager.connected).toBe(true)
    expect(registry.getGameById(gameId)).toBeDefined()
    expect(registry.getEmptyGameCount()).toBe(0)
  })

  it("(regression) an intentional MANAGER.LEAVE on a STARTED game keeps the grace path (not torn down immediately)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)
    gameSocketHandlers(ctxOf(managerSocket))

    const gameId = game.gameId

    // Force the game into the "started" state (no clean public setter; mirrors
    // lobby-disconnect.test.ts's started getter override).
    Object.defineProperty(game, "started", {
      get: () => true,
      configurable: true,
    })

    managerSocket.handlers.get(EVENTS.MANAGER.LEAVE)!({ gameId })

    // An in-progress game is NOT torn down on an intentional leave — it keeps the
    // empty-grace + reconnect path so a mid-game host can return.
    expect(registry.getGameById(gameId)).toBeDefined()
    expect(registry.getGameCount()).toBe(1)
    expect(registry.getEmptyGameCount()).toBe(1)
    expect(game.manager.connected).toBe(false)
  })
})
