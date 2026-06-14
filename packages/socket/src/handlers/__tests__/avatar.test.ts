import { AVATAR_MAX_BYTES, AVATARS_GENERIC, EVENTS } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"

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
    const { default: Registry } = await import("@razzia/socket/services/registry")
    Registry.getInstance().cleanup()
    vi.restoreAllMocks()

    if (prevConfigPath === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = prevConfigPath
    }

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("SET_AVATAR accepts a generic avatar, stores it and re-broadcasts player updates", async () => {
    const { default: Game } = await import("@razzia/socket/services/game")
    const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")
    const { default: Registry } = await import("@razzia/socket/services/registry")

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
      avatar: AVATARS_GENERIC[0],
    })
    await vi.waitFor(() => {
      expect(game.players[0]?.avatar).toBe(AVATARS_GENERIC[0])
    })

    expect(
      ioEmitted.some(
        (e) =>
          e.target === "manager-sock" &&
          e.event === EVENTS.MANAGER.NEW_PLAYER &&
          (e.payload as { avatar?: string }).avatar === AVATARS_GENERIC[0],
      ),
    ).toBe(true)
    expect(
      ioEmitted.some((e) => e.event === EVENTS.PLAYER.UPDATE_LEADERBOARD),
    ).toBe(true)
  })

  it("SET_AVATAR stores a data URL as an ephemeral per-game WebP URL", async () => {
    const { default: Game } = await import("@razzia/socket/services/game")
    const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")
    const { default: Registry } = await import("@razzia/socket/services/registry")

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

  it("rejects oversized uploaded avatars", async () => {
    const { default: Game } = await import("@razzia/socket/services/game")
    const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")
    const { default: Registry } = await import("@razzia/socket/services/registry")

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
    const { default: Game } = await import("@razzia/socket/services/game")
    const { saveEphemeralAvatar } = await import("@razzia/socket/services/config")

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
