// Tests for WP B-automode-socket (FIX 8 + FIX 9):
//   FIX 8 (immediacy): toggling auto-mode ON while a result screen is already
//     showing arms the auto-advance timer for THAT screen immediately (instead
//     of waiting for the next phase boundary), and guards against a duplicate
//     timer if one is already pending.
//   FIX 9 (countdown emit): an armed auto-advance carries the advance duration
//     (autoAdvanceMs) as an OPTIONAL field on the EXISTING screen payload the
//     client already receives (SHOW_RESULT for the post-results screen,
//     SHOW_LEADERBOARD for the between-questions screen) so the client can render
//     a local countdown.
//
// Same private-field reflection + fake-timer approach as round-lifecycle.test.ts:
// scheduleAuto/clearAuto/setAutoMode run through their real production paths; we
// drive showResults() and read the captured sends via helpers.ts' buildRound.

import type { Question, Quizz } from "@razzoozle/common/types/game"
import { STATUS } from "@razzoozle/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildRound, DISABLED_LL, makePlayer } from "./helpers"

const AUTO_RESULT_MS = 6000
const AUTO_LEADERBOARD_MS = 5000

const makeQuizz = (): Quizz => ({
  subject: "Auto",
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [1],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Q2",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
})

const setStarted = (round: unknown, value: boolean): void => {
  ;(round as { started: boolean }).started = value
}
const setCurrentQuestion = (round: unknown, value: number): void => {
  ;(round as { currentQuestion: number }).currentQuestion = value
}
const runShowResults = (round: unknown, question: Question): void => {
  ;(round as { showResults: (q: Question) => void }).showResults(question)
}
const getAutoTimer = (round: unknown): ReturnType<typeof setTimeout> | null =>
  (round as { autoTimer: ReturnType<typeof setTimeout> | null }).autoTimer

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("RoundManager auto-mode: FIX 8 mid-screen immediacy", () => {
  it("toggling auto-mode ON during an active result screen arms the advance for the current screen and re-sends SHOW_RESULT with autoAdvanceMs", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)

    // Auto-mode is OFF when results show: no timer armed, and the SHOW_RESULT
    // payload carries NO countdown.
    runShowResults(ctx.round, quizz.questions[0])
    expect(getAutoTimer(ctx.round)).toBeNull()
    const initialResult = ctx.sends.find(
      (s) => s.status === STATUS.SHOW_RESULT,
    )
    expect(initialResult).toBeDefined()
    expect(
      (initialResult?.data as { autoAdvanceMs?: number }).autoAdvanceMs,
    ).toBeUndefined()

    const sendsBefore = ctx.sends.length

    // Host toggles auto-mode ON while the result screen is up.
    ctx.round.setAutoMode(true)

    // FIX 8: the advance for the CURRENT screen is armed immediately.
    expect(getAutoTimer(ctx.round)).not.toBeNull()

    // FIX 9: SHOW_RESULT is re-sent carrying the countdown so the client can
    // render a local timer for the screen it is already on.
    const reSent = ctx.sends
      .slice(sendsBefore)
      .find((s) => s.status === STATUS.SHOW_RESULT)
    expect(reSent).toBeDefined()
    expect(reSent?.target).toBe("alice")
    expect((reSent?.data as { autoAdvanceMs?: number }).autoAdvanceMs).toBe(
      AUTO_RESULT_MS,
    )

    // And the armed advance actually fires on time → leaderboard after the leg.
    vi.advanceTimersByTime(AUTO_RESULT_MS)
    expect(ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD)).toBe(
      true,
    )
  })

  it("guards against a duplicate timer: a second setAutoMode(true) does not re-arm or re-send while an advance is already pending", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    runShowResults(ctx.round, quizz.questions[0])

    ctx.round.setAutoMode(true)
    const timerAfterFirst = getAutoTimer(ctx.round)
    const countAfterFirst = ctx.sends.filter(
      (s) => s.status === STATUS.SHOW_RESULT,
    ).length

    // Idempotent toggle: timer is unchanged and no extra SHOW_RESULT is sent.
    ctx.round.setAutoMode(true)
    expect(getAutoTimer(ctx.round)).toBe(timerAfterFirst)
    expect(
      ctx.sends.filter((s) => s.status === STATUS.SHOW_RESULT).length,
    ).toBe(countAfterFirst)
  })

  it("does nothing when no result screen is active (toggle before any results)", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)

    // No results have been shown → resultScreenActive is false → no immediate arm.
    ctx.round.setAutoMode(true)
    expect(getAutoTimer(ctx.round)).toBeNull()
    expect(ctx.sends.some((s) => s.status === STATUS.SHOW_RESULT)).toBe(false)
  })
})

describe("RoundManager auto-mode: FIX 9 countdown on the normal end-of-results path", () => {
  it("when auto-mode is already on at results time, SHOW_RESULT carries autoAdvanceMs and SHOW_LEADERBOARD carries the leaderboard duration", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    ctx.round.setAutoMode(true)

    runShowResults(ctx.round, quizz.questions[0])

    // SHOW_RESULT broadcast at results time already carries the countdown.
    const result = ctx.sends.find((s) => s.status === STATUS.SHOW_RESULT)
    expect((result?.data as { autoAdvanceMs?: number }).autoAdvanceMs).toBe(
      AUTO_RESULT_MS,
    )

    // First leg fires → SHOW_LEADERBOARD carries its own countdown.
    vi.advanceTimersByTime(AUTO_RESULT_MS)
    const leaderboard = ctx.sends.find(
      (s) => s.status === STATUS.SHOW_LEADERBOARD,
    )
    expect(
      (leaderboard?.data as { autoAdvanceMs?: number }).autoAdvanceMs,
    ).toBe(AUTO_LEADERBOARD_MS)
  })

  it("manual mode (auto off) carries NO autoAdvanceMs on either screen", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)

    runShowResults(ctx.round, quizz.questions[0])
    const result = ctx.sends.find((s) => s.status === STATUS.SHOW_RESULT)
    expect(
      (result?.data as { autoAdvanceMs?: number }).autoAdvanceMs,
    ).toBeUndefined()

    // Manually show the leaderboard (manager-driven) → no countdown field.
    ctx.round.showLeaderboard()
    const leaderboard = ctx.sends.find(
      (s) => s.status === STATUS.SHOW_LEADERBOARD,
    )
    expect(
      (leaderboard?.data as { autoAdvanceMs?: number }).autoAdvanceMs,
    ).toBeUndefined()
  })
})
