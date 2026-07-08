// Tests for Feature #5 — public question submission + admin moderation +
// AI image generation. Covers base-spec §8.1 cases 1-12 plus a GENERATE_IMAGE
// handler test with ComfyUI mocked.
//
// ── Isolation model ──────────────────────────────────────────────────────────
// services/config.ts captures the config root ONCE at import time
//   (`const inContainerPath = process.env.CONFIG_PATH`).
// To give each test its own fresh on-disk tree we set CONFIG_PATH in beforeEach,
// then `vi.resetModules()` + dynamic `import()` so the WHOLE module graph
// (config.ts, services/manager.ts, handlers/manager.ts, comfyui.ts) re-reads it
// against the temp dir. Each test gets an isolated tmp tree removed in afterEach.
// This mirrors services/__tests__/config.test.ts exactly.
//
// ── ComfyUI mock ─────────────────────────────────────────────────────────────
// The GENERATE_IMAGE handler calls services/comfyui#generateImage. We mock that
// module so no real GPU/network op runs. The factory is registered with
// vi.mock (hoisted); a per-test default impl is set in beforeEach. vi.mock's
// registry survives vi.resetModules(), so the dynamically re-imported
// handlers/manager picks up the mocked generateImage.

import { EVENTS } from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import type { Socket } from "@razzoozle/common/types/game/socket"
import { STATUS } from "@razzoozle/common/types/game/status"
import type { SocketContext } from "@razzoozle/socket/handlers/types"
import { submissionValidator } from "@razzoozle/common/validators/submission"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { buildRound, makePlayer } from "../../services/game/__tests__/helpers"

// Mock the ComfyUI module so generateImage never performs a real op. A mutable
// holder lets each test swap the resolved value / make it reject.
const generateImageMock = vi.fn<(prompt: string) => Promise<string>>()
vi.mock("@razzoozle/socket/services/comfyui", () => ({
  generateImage: (prompt: string) => generateImageMock(prompt),
}))

// ── Module types (re-imported per test against the fresh CONFIG_PATH) ─────────
type HandlersModule = typeof import("@razzoozle/socket/handlers/manager")
type ConfigModule = typeof import("@razzoozle/socket/services/config")
type ManagerModule = typeof import("@razzoozle/socket/services/manager")

// ── Lightweight socket fake (handlers/__tests__ style) ────────────────────────
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

const ctxOf = (socket: FakeSocket) =>
  ({ socket }) as unknown as SocketContext

// Find the last payload emitted for a given event on a socket.
const lastEmit = (socket: FakeSocket, event: string): unknown => {
  const hits = socket.emitted.filter((e) => e.event === event)

  return hits.length ? hits[hits.length - 1].payload : undefined
}
const countEmit = (socket: FakeSocket, event: string): number =>
  socket.emitted.filter((e) => e.event === event).length

// A valid question object (choice, 2+ answers, solution present) — passes
// questionValidator.superRefine.
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

// Flush pending microtasks so the GENERATE_IMAGE async IIFE settles.
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((r) => setImmediate(r))
}

let tmpDir: string
let prevConfigPath: string | undefined

let handlers: HandlersModule
let config: ConfigModule
let managerMod: ManagerModule

// (Re)load the whole graph so config.ts captures the current CONFIG_PATH and
// handlers/manager + services/manager bind to the SAME fresh singletons.
const loadGraph = async (): Promise<void> => {
  vi.resetModules()
  config = await import("@razzoozle/socket/services/config")
  managerMod = await import("@razzoozle/socket/services/manager")
  handlers = await import("@razzoozle/socket/handlers/manager")
}

