// W2A — Running-games admin panel (MANAGER.LIST_GAMES / GAMES_DATA / END_GAME).
//
// LIST_GAMES emits GAMES_DATA carrying a GameSummary[] (compact, no quiz
// content / solutions). END_GAME tears down a game the requester OWNS — ownership
// is verified via registry.getManagerGame(gameId, clientId), NEVER getGameById,
// so a manager can never kill a foreign game.
//
// Uses the same lightweight fake sockets + fake IO harness as
// manager-leave-teardown.test.ts, against real Game instances + the real
// managerSocketHandlers. The manager auth singleton is driven directly via
// manager.login (the handlers are manager.withAuth-gated). The Registry singleton
// is cleaned up between tests.

import { EVENTS, EXAMPLE_QUIZZ } from "@razzoozle/common/constants"
import type { GameSummary, Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import { managerSocketHandlers } from "@razzoozle/socket/handlers/manager"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import manager from "@razzoozle/socket/services/manager"
import Game from "@razzoozle/socket/services/game"
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

const makeGame = (managerSocket: FakeSocket): Game => {
  const game = new Game(
    fakeIo as unknown as Server,
    managerSocket as unknown as Socket,
    EXAMPLE_QUIZZ as unknown as Quizz,
  )

  return game
}

describe("W2A — running-games admin panel (LIST_GAMES / END_GAME)", () => {
  let registry: Registry = Registry.getInstance()

  beforeEach(() => {
    registry = Registry.getInstance()
    registry.cleanup()
    ioEmitted.length = 0
  })

  afterEach(() => {
    registry.cleanup()
    // Drop the auth flags this test set so it can't leak into other suites.
    manager.logout({
      handshake: { auth: { clientId: "client-a" } },
    } as unknown as Socket)
    manager.logout({
      handshake: { auth: { clientId: "client-b" } },
    } as unknown as Socket)
  })

  it("LIST_GAMES emits GAMES_DATA with one summary per live game (expected fields, no quiz content)", () => {
    const sockA = makeFakeSocket("sock-a", "client-a")
    const gameA = makeGame(sockA)
    registry.addGame(gameA)

    const sockB = makeFakeSocket("sock-b", "client-b")
    const gameB = makeGame(sockB)
    registry.addGame(gameB)

    // Authenticate the requesting manager, then bind handlers + request the list.
    manager.login(sockA as unknown as Socket)
    managerSocketHandlers(ctxOf(sockA))
    sockA.handlers.get(EVENTS.MANAGER.LIST_GAMES)!()

    const data = sockA.emitted.find(
      (e) => e.event === EVENTS.MANAGER.GAMES_DATA,
    )
    expect(data).toBeDefined()

    const summaries = data!.payload as GameSummary[]
    expect(summaries).toHaveLength(2)

    const a = summaries.find((s) => s.gameId === gameA.gameId)!
    expect(a).toMatchObject({
      gameId: gameA.gameId,
      inviteCode: gameA.inviteCode,
      subject: EXAMPLE_QUIZZ.subject,
      playerCount: 0,
      started: false,
      managerConnected: true,
    })
    expect(typeof a.createdAt).toBe("number")

    // Anti-cheat: the summary leaks no quiz content / solutions.
    expect(a).not.toHaveProperty("quizz")
    expect(a).not.toHaveProperty("questions")
    expect(a).not.toHaveProperty("solutions")
  })

  it("LIST_GAMES without auth emits UNAUTHORIZED and no GAMES_DATA", () => {
    const sockA = makeFakeSocket("sock-a", "client-a")
    registry.addGame(makeGame(sockA))

    // No manager.login() — the withAuth gate must reject.
    managerSocketHandlers(ctxOf(sockA))
    sockA.handlers.get(EVENTS.MANAGER.LIST_GAMES)!()

    expect(
      sockA.emitted.some((e) => e.event === EVENTS.MANAGER.UNAUTHORIZED),
    ).toBe(true)
    expect(
      sockA.emitted.some((e) => e.event === EVENTS.MANAGER.GAMES_DATA),
    ).toBe(false)
  })

  it("END_GAME removes a game the requester OWNS (RESET broadcast, gone from registry)", () => {
    const sockA = makeFakeSocket("sock-a", "client-a")
    const gameA = makeGame(sockA)
    registry.addGame(gameA)
    const gameId = gameA.gameId
    const inviteCode = gameA.inviteCode

    manager.login(sockA as unknown as Socket)
    managerSocketHandlers(ctxOf(sockA))
    sockA.handlers.get(EVENTS.MANAGER.END_GAME)!({ gameId })

    // The owned game is gone from the registry — no joinable ghost remains.
    expect(registry.getGameById(gameId)).toBeUndefined()
    expect(registry.getGameByInviteCode(inviteCode)).toBeUndefined()
    expect(registry.getGameCount()).toBe(0)

    // Anyone still in the room got a clean RESET (manager gone).
    const resets = ioEmitted.filter(
      (e) => e.target === gameId && e.event === EVENTS.GAME.RESET,
    )
    expect(resets.length).toBeGreaterThanOrEqual(1)
  })

  it("END_GAME for a game owned by a DIFFERENT client is a no-op (foreign game survives)", () => {
    // gameB is owned by client-b; client-a must not be able to end it.
    const sockB = makeFakeSocket("sock-b", "client-b")
    const gameB = makeGame(sockB)
    registry.addGame(gameB)
    const foreignGameId = gameB.gameId

    const sockA = makeFakeSocket("sock-a", "client-a")
    manager.login(sockA as unknown as Socket)
    managerSocketHandlers(ctxOf(sockA))

    // client-a tries to kill client-b's game by its gameId.
    sockA.handlers.get(EVENTS.MANAGER.END_GAME)!({ gameId: foreignGameId })

    // The foreign game survives — ownership is verified via getManagerGame.
    expect(registry.getGameById(foreignGameId)).toBeDefined()
    expect(registry.getGameCount()).toBe(1)

    // No teardown RESET was broadcast for the foreign game.
    const resets = ioEmitted.filter(
      (e) => e.target === foreignGameId && e.event === EVENTS.GAME.RESET,
    )
    expect(resets.length).toBe(0)
  })
})
