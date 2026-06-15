// WP-17 — reject-with-reason + submission category.
//
// Covers the widened REJECT_SUBMISSION schema (optional reason + optional
// category override) and the category flow through SUBMIT_QUESTION, end-to-end
// against a real on-disk config tree. Kept in its own file (not the larger
// submission.test.ts) to avoid clobbering the existing #5 moderation suite.
//
// ── Isolation model ──────────────────────────────────────────────────────────
// Mirrors submission.test.ts exactly: services/config.ts captures CONFIG_PATH
// ONCE at import time, so each test sets a fresh CONFIG_PATH then
// `vi.resetModules()` + dynamic import re-binds the whole graph against the temp
// dir. comfyui#generateImage is mocked so no GPU/network op runs (the SUBMIT and
// REJECT paths never call it, but the handler module imports it at load time).

import { EVENTS } from "@razzia/common/constants"
import type { Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const generateImageMock = vi.fn<(prompt: string) => Promise<string>>()
vi.mock("@razzia/socket/services/comfyui", () => ({
  generateImage: (prompt: string) => generateImageMock(prompt),
}))

type HandlersModule = typeof import("@razzia/socket/handlers/manager")
type ConfigModule = typeof import("@razzia/socket/services/config")
type ManagerModule = typeof import("@razzia/socket/services/manager")

interface FakeSocket {
  id: string
  handshake: { auth: { clientId?: string } }
  emitted: Array<{ event: string; payload: unknown }>
  broadcastEmitted: Array<{ event: string; payload: unknown }>
  handlers: Map<string, (...args: unknown[]) => void>
  emit: (event: string, payload?: unknown) => boolean
  on: (event: string, handler: (...args: unknown[]) => void) => void
  broadcast: { emit: (event: string, payload?: unknown) => boolean }
}

const makeFakeSocket = (id: string, clientId = id): FakeSocket => {
  const socket: FakeSocket = {
    id,
    handshake: { auth: { clientId } },
    emitted: [],
    broadcastEmitted: [],
    handlers: new Map(),
    emit(event, payload) {
      socket.emitted.push({ event, payload })

      return true
    },
    on(event, handler) {
      socket.handlers.set(event, handler)
    },
    broadcast: {
      emit(event, payload) {
        socket.broadcastEmitted.push({ event, payload })

        return true
      },
    },
  }

  return socket
}

const ctxOf = (socket: FakeSocket) => ({ socket }) as unknown as SocketContext

const lastEmit = (socket: FakeSocket, event: string): unknown => {
  const hits = socket.emitted.filter((e) => e.event === event)

  return hits.length ? hits[hits.length - 1].payload : undefined
}
const countEmit = (socket: FakeSocket, event: string): number =>
  socket.emitted.filter((e) => e.event === event).length

const validQuestion = (overrides: Record<string, unknown> = {}) => ({
  question: "What is the capital of France?",
  type: "choice",
  answers: ["Paris", "London", "Berlin", "Madrid"],
  solutions: [0],
  cooldown: 5,
  time: 20,
  ...overrides,
})

const validSubmission = (overrides: Record<string, unknown> = {}) => ({
  submittedBy: "Alice",
  question: validQuestion(),
  ...overrides,
})

let tmpDir: string
let prevConfigPath: string | undefined

let handlers: HandlersModule
let config: ConfigModule
let managerMod: ManagerModule

const loadGraph = async (): Promise<void> => {
  vi.resetModules()
  config = await import("@razzia/socket/services/config")
  managerMod = await import("@razzia/socket/services/manager")
  handlers = await import("@razzia/socket/handlers/manager")
}

beforeEach(async () => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-reject-test-"))
  process.env.CONFIG_PATH = tmpDir

  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})

  generateImageMock.mockReset()
  generateImageMock.mockResolvedValue("/media/gen-abc12345.png")

  await loadGraph()
  config.initConfig()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()

  if (prevConfigPath === undefined) {
    delete process.env.CONFIG_PATH
  } else {
    process.env.CONFIG_PATH = prevConfigPath
  }

  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

const readSubmissionFiles = (): Array<Record<string, unknown>> => {
  const dir = path.join(tmpDir, "submissions")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")))
}

