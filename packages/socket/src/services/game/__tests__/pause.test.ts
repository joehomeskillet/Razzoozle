import type { Player, Quizz } from "@razzoozle/common/types/game"
import type { Socket } from "@razzoozle/common/types/game/socket"
import { STATUS } from "@razzoozle/common/types/game/status"
import { describe, expect, it, vi } from "vitest"
import {
  answerCount,
  buildRound,
  DISABLED_LL,
  makePlayer,
  makeSocket,
} from "./helpers"

const makeQuizz = (): Quizz => ({
  subject: "Pause",
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 1,
      time: 5,
    },
    {
      question: "Q2",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 1,
      time: 5,
    },
  ],
})

const setStarted = (round: unknown, value: boolean): void => {
  ;(round as { started: boolean }).started = value
}

const setCurrentQuestion = (round: unknown, value: number): void => {
  ;(round as { currentQuestion: number }).currentQuestion = value
}

const getCurrentQuestion = (round: unknown): number =>
  (round as { currentQuestion: number }).currentQuestion

const setLeaderboard = (round: unknown, players: Player[]): void => {
  ;(round as { leaderboard: Player[] }).leaderboard = players
}

const setCurrentStatus = (
  round: unknown,
  status: string,
  data: unknown = {},
): void => {
  ;(
    round as {
      pauseState: { status: string; data: unknown } | null
    }
  ).pauseState = { status, data }
}

const makeManagerSocket = (): Socket =>
  ({
    id: "manager-socket",
    handshake: { auth: { clientId: "manager-client" } },
  }) as unknown as Socket

describe("RoundManager pause/resume", () => {
  it("rejects pause while an answer window is open", () => {
    const ctx = buildRound({
      quizz: makeQuizz(),
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentStatus(ctx.round, STATUS.SELECT_ANSWER, { question: "Q1" })

    ctx.round.pause()

    expect(ctx.broadcasts.some((b) => b.status === STATUS.PAUSED)).toBe(false)
  })

  it("allows pause at SHOW_LEADERBOARD and resume restores the prior status", () => {
    const alice = makePlayer("alice")
    const ctx = buildRound({
      quizz: makeQuizz(),
      players: [alice],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    setLeaderboard(ctx.round, [alice])
    ctx.round.showLeaderboard()

    ctx.round.pause()

    expect(ctx.broadcasts.at(-1)).toEqual({
      status: STATUS.PAUSED,
      data: { reason: "paused" },
    })

    ctx.round.resume()

    expect(ctx.broadcasts.at(-1)?.status).toBe(STATUS.SHOW_LEADERBOARD)
  })

  it("drops nextQuestion and answers while paused", () => {
    const alice = makePlayer("alice")
    const ctx = buildRound({
      quizz: makeQuizz(),
      players: [alice],
      lowLatency: DISABLED_LL,
    })
    const playerSocket = makeSocket("alice")

    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"))
    setStarted(ctx.round, true)
    setCurrentQuestion(ctx.round, 0)
    setLeaderboard(ctx.round, [alice])
    ctx.round.showLeaderboard()
    ctx.round.pause()

    ctx.round.nextQuestion(makeManagerSocket())
    ctx.round.selectAnswer(playerSocket.socket, 0)

    expect(getCurrentQuestion(ctx.round)).toBe(0)
    expect(answerCount(ctx.round)).toBe(0)
  })

  // Pin every status isPausableStatus() allows (SHOW_LEADERBOARD covered
  // above). These guard the SHOW_ROOM widen (status.ts TODO) so a future
  // narrowing of the pausable set is caught.
  it.each([
    [STATUS.SHOW_START, { text: "Get ready" }],
    [STATUS.SHOW_PREPARED, { text: "Prepared" }],
    [STATUS.SHOW_ROOM, { text: "Room", inviteCode: "ABCDEF" }],
    [STATUS.WAIT, { text: "Waiting" }],
  ])("allows pause at %s", (status, data) => {
    const ctx = buildRound({
      quizz: makeQuizz(),
      players: [makePlayer("alice")],
      lowLatency: DISABLED_LL,
    })

    setStarted(ctx.round, true)
    setCurrentStatus(ctx.round, status, data)

    ctx.round.pause()

    expect(ctx.broadcasts.at(-1)).toEqual({
      status: STATUS.PAUSED,
      data: { reason: "paused" },
    })
  })
})
