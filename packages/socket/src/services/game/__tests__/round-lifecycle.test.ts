// Characterization tests for the RoundManager auto-advance lifecycle:
//   - in auto mode, finishing a question's results schedules an automatic
//     advance: after AUTO_RESULT_MS the leaderboard is shown, then after a
//     further AUTO_LEADERBOARD_MS the next question begins,
//   - clearAuto() (reached via setAutoMode(false) and at the top of
//     newQuestion()) cancels a pending auto timer so no stray advance fires,
//   - the auto timers are guarded: if `started` flips false before they fire,
//     they bail out (no leaderboard / no advance).
//
// scheduleAuto/clearAuto are private; they are exercised exactly as production
// does — scheduleAuto runs at the end of showResults() *when autoMode is on*,
// and clearAuto runs from setAutoMode(false)/newQuestion(). We drive showResults
// (and read currentQuestion) through the same private-field reflection the shared
// helpers.ts already uses, and control the two setTimeout legs with
// vi.useFakeTimers(). The real timer constants live in round-manager.ts:
//   AUTO_RESULT_MS = 6000, AUTO_LEADERBOARD_MS = 5000.

import type { Question, Quizz } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildRound, DISABLED_LL, makePlayer } from "./helpers"

const AUTO_RESULT_MS = 6000
const AUTO_LEADERBOARD_MS = 5000

// Two-question quizz so the auto path can advance (showLeaderboard is NOT the
// last round at index 0, and questions[1] exists for the next-question leg).
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

// Reflection helpers mirroring helpers.ts' approach: poke `started`/`currentQuestion`
// and invoke the private showResults() so scheduleAuto runs through its real path.
const setStarted = (round: unknown, value: boolean): void => {
  ;(round as { started: boolean }).started = value
}
const getCurrentQuestion = (round: unknown): number =>
  (round as { currentQuestion: number }).currentQuestion
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

describe("RoundManager auto-mode: schedule after the result cooldown", () => {
  it("setAutoMode(true) + finished results schedules the leaderboard after AUTO_RESULT_MS, then the next question after AUTO_LEADERBOARD_MS", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    ctx.round.setAutoMode(true)

    // Finishing results in auto mode arms the auto timer.
    runShowResults(ctx.round, quizz.questions[0])
    expect(getAutoTimer(ctx.round)).not.toBeNull()

    // Nothing should advance before AUTO_RESULT_MS elapses.
    vi.advanceTimersByTime(AUTO_RESULT_MS - 1)
    expect(
      ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD),
    ).toBe(false)

    // First leg fires: leaderboard is shown (not the last round of two).
    vi.advanceTimersByTime(1)
    expect(
      ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD),
    ).toBe(true)
    // Still on question 0; the next-question leg hasn't fired yet.
    expect(getCurrentQuestion(ctx.round)).toBe(0)

    // Second leg fires after AUTO_LEADERBOARD_MS: advances to the next question.
    vi.advanceTimersByTime(AUTO_LEADERBOARD_MS)
    expect(getCurrentQuestion(ctx.round)).toBe(1)
  })

  it("does NOT schedule any auto timer when autoMode is off", () => {
    const quizz = makeQuizz()
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    // autoMode left false (default).

    runShowResults(ctx.round, quizz.questions[0])

    expect(getAutoTimer(ctx.round)).toBeNull()

    vi.advanceTimersByTime(AUTO_RESULT_MS + AUTO_LEADERBOARD_MS)
    expect(
      ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD),
    ).toBe(false)
    expect(getCurrentQuestion(ctx.round)).toBe(0)
  })
})

describe("RoundManager auto-mode: clearAuto cancels a pending advance", () => {
  it("setAutoMode(false) cancels a pending auto timer so no stray advance fires", () => {
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
    expect(getAutoTimer(ctx.round)).not.toBeNull()

    // Host turns auto off before the 6s leg fires → clearAuto() nulls the timer.
    ctx.round.setAutoMode(false)
    expect(getAutoTimer(ctx.round)).toBeNull()

    // Advancing well past both legs fires nothing.
    vi.advanceTimersByTime(AUTO_RESULT_MS + AUTO_LEADERBOARD_MS + 1000)
    expect(
      ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD),
    ).toBe(false)
    expect(getCurrentQuestion(ctx.round)).toBe(0)
  })

  it("the first auto leg bails out (no leaderboard, no advance) if `started` flips false before it fires", () => {
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

    // Game ends/stops out from under the pending timer.
    setStarted(ctx.round, false)

    vi.advanceTimersByTime(AUTO_RESULT_MS + AUTO_LEADERBOARD_MS)
    expect(
      ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD),
    ).toBe(false)
    expect(getCurrentQuestion(ctx.round)).toBe(0)
  })

  it("CHARACTERIZATION: abortQuestion() only aborts the cooldown — it does NOT clear a pending auto timer", () => {
    // abortQuestion(socket) is the manager's 'skip to results' control: per the
    // real impl it calls cooldown.abort() and nothing else, so a previously
    // scheduled auto timer is left intact. (clearAuto is reached only via
    // setAutoMode(false) / newQuestion().) We assert the ACTUAL behavior here.
    const quizz = makeQuizz()
    const managerId = "manager-socket"
    const ctx = buildRound({
      quizz,
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
      managerId,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    ctx.round.setAutoMode(true)
    runShowResults(ctx.round, quizz.questions[0])
    expect(getAutoTimer(ctx.round)).not.toBeNull()

    // Manager socket (id must equal getManagerId() for the guard to pass).
    const managerSocket = {
      id: managerId,
      handshake: { auth: { clientId: managerId } },
    } as unknown as Parameters<typeof ctx.round.abortQuestion>[0]

    const aborts = ctx.cooldownAborts
    ctx.round.abortQuestion(managerSocket)

    // It aborted the cooldown...
    expect(ctx.cooldownAborts).toBe(aborts + 1)
    // ...but the auto timer is untouched (NOT cleared) — real current behavior.
    expect(getAutoTimer(ctx.round)).not.toBeNull()

    // And so the auto advance still fires on schedule.
    vi.advanceTimersByTime(AUTO_RESULT_MS)
    expect(
      ctx.sends.some((s) => s.status === STATUS.SHOW_LEADERBOARD),
    ).toBe(true)
  })

  it("newQuestion()'s clearAuto cancels a pending auto timer (guarded against double-advance)", () => {
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
    expect(getAutoTimer(ctx.round)).not.toBeNull()

    // Manually starting the next question clears the pending auto timer up front
    // (newQuestion() calls clearAuto() before doing anything else).
    void (ctx.round as unknown as { newQuestion: () => Promise<void> }).newQuestion()
    expect(getAutoTimer(ctx.round)).toBeNull()
  })
})