beforeEach(async () => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-submission-test-"))
  process.env.CONFIG_PATH = tmpDir

  // Silence config.ts diagnostic logs.
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

// Read the on-disk submissions dir directly (the source of truth case 4/5/6
// assert against). Returns the parsed JSON files.
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

// ── §8.1 case 1-3: submissionValidator ────────────────────────────────────────

describe("submissionValidator", () => {
  it("(1) rejects an invalid submittedBy (< 4 and > 20 chars)", () => {
    const tooShort = submissionValidator.safeParse(
      validSubmission({ submittedBy: "Bob" }), // 3 chars
    )
    expect(tooShort.success).toBe(false)
    if (!tooShort.success) {
      expect(tooShort.error.issues[0].message).toBe(
        "errors:auth.usernameTooShort",
      )
    }

    const tooLong = submissionValidator.safeParse(
      validSubmission({ submittedBy: "x".repeat(21) }), // 21 chars
    )
    expect(tooLong.success).toBe(false)
    if (!tooLong.success) {
      expect(tooLong.error.issues[0].message).toBe(
        "errors:auth.usernameTooLong",
      )
    }

    // Boundary: exactly 4 chars is accepted.
    expect(
      submissionValidator.safeParse(validSubmission({ submittedBy: "Anna" }))
        .success,
    ).toBe(true)
  })

  it("(2) rejects a question that fails superRefine", () => {
    // A 'choice' with only 1 answer is rejected.
    const oneAnswer = submissionValidator.safeParse(
      validSubmission({
        question: validQuestion({ answers: ["only one"], solutions: [0] }),
      }),
    )
    expect(oneAnswer.success).toBe(false)

    // superRefine specifically: a 'choice' with valid answers but NO solution
    // is rejected with errors:quizz.noSolution (the schema-level array checks
    // all pass; only the cross-field superRefine fails).
    const noSolution = submissionValidator.safeParse(
      validSubmission({
        question: validQuestion({
          answers: ["Paris", "London"],
          solutions: undefined,
        }),
      }),
    )
    expect(noSolution.success).toBe(false)
    if (!noSolution.success) {
      expect(
        noSolution.error.issues.some(
          (iss) => iss.message === "errors:quizz.noSolution",
        ),
      ).toBe(true)
    }
  })

  it("(3) strips unknown fields on valid input", () => {
    const result = submissionValidator.safeParse({
      ...validSubmission(),
      malicious: "drop me",
      question: { ...validQuestion(), extra: "drop me too" },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty("malicious")
      expect(result.data.question).not.toHaveProperty("extra")
      // The known fields survive.
      expect(result.data.submittedBy).toBe("Alice")
      expect(result.data.question.question).toBe(
        "What is the capital of France?",
      )
    }
  })
})

// ── §8.1 case 4-6, 10: SUBMIT_QUESTION handler ────────────────────────────────

describe("SUBMIT_QUESTION handler", () => {
  it("(4) valid payload → file written to config/submissions/<id>.json, status pending", async () => {
    const socket = makeFakeSocket("sock-1")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(validSubmission())
    await flush()

    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)

    const files = readSubmissionFiles()
    expect(files).toHaveLength(1)
    expect(files[0].status).toBe("pending")
    expect(files[0].submittedBy).toBe("Alice")
    expect((files[0].question as Record<string, unknown>).question).toBe(
      "What is the capital of France?",
    )
    // The persisted file name matches the record id and is a safe slug.
    const dir = path.join(tmpDir, "submissions")
    const onDisk = fs.readdirSync(dir)
    expect(onDisk).toEqual([`${files[0].id as string}.json`])
    expect(files[0].id).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("(5) invalid payload → SUBMISSION_ERROR emitted, no file written", () => {
    const socket = makeFakeSocket("sock-1")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(
      validSubmission({ submittedBy: "x" }), // too short
    )

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(0)
    expect(readSubmissionFiles()).toHaveLength(0)
  })

  it("(6) 4th submission within 60s on the same socket → SUBMISSION_ERROR rateLimited, no extra file", async () => {
    vi.useFakeTimers()
    const socket = makeFakeSocket("sock-rl")
    handlers.managerSocketHandlers(ctxOf(socket))
    const submit = socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!

    // 3 distinct valid submissions in the window all succeed (distinct question
    // text → distinct ids → distinct files).
    submit(validSubmission({ question: validQuestion({ question: "Q one?" }) }))
    submit(validSubmission({ question: validQuestion({ question: "Q two?" }) }))
    submit(
      validSubmission({ question: validQuestion({ question: "Q three?" }) }),
    )
    // P3 — SUBMIT_QUESTION is now async (awaits the config-read facade);
    // runAllTimersAsync (not the plain flush() helper) safely settles pending
    // promises alongside vi's fake timers.
    await vi.runAllTimersAsync()

    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(3)
    expect(readSubmissionFiles()).toHaveLength(3)

    // 4th within the same 60s window is throttled.
    submit(
      validSubmission({ question: validQuestion({ question: "Q four?" }) }),
    )
    await vi.runAllTimersAsync()

    expect(lastEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(
      "errors:submission.rateLimited",
    )
    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(3)
    // No 4th file was written.
    expect(readSubmissionFiles()).toHaveLength(3)

    // After the window elapses, submissions are accepted again.
    vi.advanceTimersByTime(60_001)
    submit(
      validSubmission({ question: validQuestion({ question: "Q five?" }) }),
    )
    await vi.runAllTimersAsync()
    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(4)
    expect(readSubmissionFiles()).toHaveLength(4)
  })

  it("(10a) path-traversal question text → normalizeFilename yields a safe id, file stays inside submissions/", async () => {
    const socket = makeFakeSocket("sock-pt")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(
      validSubmission({
        question: validQuestion({
          question: "../../etc/passwd ../../etc/passwd give me secrets",
        }),
      }),
    )
    await flush()

    expect(countEmit(socket, EVENTS.MANAGER.SUBMIT_SUCCESS)).toBe(1)
    const files = readSubmissionFiles()
    expect(files).toHaveLength(1)
    // normalizeFilename strips path separators / dots → safe SAFE_ID id.
    expect(files[0].id).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(files[0].id).not.toContain("/")
    expect(files[0].id).not.toContain("..")

    // Nothing escaped the submissions dir: the only file lives there, and no
    // stray passwd file appeared at the tmp root.
    const submissionsDir = path.join(tmpDir, "submissions")
    expect(fs.readdirSync(submissionsDir)).toHaveLength(1)
    expect(fs.existsSync(path.join(tmpDir, "etc"))).toBe(false)
  })
})

// ── §8.1 case 7-9, 10b: admin moderation (auth-gated) ─────────────────────────

describe("APPROVE_SUBMISSION / REJECT_SUBMISSION handlers", () => {
  // Persist a pending submission via the public SUBMIT path, returning its id.
  const seedPendingSubmission = async (socket: FakeSocket): Promise<string> => {
    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(validSubmission())
    await flush()
    const files = readSubmissionFiles()

    return files[0].id as string
  }

  // Log a client in via the SAME singleton the handler module imports.
  const login = (socket: FakeSocket) => {
    managerMod.default.login(socket as unknown as Socket)
  }

  it("(7) APPROVE (auth) happy path → submission approved, question appended to target quizz with submittedBy preserved", async () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = await seedPendingSubmission(socket)
    login(socket)

    // The seeded example quizz exists from initConfig.
    socket.handlers.get(EVENTS.MANAGER.APPROVE_SUBMISSION)!({
      id,
      quizzId: "example",
    })
    // P3 — APPROVE_SUBMISSION's mutations (updateQuizz/updateSubmission) now
    // land after an internal `await readQuizzById`/`readSubmissionById`; flush
    // before asserting on-disk state.
    await flush()

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)
    expect(countEmit(socket, EVENTS.MANAGER.UNAUTHORIZED)).toBe(0)

    // Submission marked approved on disk.
    const submission = config.getSubmissionById(id)
    expect(submission?.status).toBe("approved")

    // Question appended to the target quizz with submittedBy preserved in the
    // persisted quizz JSON.
    const quizz = config.getQuizzById("example")
    const appended = quizz.questions[quizz.questions.length - 1]
    expect(appended.question).toBe("What is the capital of France?")
    expect(appended.submittedBy).toBe("Alice")

    // And it is the real on-disk quizz file (not just an in-memory object).
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "quizz", "example.json"), "utf-8"),
    )
    const lastOnDisk = onDisk.questions[onDisk.questions.length - 1]
    expect(lastOnDisk.submittedBy).toBe("Alice")
  })

  it("(8) APPROVE on an unauthenticated socket → UNAUTHORIZED emitted, submission untouched", async () => {
    const socket = makeFakeSocket("sock-anon", "client-anon")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = await seedPendingSubmission(socket)
    // No login() call.

    socket.handlers.get(EVENTS.MANAGER.APPROVE_SUBMISSION)!({
      id,
      quizzId: "example",
    })

    expect(countEmit(socket, EVENTS.MANAGER.UNAUTHORIZED)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)
    // Status unchanged.
    expect(config.getSubmissionById(id)?.status).toBe("pending")
    // The quizz did NOT gain the question.
    const quizz = config.getQuizzById("example")
    expect(
      quizz.questions.some(
        (q) => q.question === "What is the capital of France?",
      ),
    ).toBe(false)
  })

  it("(9) REJECT (auth) → submission file status updated to rejected", async () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))

    const id = await seedPendingSubmission(socket)
    login(socket)

    socket.handlers.get(EVENTS.MANAGER.REJECT_SUBMISSION)!({ id })

    expect(countEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe(0)
    expect(config.getSubmissionById(id)?.status).toBe("rejected")
    // On-disk file reflects the new status.
    const onDisk = readSubmissionFiles()
    expect(onDisk[0].status).toBe("rejected")
  })

  it("(10b) APPROVE with id='../evil' → assertSafeId rejects, SUBMISSION_ERROR, no escape", () => {
    const socket = makeFakeSocket("sock-admin", "client-admin")
    handlers.managerSocketHandlers(ctxOf(socket))
    login(socket)

    // Plant a sentinel file outside the submissions dir to prove it is not read
    // or repointed.
    fs.writeFileSync(
      path.join(tmpDir, "evil.json"),
      JSON.stringify({ secret: true }),
    )

    socket.handlers.get(EVENTS.MANAGER.APPROVE_SUBMISSION)!({
      id: "../evil",
      quizzId: "example",
    })

    expect(lastEmit(socket, EVENTS.MANAGER.SUBMISSION_ERROR)).toBe("Invalid id")
    expect(countEmit(socket, EVENTS.MANAGER.UNAUTHORIZED)).toBe(0)
    // Nothing approved; the example quizz did not change.
    const quizz = config.getQuizzById("example")
    expect(
      quizz.questions.some(
        (q) => q.question === "What is the capital of France?",
      ),
    ).toBe(false)
    // assertSafeId throws BEFORE any read of the sentinel; it is untouched.
    expect(
      JSON.parse(fs.readFileSync(path.join(tmpDir, "evil.json"), "utf-8")),
    ).toEqual({ secret: true })

    // Defense-in-depth: the config CRUD itself rejects a traversal id too.
    expect(() => config.getSubmissionById("../evil")).toThrow("Invalid id")
  })
})

