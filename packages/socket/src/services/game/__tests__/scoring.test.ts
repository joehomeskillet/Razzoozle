// Scoring + answer-path unit tests for low-latency mode.
//
// These assert the SERVER-AUTHORITATIVE guarantees the spec requires:
//   (a) points are derived strictly from the server-receive timestamp
//       (timeToPoint over the server clock) — fake timers drive "now",
//   (b) a duplicate answer (same clientId AND same clientMessageId) is a no-op,
//   (c) an answer just-before the deadline counts, just-after is rejected,
//   (d) with the flag OFF, points are byte-identical to today and the same
//       deadline that would reject in LL mode is irrelevant (no deadline gate).
//
// All time is controlled with vi.useFakeTimers()/setSystemTime so Date.now()
// inside timeToPoint is deterministic. We never trust a client timestamp.

import { EVENTS } from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import type { AnswerAck } from "@razzoozle/common/types/game/socket"
import { timeToPoint } from "@razzoozle/socket/utils/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  answerCount,
  answeredPoints,
  buildRound,
  DISABLED_LL,
  enabledLL,
  makePlayer,
  makeSocket,
  openQuestion,
} from "./helpers"

// A single 4-choice question, correct = index 1, 20s window, 5s cooldown.
const QUIZZ: Quizz = {
  subject: "Scoring",
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [1],
      cooldown: 5,
      time: 20,
    },
  ],
}

const QUESTION_START = 1_000_000_000_000 // Fixed epoch ms for determinism

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(QUESTION_START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("server-receive scoring (timeToPoint)", () => {
  it("scores from the server clock at receipt, not the client", () => {
    const ll = enabledLL()
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })

    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // Server "now" advances 5s after question start before the tap is received.
    vi.setSystemTime(QUESTION_START + 5_000)

    const { socket } = makeSocket("alice")
    ctx.round.selectAnswer(socket, 1, "msg-1")

    // TimeToPoint(startTime, 20) at +5s = 1000 - (1000/20)*5 = 750.
    const expected = timeToPoint(QUESTION_START, 20) // Computed at same "now"
    expect(answeredPoints(ctx.round, "alice")).toBe(750)
    expect(answeredPoints(ctx.round, "alice")).toBe(expected)
  })

  it("awards full points for an instant answer and decays linearly", () => {
    const ll = enabledLL()
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("a"), makePlayer("b")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // A answers at t+0 (full 1000), b at t+10s (half = 500).
    ctx.round.selectAnswer(makeSocket("a").socket, 1, "a-1")
    expect(answeredPoints(ctx.round, "a")).toBe(1000)

    vi.setSystemTime(QUESTION_START + 10_000)
    ctx.round.selectAnswer(makeSocket("b").socket, 1, "b-1")
    expect(answeredPoints(ctx.round, "b")).toBe(500)
  })
})

describe("duplicate-answer rejection", () => {
  it("is a no-op for a second tap from the same clientId", () => {
    const ll = enabledLL()
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    const first = makeSocket("alice")
    ctx.round.selectAnswer(first.socket, 1, "msg-1")
    const pointsAfterFirst = answeredPoints(ctx.round, "alice")

    // Second tap from the SAME clientId, later in time, different answer + id.
    vi.setSystemTime(QUESTION_START + 9_000)
    const second = makeSocket("alice")
    ctx.round.selectAnswer(second.socket, 3, "msg-2")

    // Exactly one stored answer; the original points are untouched.
    expect(answerCount(ctx.round)).toBe(1)
    expect(answeredPoints(ctx.round, "alice")).toBe(pointsAfterFirst)

    // The duplicate is acked as `duplicate` (LL mode + answerAck on).
    const ack = second.emitted.find((e) => e.event === EVENTS.PLAYER.ANSWER_ACK)
      ?.payload as AnswerAck | undefined
    expect(ack?.accepted).toBe(false)
    expect(ack?.reason).toBe("duplicate")
  })

  it("dedups a re-sent SAME tap by clientMessageId even across sockets", () => {
    const ll = enabledLL()
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // First accepted tap carries clientMessageId "dup".
    ctx.round.selectAnswer(makeSocket("alice").socket, 1, "dup")
    expect(answerCount(ctx.round)).toBe(1)

    // Socket.io auto-retry of the SAME tap (same clientMessageId) — rejected.
    const retry = makeSocket("alice", "alice-new-socket")
    ctx.round.selectAnswer(retry.socket, 1, "dup")

    expect(answerCount(ctx.round)).toBe(1)
    const ack = retry.emitted.find((e) => e.event === EVENTS.PLAYER.ANSWER_ACK)
      ?.payload as AnswerAck | undefined
    expect(ack?.reason).toBe("duplicate")
  })
})

