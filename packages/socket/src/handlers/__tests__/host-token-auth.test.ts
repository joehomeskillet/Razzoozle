// Security test: host-token auth backward compatibility
//
// Verifies that the host-token P2a auth works correctly with isValidHostToken helper:
// 1. Correct hostToken returns true
// 2. Wrong hostToken returns false
// 3. Missing hostToken returns true (legacy path)

import type { Quizz } from "@razzoozle/common/types/game"
import { EXAMPLE_QUIZZ } from "@razzoozle/common/constants"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import Game from "@razzoozle/socket/services/game"
import { isValidHostToken } from "@razzoozle/socket/utils/game"
import { describe, expect, it } from "vitest"

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
        return true
      },
    }
  },
}

describe("host-token validation (isValidHostToken helper)", () => {
  it("correct hostToken returns true", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )

    const correctToken = (game as unknown as { hostTokenValue: string }).hostTokenValue
    const payload = { gameId: game.gameId, hostToken: correctToken }

    expect(isValidHostToken(game, payload)).toBe(true)
  })

  it("wrong hostToken returns false", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )

    const wrongToken = "totally-wrong-token-uuid"
    const payload = { gameId: game.gameId, hostToken: wrongToken }

    expect(isValidHostToken(game, payload)).toBe(false)
  })

  it("missing hostToken returns true (legacy path)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )

    const payload = { gameId: game.gameId }
    // No hostToken field

    expect(isValidHostToken(game, payload)).toBe(true)
  })

  it("null payload returns true (legacy path)", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )

    expect(isValidHostToken(game, null)).toBe(true)
  })

  it("hostToken is included in GAME_CREATED emit", () => {
    const managerSocket = makeFakeSocket("sock-manager", "client-manager")
    
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      EXAMPLE_QUIZZ as unknown as Quizz,
    )

    // Find GAME_CREATED emit
    const gameCreated = managerSocket.emitted.find(
      (e) => e.event === "manager:gameCreated",
    )

    expect(gameCreated).toBeDefined()
    const payload = gameCreated?.payload as Record<string, unknown>
    expect(payload.hostToken).toBeDefined()
    expect(typeof payload.hostToken).toBe("string")
    // hostToken should be a valid UUID (36 chars with hyphens, or can be any string)
    expect((payload.hostToken as string).length).toBeGreaterThan(0)
  })
})
