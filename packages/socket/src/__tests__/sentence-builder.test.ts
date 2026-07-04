// Sentence-builder (chunk reassembly) tests: anti-cheat, shuffle reuse, shape guard.

import type { Player, Quizz } from "@razzoozle/common/types/game"
import { STATUS } from "@razzoozle/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildRound,
  DISABLED_LL,
  makePlayer,
  makeSocket,
} from "@razzoozle/socket/services/game/__tests__/helpers"

describe("sentence-builder anti-cheat (SELECT_ANSWER)", () => {
  const MANAGER_ID = "manager-socket"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sentenceQuizz = (): Quizz =>
    ({
      subject: "Sentence Builder",
      questions: [
        {
          question: "Reassemble",
          type: "sentence-builder",
          chunks: ["The", "quick", "brown", "fox"],
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  const playerOf = (): Player[] => [makePlayer("p")]

  it("SELECT_ANSWER contains shuffledChunks", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()
    await promise

    const selectAnswer = ctx.broadcasts.find(
      (b) => b.status === STATUS.SELECT_ANSWER,
    )
    expect(selectAnswer).toBeDefined()
    const data = selectAnswer?.data as Record<string, unknown>
    expect(Array.isArray(data.shuffledChunks)).toBe(true)
  })

  it("shuffledChunks is a permutation of chunks", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()
    await promise

    const selectAnswer = ctx.broadcasts.find(
      (b) => b.status === STATUS.SELECT_ANSWER,
    )
    const data = selectAnswer?.data as Record<string, unknown>
    const shuffled = data.shuffledChunks as string[]
    const original = ["The", "quick", "brown", "fox"]

    expect(shuffled.sort()).toEqual(original.sort())
  })

  it("SELECT_ANSWER NEVER carries chunks field", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()
    await promise

    const selectAnswer = ctx.broadcasts.find(
      (b) => b.status === STATUS.SELECT_ANSWER,
    )
    const serialized = JSON.stringify(selectAnswer)
    expect(serialized).not.toContain('"chunks"')
  })
})

describe("sentence-builder manager SHOW_RESPONSES", () => {
  const MANAGER_ID = "manager-socket"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sentenceQuizz = (): Quizz =>
    ({
      subject: "Sentence Builder",
      questions: [
        {
          question: "Reassemble",
          type: "sentence-builder",
          chunks: ["One", "Two", "Three"],
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  const playerOf = (): Player[] => [makePlayer("p")]

  it("manager SHOW_RESPONSES carries chunks (post-reveal)", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const socket = makeSocket("player-1", "player-1")
    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()

    ctx.round.selectAnswer(socket.socket, -1, undefined, "One Two Three")
    await vi.runAllTimersAsync()
    await promise

    const managerResponses = ctx.sends.find(
      (s) => s.target === MANAGER_ID && s.status === STATUS.SHOW_RESPONSES,
    )
    expect(managerResponses).toBeDefined()

    const data = managerResponses?.data as Record<string, unknown>
    expect(data.chunks).toEqual(["One", "Two", "Three"])
  })

  it("chunks never reach player-facing messages", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const socket = makeSocket("player-1", "player-1")
    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()

    ctx.round.selectAnswer(socket.socket, -1, undefined, "One Two Three")
    await vi.runAllTimersAsync()
    await promise

    const playerFacing = [
      ...ctx.broadcasts.map((b) => ({ status: b.status, data: b.data })),
      ...ctx.sends
        .filter((s) => s.target !== MANAGER_ID)
        .map((s) => ({ status: s.status, data: s.data })),
    ]

    for (const entry of playerFacing) {
      const serialized = JSON.stringify(entry)
      expect(serialized).not.toContain('"chunks"')
    }
  })
})

describe("sentence-builder shape guard", () => {
  const MANAGER_ID = "manager-socket"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sentenceQuizz = (): Quizz =>
    ({
      subject: "Sentence Builder",
      questions: [
        {
          question: "Reassemble",
          type: "sentence-builder",
          chunks: ["This", "is", "text"],
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  const playerOf = (): Player[] => [makePlayer("p")]

  it("rejects array answerId (text-only guard)", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const socket = makeSocket("player-1", "player-1")
    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()

    ctx.round.selectAnswer(socket.socket, [0, 1] as never, undefined, "")
    await vi.runAllTimersAsync()
    await promise

    const responses = ctx.sends.find(
      (s) => s.target === MANAGER_ID && s.status === STATUS.SHOW_RESPONSES,
    )
    expect(responses).toBeDefined()
  })

  it("rejects empty answerText", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const socket = makeSocket("player-1", "player-1")
    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()

    ctx.round.selectAnswer(socket.socket, -1, undefined, "")
    await vi.runAllTimersAsync()
    await promise

    expect(ctx.broadcasts.some((b) => b.status === STATUS.SELECT_ANSWER)).toBe(
      true,
    )
  })
})

describe("sentence-builder shuffle storage", () => {
  const MANAGER_ID = "manager-socket"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sentenceQuizz = (): Quizz =>
    ({
      subject: "Sentence Builder",
      questions: [
        {
          question: "Reassemble",
          type: "sentence-builder",
          chunks: ["A", "B", "C", "D"],
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  const playerOf = (): Player[] => [makePlayer("p")]

  it("shuffledChunks stored for reconnects", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()
    await promise

    const selectAnswer = ctx.broadcasts.find(
      (b) => b.status === STATUS.SELECT_ANSWER,
    )
    const data = selectAnswer?.data as Record<string, unknown>
    expect(data.shuffledChunks).toBeDefined()
    expect(Array.isArray(data.shuffledChunks)).toBe(true)
    expect((data.shuffledChunks as string[]).length).toBe(4)
  })
})

describe("sentence-builder text normalization", () => {
  const MANAGER_ID = "manager-socket"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sentenceQuizz = (): Quizz =>
    ({
      subject: "Sentence Builder",
      questions: [
        {
          question: "Reassemble",
          type: "sentence-builder",
          chunks: ["It", "is", "a", "big", "ball", "of", "gas"],
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  const playerOf = (): Player[] => [makePlayer("p")]

  it("textResponses histogram for manager", async () => {
    const ctx = buildRound({
      quizz: sentenceQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    const socket = makeSocket("player-1", "player-1")
    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()

    ctx.round.selectAnswer(socket.socket, -1, undefined, "It is a big ball of gas")
    await vi.runAllTimersAsync()
    await promise

    const responses = ctx.sends.find(
      (s) => s.target === MANAGER_ID && s.status === STATUS.SHOW_RESPONSES,
    )
    expect(responses).toBeDefined()

    const data = responses?.data as Record<string, unknown>
    expect(data.textResponses).toBeDefined()
    expect(typeof data.textResponses).toBe("object")
  })
})