describe("deadline (just-before vs just-after)", () => {
  // Deadline = start + time*1000 = start + 20s. Compensation default 150ms.
  it("accepts an answer that lands inside the window", () => {
    const ll = enabledLL({ maxLatencyCompensationMs: 150 })
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // 1ms before the raw deadline.
    vi.setSystemTime(QUESTION_START + 20_000 - 1)
    const s = makeSocket("alice")
    ctx.round.selectAnswer(s.socket, 1, "in-time")

    expect(answerCount(ctx.round)).toBe(1)
    const ack = s.emitted.find((e) => e.event === EVENTS.PLAYER.ANSWER_ACK)
      ?.payload as AnswerAck | undefined
    expect(ack?.accepted).toBe(true)
    expect(ack?.reason).toBe("ok")
  })

  it("accepts within the server-side compensation grace window", () => {
    const ll = enabledLL({ maxLatencyCompensationMs: 150 })
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // 100ms past the raw deadline but within the 150ms compensation grace.
    vi.setSystemTime(QUESTION_START + 20_000 + 100)
    const s = makeSocket("alice")
    ctx.round.selectAnswer(s.socket, 1, "grace")

    expect(answerCount(ctx.round)).toBe(1)
  })

  it("rejects an answer past deadline + compensation as too_late", () => {
    const ll = enabledLL({ maxLatencyCompensationMs: 150 })
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // 151ms past the deadline — just beyond the 150ms grace.
    vi.setSystemTime(QUESTION_START + 20_000 + 151)
    const s = makeSocket("alice")
    ctx.round.selectAnswer(s.socket, 1, "late")

    expect(answerCount(ctx.round)).toBe(0)
    const ack = s.emitted.find((e) => e.event === EVENTS.PLAYER.ANSWER_ACK)
      ?.payload as AnswerAck | undefined
    expect(ack?.accepted).toBe(false)
    expect(ack?.reason).toBe("too_late")
  })

  it("clamps compensation to 2000ms (never client-authoritative)", () => {
    // Even a misconfigured huge compensation can't extend the window past the
    // hard 2000ms server clamp.
    const ll = enabledLL({ maxLatencyCompensationMs: 999_999 })
    const ctx = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: ll,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll,
      questionTimeSec: 20,
    })

    // 2001ms past the deadline — beyond the 2000ms clamp ⇒ rejected.
    vi.setSystemTime(QUESTION_START + 20_000 + 2_001)
    const s = makeSocket("alice")
    ctx.round.selectAnswer(s.socket, 1, "way-late")

    expect(answerCount(ctx.round)).toBe(0)
  })
})

describe("flag OFF = byte-identical scoring + no deadline gate, no ack", () => {
  it("scores the same as LL mode at the same server time", () => {
    const off = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })
    openQuestion(off.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    vi.setSystemTime(QUESTION_START + 5_000)
    off.round.selectAnswer(makeSocket("alice").socket, 1, "ignored-in-off")

    // 750 — identical to the LL-mode scoring test above.
    expect(answeredPoints(off.round, "alice")).toBe(750)
  })

  it("has NO deadline gate when disabled (a late tap still scores 0 points but is accepted)", () => {
    const off = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })
    openQuestion(off.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // Far past the LL deadline. In normal mode there is NO server deadline
    // check (the cooldown closing the window is what ends it in real play), so
    // the answer is still stored — exactly today's behaviour. timeToPoint
    // clamps to 0 past the window.
    vi.setSystemTime(QUESTION_START + 60_000)
    off.round.selectAnswer(makeSocket("alice").socket, 1)

    expect(answerCount(off.round)).toBe(1)
    expect(answeredPoints(off.round, "alice")).toBe(0)
  })

  it("emits NO answer ack and NO socket.emit ack event when disabled", () => {
    const off = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })
    openQuestion(off.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    const s = makeSocket("alice")
    off.round.selectAnswer(s.socket, 1)

    const ack = s.emitted.find((e) => e.event === EVENTS.PLAYER.ANSWER_ACK)
    expect(ack).toBeUndefined()
  })

  it("emits the answered-count immediately via socket.to() when disabled (no throttle)", () => {
    const off = buildRound({
      quizz: QUIZZ,
      players: [makePlayer("alice"), makePlayer("bob")],
      lowLatency: DISABLED_LL,
    })
    openQuestion(off.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    const s = makeSocket("alice")
    off.round.selectAnswer(s.socket, 1)

    // Normal mode publishes the count synchronously on socket.to(room).
    const count = s.roomEmitted.find(
      (e) => e.event === EVENTS.GAME.PLAYER_ANSWER,
    )
    expect(count).toBeDefined()
    expect(count?.payload).toBe(1)
  })
})
