import {
  AVATAR_MAX_BYTES,
  AVATAR_SVG_MAX_CHARS,
  EVENTS,
} from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"

// Mirrors @dicebear/core toDataUri() output: a url-encoded "data:image/svg+xml,…".
const SVG_AVATAR =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2010%2010%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23abc%22%2F%3E%3C%2Fsvg%3E"

const makeQuizz = (): Quizz => ({
  subject: "Avatar",
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 1,
      time: 5,
    },
  ],
})

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
      socket.joined.push(room)
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

describe("player avatars", () => {
  let tmpDir = ""
  let prevConfigPath: string | undefined

  beforeEach(() => {
    prevConfigPath = process.env.CONFIG_PATH
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-avatar-test-"))
    process.env.CONFIG_PATH = tmpDir
    ioEmitted.length = 0
    vi.resetModules()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(async () => {
    const { default: Registry } = await import("@razzoozle/socket/services/registry")
    Registry.getInstance().cleanup()
    vi.restoreAllMocks()

    if (prevConfigPath === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = prevConfigPath
    }

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("SET_AVATAR stores a data URL as an ephemeral per-game WebP URL", async () => {
    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { gameSocketHandlers } = await import("@razzoozle/socket/handlers/game")
    const { default: Registry } = await import("@razzoozle/socket/services/registry")

    const managerSocket = makeFakeSocket("manager-sock", "manager-client")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      makeQuizz(),
    )
    Registry.getInstance().addGame(game)

    const playerSocket = makeFakeSocket("player-sock", "player-client")
    await game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    playerSocket.handlers.get(EVENTS.PLAYER.SET_AVATAR)!({
      gameId: game.gameId,
      avatar: PNG_1PX,
    })

    const expectedUrl = `/media/avatars/${game.gameId}/player-sock.webp`
    await vi.waitFor(() => {
      expect(game.players[0]?.avatar).toBe(expectedUrl)
    })
    expect(
      fs.existsSync(
        path.join(tmpDir, "media", "avatars", game.gameId, "player-sock.webp"),
      ),
    ).toBe(true)
  })

  it("SET_AVATAR accepts an SVG data-URI avatar and stores it inline (no transcode)", async () => {
    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { gameSocketHandlers } = await import("@razzoozle/socket/handlers/game")
    const { default: Registry } = await import("@razzoozle/socket/services/registry")

    const managerSocket = makeFakeSocket("manager-sock", "manager-client")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      makeQuizz(),
    )
    Registry.getInstance().addGame(game)

    const playerSocket = makeFakeSocket("player-sock", "player-client")
    await game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    playerSocket.handlers.get(EVENTS.PLAYER.SET_AVATAR)!({
      gameId: game.gameId,
      avatar: SVG_AVATAR,
    })

    await vi.waitFor(() => {
      expect(game.players[0]?.avatar).toBe(SVG_AVATAR)
    })

    // Stored verbatim as the SVG data-URI, NOT transcoded to a /media/.../*.webp path.
    expect(game.players[0]?.avatar).not.toContain("/media/avatars/")
    expect(game.players[0]?.avatar).not.toContain(".webp")
    expect(
      fs.existsSync(path.join(tmpDir, "media", "avatars", game.gameId)),
    ).toBe(false)
    expect(
      playerSocket.emitted.some((e) => e.event === EVENTS.GAME.ERROR_MESSAGE),
    ).toBe(false)
  })

  it("rejects an oversized SVG data-URI avatar with errors:avatar.tooLarge", async () => {
    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { gameSocketHandlers } = await import("@razzoozle/socket/handlers/game")
    const { default: Registry } = await import("@razzoozle/socket/services/registry")

    const managerSocket = makeFakeSocket("manager-sock", "manager-client")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      makeQuizz(),
    )
    Registry.getInstance().addGame(game)

    const playerSocket = makeFakeSocket("player-sock", "player-client")
    await game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    const oversized = `data:image/svg+xml,${"a".repeat(AVATAR_SVG_MAX_CHARS + 1)}`
    playerSocket.handlers.get(EVENTS.PLAYER.SET_AVATAR)!({
      gameId: game.gameId,
      avatar: oversized,
    })

    await vi.waitFor(() => {
      expect(
        playerSocket.emitted.some(
          (e) =>
            e.event === EVENTS.GAME.ERROR_MESSAGE &&
            e.payload === "errors:avatar.tooLarge",
        ),
      ).toBe(true)
    })

    expect(game.players[0]?.avatar).toBeUndefined()
  })

  it("rejects oversized uploaded avatars", async () => {
    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { gameSocketHandlers } = await import("@razzoozle/socket/handlers/game")
    const { default: Registry } = await import("@razzoozle/socket/services/registry")

    const managerSocket = makeFakeSocket("manager-sock", "manager-client")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      makeQuizz(),
    )
    Registry.getInstance().addGame(game)

    const playerSocket = makeFakeSocket("player-sock", "player-client")
    await game.join(playerSocket as unknown as Socket, "Alice")
    gameSocketHandlers(ctxOf(playerSocket))

    playerSocket.handlers.get(EVENTS.PLAYER.SET_AVATAR)!({
      gameId: game.gameId,
      avatar: `data:image/png;base64,${Buffer.alloc(
        AVATAR_MAX_BYTES + 1,
      ).toString("base64")}`,
    })
    await vi.waitFor(() => {
      expect(
        playerSocket.emitted.some(
          (e) => e.event === EVENTS.GAME.ERROR_MESSAGE,
        ),
      ).toBe(true)
    })

    expect(game.players[0]?.avatar).toBeUndefined()
    expect(
      fs.existsSync(path.join(tmpDir, "media", "avatars", game.gameId)),
    ).toBe(false)
  })

  it("disposeMetrics removes ephemeral avatar files for the game", async () => {
    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { saveEphemeralAvatar } = await import("@razzoozle/socket/services/config")

    const managerSocket = makeFakeSocket("manager-sock", "manager-client")
    const game = new Game(
      fakeIo as unknown as Server,
      managerSocket as unknown as Socket,
      makeQuizz(),
    )

    await saveEphemeralAvatar(game.gameId, "player-sock", PNG_1PX)
    const avatarDir = path.join(tmpDir, "media", "avatars", game.gameId)
    expect(fs.existsSync(avatarDir)).toBe(true)

    game.disposeMetrics()

    expect(fs.existsSync(avatarDir)).toBe(false)
  })
})