// ── §8.1 case 11: ANTI-CHEAT — broadcasts carry submittedBy, never solutions ──

describe("anti-cheat: SHOW_QUESTION / SELECT_ANSWER broadcasts", () => {
  it("(11) after a submitted question is loaded, BOTH broadcasts carry submittedBy and NEITHER carries solutions/correct", async () => {
    vi.useFakeTimers()

    // A quizz whose only question is an approved-style submission (carries
    // submittedBy AND a server-side solution that must never leak).
    const quizz: Quizz = {
      subject: "Anti-cheat",
      questions: [
        {
          question: "What is 2 + 2?",
          type: "choice",
          answers: ["3", "4", "5", "6"],
          solutions: [1],
          cooldown: 5,
          time: 20,
          submittedBy: "Alice",
        },
      ],
    }

    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: {
        enabled: false,
        clockSync: true,
        preloadNextQuestion: true,
        answerAck: true,
        scoreboardBroadcastThrottleMs: 100,
        maxLatencyCompensationMs: 150,
      },
    })

    // Mark the round started so newQuestion() proceeds, then run the full
    // SHOW_QUESTION → SELECT_ANSWER flow. The two `sleep()` legs + the fake
    // cooldown.start() (resolves immediately) are flushed by runAllTimersAsync.
    ;(ctx.round as unknown as { started: boolean }).started = true
    const newQuestion = (
      ctx.round as unknown as { newQuestion: () => Promise<void> }
    ).newQuestion()
    await vi.runAllTimersAsync()
    await newQuestion

    const showQuestion = ctx.broadcasts.find(
      (b) => b.status === STATUS.SHOW_QUESTION,
    )
    const selectAnswer = ctx.broadcasts.find(
      (b) => b.status === STATUS.SELECT_ANSWER,
    )

    expect(showQuestion, "SHOW_QUESTION must be broadcast").toBeTruthy()
    expect(selectAnswer, "SELECT_ANSWER must be broadcast").toBeTruthy()

    const sq = showQuestion!.data as Record<string, unknown>
    const sa = selectAnswer!.data as Record<string, unknown>

    // Attribution is present on BOTH.
    expect(sq.submittedBy).toBe("Alice")
    expect(sa.submittedBy).toBe("Alice")

    // CRITICAL anti-cheat: neither broadcast leaks the answer key. Assert the
    // ABSENCE of solutions/correct explicitly on BOTH payloads.
    expect(sq).not.toHaveProperty("solutions")
    expect(sq).not.toHaveProperty("correct")
    expect(sa).not.toHaveProperty("solutions")
    expect(sa).not.toHaveProperty("correct")
    // Belt-and-braces: no serialized payload may contain the key either.
    expect(JSON.stringify(sq)).not.toContain("solutions")
    expect(JSON.stringify(sq)).not.toContain("correct")
    expect(JSON.stringify(sa)).not.toContain("solutions")
    expect(JSON.stringify(sa)).not.toContain("correct")
  })
})

