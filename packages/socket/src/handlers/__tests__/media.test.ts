import { EVENTS } from "@razzoozle/common/constants"
import type { Server } from "@razzoozle/common/types/game/socket"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"

interface FakeSocket {
  id: string
  handshake: { auth: { clientId?: string } }
  emitted: Array<{ event: string; payload: unknown }>
  handlers: Map<string, (...args: unknown[]) => void>
  emit: (event: string, payload?: unknown) => boolean
  on: (event: string, handler: (...args: unknown[]) => void) => void
}

const makeFakeSocket = (): FakeSocket => {
  const socket: FakeSocket = {
    id: "manager-sock",
    handshake: { auth: { clientId: "manager-client" } },
    emitted: [],
    handlers: new Map(),
    emit(event, payload) {
      socket.emitted.push({ event, payload })

      return true
    },
    on(event, handler) {
      socket.handlers.set(event, handler)
    },
  }

  return socket
}

const fakeIo = {} as Server

const ctxOf = (socket: FakeSocket) =>
  ({ io: fakeIo, socket }) as unknown as SocketContext

describe("media storage and socket handlers", () => {
  let tmpDir = ""
  let prevConfigPath: string | undefined

  beforeEach(() => {
    prevConfigPath = process.env.CONFIG_PATH
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-media-test-"))
    process.env.CONFIG_PATH = tmpDir
    vi.resetModules()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()

    if (prevConfigPath === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = prevConfigPath
    }

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("saveMediaFile, getMediaList and deleteMediaFile round-trip an uploaded image", async () => {
    const config = await import("@razzoozle/socket/services/config")

    const saved = await config.saveMediaFile(
      PNG_1PX,
      "Question Image.png",
      "questions",
    )

    expect(saved.category).toBe("questions")
    expect(saved.type).toBe("image")
    expect(saved.source).toBe("upload")
    expect(saved.url).toMatch(/^\/media\/questions\/question-image-[\w-]+\.webp$/)
    expect(fs.existsSync(path.join(tmpDir, saved.url.slice(1)))).toBe(true)
    expect(config.getMediaList()).toEqual([saved])

    config.deleteMediaFile(saved.id)

    expect(config.getMediaList()).toEqual([])
    expect(fs.existsSync(path.join(tmpDir, saved.url.slice(1)))).toBe(false)
  })

  it("MEDIA.UPLOAD emits UPLOAD_SUCCESS and fresh DATA; MEDIA.DELETE removes and re-emits DATA", async () => {
    const { mediaSocketHandlers } = await import("@razzoozle/socket/handlers/media")
    const { default: manager } = await import("@razzoozle/socket/services/manager")

    const socket = makeFakeSocket()
    manager.login(socket as never)
    mediaSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MEDIA.UPLOAD)!({
      filename: "Slide.png",
      dataUrl: PNG_1PX,
      category: "questions",
    })

    await vi.waitFor(() => {
      expect(
        socket.emitted.some((e) => e.event === EVENTS.MEDIA.UPLOAD_SUCCESS),
      ).toBe(true)
    })
    const dataEvents = socket.emitted.filter((e) => e.event === EVENTS.MEDIA.DATA)
    expect(dataEvents).toHaveLength(1)
    const uploaded = (dataEvents[0].payload as Array<{ id: string; url: string }>)[0]
    expect(uploaded.url).toMatch(/^\/media\/questions\/slide-[\w-]+\.webp$/)

    socket.handlers.get(EVENTS.MEDIA.DELETE)!({ id: uploaded.id })

    await vi.waitFor(() => {
      const latestData = socket.emitted
        .filter((e) => e.event === EVENTS.MEDIA.DATA)
        .at(-1)?.payload
      expect(latestData).toEqual([])
    })
  })
})
