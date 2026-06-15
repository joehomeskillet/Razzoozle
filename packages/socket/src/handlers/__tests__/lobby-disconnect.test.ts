// Characterization tests for BUG 1: lobby disconnect grace period.
//
// A transport disconnect (wifi blip, background tab) graces a lobby player
// by marking them connected: false but keeping them in the game so they can
// reconnect. They are only removed if the LOBBY_DISCONNECT_GRACE_MS window
// elapses before they return.
//
// An intentional EVENTS.PLAYER.LEAVE immediately removes the player.
// A started-game disconnect is unchanged and relies on the round/reconnect flow.
//
// Driven by lightweight fake sockets and a fake IO object against a real Game
// instance + gameSocketHandlers. The Registry singleton is cleaned up between
// tests.

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

describe("BUG 1 — lobby disconnect grace", () => {
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

  it("a lobby player disconnect keeps them (connected:false), does NOT remove, no GAME.RESET", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    const playerSocket = makeFakeSocket("sock-alice", "client-alice")
    game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    expect(game.players.length).toBe(1)
    expect(game.players[0].connected).toBe(true)

    // Fire disconnect
    playerSocket.handlers.get("disconnect")!()

    expect(game.players.length).toBe(1)
    expect(game.players[0].connected).toBe(false)

    const gameResets = ioEmitted.filter((e) => e.event === EVENTS.GAME.RESET)
    expect(gameResets.length).toBe(0)

    const playerResets = playerSocket.emitted.filter(
      (e) => e.event === EVENTS.GAME.RESET,
    )
    expect(playerResets.length).toBe(0)

    const removes = ioEmitted.filter(
      (e) => e.event === EVENTS.MANAGER.REMOVE_PLAYER,
    )
    expect(removes.length).toBe(0)
  })

  it("after a disconnect, PLAYER.RECONNECT on a new socket restores connected:true and emits SUCCESS_RECONNECT, no reset", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    const playerSocket = makeFakeSocket("sock-alice", "client-alice")
    game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    playerSocket.handlers.get("disconnect")!()
    expect(game.players[0].connected).toBe(false)

    const reSocket = makeFakeSocket("sock-alice-2", "client-alice")
    gameSocketHandlers(ctxOf(reSocket))

    reSocket.handlers.get(EVENTS.PLAYER.RECONNECT)!({ gameId: game.gameId })

    const reconnectSuccess = reSocket.emitted.some(
      (e) => e.event === EVENTS.PLAYER.SUCCESS_RECONNECT,
    )
    expect(reconnectSuccess).toBe(true)

    expect(game.players[0].connected).toBe(true)
    expect(game.players[0].id).toBe("sock-alice-2")

    const reSocketResets = reSocket.emitted.filter(
      (e) => e.event === EVENTS.GAME.RESET,
    )
    expect(reSocketResets.length).toBe(0)

    expect(
      ioEmitted.some(
        (e) =>
          e.target === "sock-manager" &&
          e.event === EVENTS.MANAGER.PLAYER_RECONNECTED &&
          (e.payload as { id?: string; username?: string }).id ===
            "sock-alice-2" &&
          (e.payload as { id?: string; username?: string }).username ===
            "Alice",
      ),
    ).toBe(true)
  })

  it("a lobby player who never returns is removed after the grace window", () => {
    vi.useFakeTimers()

    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    const playerSocket = makeFakeSocket("sock-alice", "client-alice")
    game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    playerSocket.handlers.get("disconnect")!()

    expect(game.players.length).toBe(1)

    vi.advanceTimersByTime(45_001)

    expect(game.players.length).toBe(0)

    const removes = ioEmitted.filter(
      (e) => e.event === EVENTS.MANAGER.REMOVE_PLAYER,
    )
    expect(removes.length).toBeGreaterThanOrEqual(1)

    const totals = ioEmitted.filter(
      (e) => e.event === EVENTS.GAME.TOTAL_PLAYERS,
    )
    expect(totals.length).toBeGreaterThanOrEqual(1)
  })

  it("an intentional PLAYER.LEAVE in the lobby removes the player immediately", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    const playerSocket = makeFakeSocket("sock-alice", "client-alice")
    game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    playerSocket.handlers.get(EVENTS.PLAYER.LEAVE)!({ gameId: game.gameId })

    expect(game.players.length).toBe(0)

    const removes = ioEmitted.filter(
      (e) => e.event === EVENTS.MANAGER.REMOVE_PLAYER,
    )
    expect(removes.length).toBeGreaterThanOrEqual(1)
  })

  it("(regression) a STARTED-game disconnect still graces the player (kept, connected:false), no immediate removal and no lobby timer fires", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )
    registry.addGame(game)

    const playerSocket = makeFakeSocket("sock-alice", "client-alice")
    game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    Object.defineProperty(game, "started", {
      get: () => true,
      configurable: true,
    })

    playerSocket.handlers.get("disconnect")!()

    expect(game.players.length).toBe(1)
    expect(game.players[0].connected).toBe(false)

    const lobbyTimersMap = (
      game as unknown as { lobbyDisconnectTimers: Map<string, unknown> }
    ).lobbyDisconnectTimers

    expect(lobbyTimersMap.size).toBe(0)
  })
})