// ── §8.1 case 12: getSubmissionsMeta ──────────────────────────────────────────

describe("getSubmissionsMeta", () => {
  it("(12) returns SubmissionMeta[] with `question` as the question-text string (not the full object)", async () => {
    const socket = makeFakeSocket("sock-meta")
    handlers.managerSocketHandlers(ctxOf(socket))
    socket.handlers.get(EVENTS.MANAGER.SUBMIT_QUESTION)!(validSubmission())
    await flush()

    const meta = config.getSubmissionsMeta()
    expect(meta).toHaveLength(1)

    const entry = meta[0]
    // question is the TEXT string, not the nested question object.
    expect(typeof entry.question).toBe("string")
    expect(entry.question).toBe("What is the capital of France?")
    // Meta shape: lightweight fields only, no nested answers/solutions object.
    expect(entry.submittedBy).toBe("Alice")
    expect(entry.status).toBe("pending")
    expect(typeof entry.id).toBe("string")
    expect(typeof entry.submittedAt).toBe("string")
    expect(entry).not.toHaveProperty("answers")
    // The meta entry is plainly a SubmissionMeta (no solutions leaked here).
    expect(JSON.stringify(entry)).not.toContain("solutions")
  })
})

// ── GENERATE_IMAGE handler (ComfyUI mocked) ───────────────────────────────────