const login = (socket: FakeSocket) => {
  managerMod.default.login(socket as unknown as Socket)
}

const seedPending = (socket: FakeSocket, overrides = {}): string => {
  socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(
    validSubmission(overrides),
  )
  const files = readSubmissionFiles()

  return files[files.length - 1].id as string
}

// ── REJECT_SUBMISSION — widened schema (reason + category) ────────────────────

describe("REJECT_SUBMISSION with reason / category (auth-gated)", () => {
  it("reject with a reason → rejectionReason persisted on disk", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      reason: "Duplicate of an existing question.",
    })

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)

    const rec = config.getSubmissionById(id)
    expect(rec?.status).toBe("rejected")
    expect(rec?.rejectionReason).toBe("Duplicate of an existing question.")

    const onDisk = readSubmissionFiles()[0]
    expect(onDisk.status).toBe("rejected")
    expect(onDisk.rejectionReason).toBe("Duplicate of an existing question.")
  })

  it("reject with a category override → category persisted on disk", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      category: "history",
    })

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)
    const rec = config.getSubmissionById(id)
    expect(rec?.status).toBe("rejected")
    expect(rec?.category).toBe("history")
  })

  it("reject with both reason and category → both persisted", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      reason: "Off-topic.",
      category: "other",
    })

    const rec = config.getSubmissionById(id)
    expect(rec?.rejectionReason).toBe("Off-topic.")
    expect(rec?.category).toBe("other")
  })

  it("reject with NO reason/category (back-compat) → status rejected, no extra fields written", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({ id })

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)
    const onDisk = readSubmissionFiles()[0]
    expect(onDisk.status).toBe("rejected")
    // Absent fields must NOT be written (no `undefined`/null keys).
    expect(onDisk).not.toHaveProperty("rejectionReason")
    expect(onDisk).not.toHaveProperty("category")
  })

  it("reject with reason > 500 chars → SUBMISSION_ERROR, status unchanged", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      reason: "x".repeat(501),
    })

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(1)
    // Untouched: still pending, no reason recorded.
    expect(config.getSubmissionById(id)?.status).toBe("pending")
  })

  it("reject with an unknown category → SUBMISSION_ERROR, status unchanged", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      category: "not-a-real-category",
    })

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(1)
    expect(config.getSubmissionById(id)?.status).toBe("pending")
  })

  it("reject on an unauthenticated socket → UNAUTHORIZED, submission untouched", () => {
    const socket = makeFakeSocket("sock-anon", "client-anon")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket)
    // No login().

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      reason: "should not apply",
    })

    expect(countEmit(socket, EVENTS.MANAGER.UNAUTHORIZED)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)
    const rec = config.getSubmissionById(id)
    expect(rec?.status).toBe("pending")
    expect(rec?.rejectionReason).toBeUndefined()
  })
})

// ── SUBMIT_QUESTION — public category flow ────────────────────────────────────

describe("SUBMIT_QUESTION category flow (public)", () => {
  it("submit WITH a valid category → category persisted on the pending record", () => {
    const socket = makeFakeSocket("sock-pub")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(
      validSubmission({ category: "science" }),
    )

    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)

    const onDisk = readSubmissionFiles()[0]
    expect(onDisk.status).toBe("pending")
    expect(onDisk.category).toBe("science")
  })

  it("submit WITHOUT a category → no category key written (back-compat)", () => {
    const socket = makeFakeSocket("sock-pub")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(validSubmission())

    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(1)
    const onDisk = readSubmissionFiles()[0]
    expect(onDisk).not.toHaveProperty("category")
  })

  it("submit with an unknown category → SUBMISSION_ERROR, nothing persisted", () => {
    const socket = makeFakeSocket("sock-pub")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(
      validSubmission({ category: "totally-bogus" }),
    )

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(0)
    expect(readSubmissionFiles()).toHaveLength(0)
  })

  it("public category survives a reject category override at moderation time", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = seedPending(socket, { category: "sports" })
    expect(config.getSubmissionById(id)?.category).toBe("sports")

    login(socket)
    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({
      id,
      category: "geography",
    })

    expect(config.getSubmissionById(id)?.category).toBe("geography")
    expect(config.getSubmissionById(id)?.status).toBe("rejected")
  })
})
