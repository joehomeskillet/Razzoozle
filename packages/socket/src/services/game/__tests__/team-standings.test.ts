// WP-T4 unit tests: computeTeamStandings() exclusion + grouping/ranking.
//
// Mirrors the achievements-teams.test.ts harness (buildRound fakes, makePlayer,
// the enableTeamMode / setCurrentQuestion private-reflection helpers, and the
// teamStandings read-out off the captured SHOW_LEADERBOARD send). The focus here
// is the skip branch in computeTeamStandings (round-manager.ts ~:2216-2218):
// players with NO teamId or an INVALID teamId (not in TEAMS) are excluded, while
// valid TEAMS members are grouped, summed, and ranked desc. Wave A did not touch
// team logic, so this reflects current behavior.

import type { Question, Quizz } from "@razzoozle/common/types/game"
import { STATUS, type StatusDataMap } from "@razzoozle/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildRound,
  type CapturedRound,
  DISABLED_LL,
  makePlayer,
} from "./helpers"

const QUESTION_START = 1_000_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(QUESTION_START)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── local harness (mirrors achievements-teams.test.ts) ───────────────────────

const choiceQuizz = (count = 1, q: Partial<Question> = {}): Quizz =>
  ({
    subject: "Teams",
    questions: Array.from({ length: count }, (_, i) => ({
      question: `Q${i + 1}`,
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [1],
      cooldown: 5,
      time: 20,
      ...q,
    })),
  }) as Quizz

const setCurrentQuestion = (ctx: CapturedRound, index: number): void => {
  ;(ctx.round as unknown as { currentQuestion: number }).currentQuestion = index
}

const enableTeamMode = (ctx: CapturedRound): void => {
  ;(ctx.round as unknown as { opts: { teamMode?: boolean } }).opts.teamMode =
    true
}

// The teamStandings payload off the first captured SHOW_LEADERBOARD send.
const teamStandingsOf = (
  ctx: CapturedRound,
): StatusDataMap["SHOW_LEADERBOARD"]["teamStandings"] => {
  const lb = ctx.sends.find((s) => s.status === STATUS.SHOW_LEADERBOARD)

  return (lb?.data as StatusDataMap["SHOW_LEADERBOARD"] | undefined)
    ?.teamStandings
}

// ── computeTeamStandings: exclusion of no/invalid teamId ──────────────────────

describe("computeTeamStandings — teamId exclusion", () => {
  it("excludes a player with NO teamId from the standings", () => {
    const players = [makePlayer("a"), makePlayer("b")]
    players[0].points = 300
    players[0].teamId = "red"
    // b has points but never picked a team → must not appear in any standing.
    players[1].points = 999

    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })
    enableTeamMode(ctx)
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()

    const standings = teamStandingsOf(ctx)
    // Only the red team (player a) contributes; b's 999 points are excluded.
    expect(standings).toEqual([{ teamId: "red", points: 300, playerCount: 1 }])
  })

  it("excludes a player with an INVALID teamId (not in TEAMS)", () => {
    const players = [makePlayer("a"), makePlayer("b")]
    players[0].points = 200
    players[0].teamId = "blue"
    // b carries a tampered teamId not in TEAMS → excluded by the skip branch.
    players[1].points = 5000
    players[1].teamId = "purple"

    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })
    enableTeamMode(ctx)
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()

    const standings = teamStandingsOf(ctx)
    // Only blue (player a) survives; the invalid "purple" 5000 is dropped, and
    // no "purple" entry is ever created.
    expect(standings).toEqual([{ teamId: "blue", points: 200, playerCount: 1 }])
    expect(standings?.some((s) => s.teamId === "purple")).toBe(false)
  })

  it("excludes BOTH a no-teamId and an invalid-teamId player at once", () => {
    const players = [
      makePlayer("valid"),
      makePlayer("noTeam"),
      makePlayer("badTeam"),
    ]
    players[0].points = 150
    players[0].teamId = "green"
    players[1].points = 800 // no teamId
    players[2].points = 800 // invalid teamId
    players[2].teamId = "orange"

    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })
    enableTeamMode(ctx)
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()

    const standings = teamStandingsOf(ctx)
    // Exactly one entry — green — survives both skips.
    expect(standings).toEqual([{ teamId: "green", points: 150, playerCount: 1 }])
  })
})

// ── computeTeamStandings: grouping + summing + ranking ────────────────────────

describe("computeTeamStandings — grouping, summing, ranking", () => {
  it("groups members per team, sums points, and ranks desc", () => {
    const players = [
      makePlayer("a"),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
    ]
    // red: 300 + 100 = 400 over two members.
    players[0].points = 300
    players[0].teamId = "red"
    players[1].points = 100
    players[1].teamId = "red"
    // blue: a single 500-point member → top.
    players[2].points = 500
    players[2].teamId = "blue"
    // green: a single 50-point member → bottom.
    players[3].points = 50
    players[3].teamId = "green"

    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })
    enableTeamMode(ctx)
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()

    const standings = teamStandingsOf(ctx)
    expect(standings).toEqual([
      { teamId: "blue", points: 500, playerCount: 1 },
      { teamId: "red", points: 400, playerCount: 2 },
      { teamId: "green", points: 50, playerCount: 1 },
    ])
  })

  it("ignores excluded players while still summing the valid teams correctly", () => {
    const players = [
      makePlayer("r1"),
      makePlayer("r2"),
      makePlayer("y1"),
      makePlayer("ghost"),
      makePlayer("tamper"),
    ]
    players[0].points = 120
    players[0].teamId = "red"
    players[1].points = 80
    players[1].teamId = "red"
    players[2].points = 90
    players[2].teamId = "yellow"
    // ghost: no teamId; tamper: invalid teamId. Both must not skew the sums.
    players[3].points = 10_000
    players[4].points = 10_000
    players[4].teamId = "magenta"

    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })
    enableTeamMode(ctx)
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()

    const standings = teamStandingsOf(ctx)
    expect(standings).toEqual([
      { teamId: "red", points: 200, playerCount: 2 },
      { teamId: "yellow", points: 90, playerCount: 1 },
    ])
  })
})