describe("GENERATE_IMAGE handler (ComfyUI mocked)", () => {
  it("prompt > 300 chars → IMAGE_ERROR and generateImage is NOT called", async () => {
    const socket = makeFakeSocket("sock-img")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.GENERATE_IMAGE)!({
      prompt: "a".repeat(301),
    })
    await flush()

    expect(countEmit(socket, EVENTS.MANAGER.IMAGE_ERROR)).toBe(1)
    expect(countEmit(socket, EVENTS.MANAGER.IMAGE_GENERATED)).toBe(0)
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it("secret-pattern prompt → IMAGE_ERROR and generateImage is NOT called", async () => {
    const socket = makeFakeSocket("sock-img")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.GENERATE_IMAGE)!({
      prompt: "draw a cat with my key sk-ABCD1234secretleak in the corner",
    })
    await flush()

    expect(lastEmit(socket, EVENTS.MANAGER.IMAGE_ERROR)).toBe(
      "errors:submission.promptRejected",
    )
    expect(countEmit(socket, EVENTS.MANAGER.IMAGE_GENERATED)).toBe(0)
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it("valid prompt → IMAGE_GENERATED with a /media/ url", async () => {
    const socket = makeFakeSocket("sock-img")
    handlers.managerSocketHandlers(ctxOf(socket))

    socket.handlers.get(EVENTS.MANAGER.GENERATE_IMAGE)!({
      prompt: "a serene watercolor mountain landscape at dawn",
    })
    await flush()

    expect(generateImageMock).toHaveBeenCalledOnce()
    expect(countEmit(socket, EVENTS.MANAGER.IMAGE_ERROR)).toBe(0)
    const payload = lastEmit(socket, EVENTS.MANAGER.IMAGE_GENERATED) as {
      url: string
    }
    expect(payload.url).toMatch(/^\/media\//)
  })

  it("second valid call within 30s → throttled IMAGE_ERROR, generateImage called only once", async () => {
    vi.useFakeTimers()
    const socket = makeFakeSocket("sock-img")
    handlers.managerSocketHandlers(ctxOf(socket))
    const generate = socket.handlers.get(EVENTS.MANAGER.GENERATE_IMAGE)!

    generate({ prompt: "first valid prompt" })
    await vi.runAllTimersAsync()

    expect(countEmit(socket, EVENTS.MANAGER.IMAGE_GENERATED)).toBe(1)
    expect(generateImageMock).toHaveBeenCalledOnce()

    // Second call within the 30s cooldown is rejected before reaching ComfyUI.
    generate({ prompt: "second valid prompt" })
    await vi.runAllTimersAsync()

    expect(lastEmit(socket, EVENTS.MANAGER.IMAGE_ERROR)).toBe(
      "errors:submission.imageRateLimited",
    )
    expect(countEmit(socket, EVENTS.MANAGER.IMAGE_GENERATED)).toBe(1)
    expect(generateImageMock).toHaveBeenCalledOnce()
  })
})
