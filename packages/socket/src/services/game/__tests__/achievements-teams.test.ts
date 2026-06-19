// WP-A unit tests: server-side achievements computation, team standings, and the
// between-questions leaderboard avatar fix (bug #4).
//
// These reuse the shared buildRound fakes (helpers.ts) and reach the private
// showResults()/showLeaderboard() the same private-reflection way the existing
// results.test.ts / round-lifecycle.test.ts do. All time is fake so the timing
// badges (speed_demon / lucky_guess / speedy_gonzales) are deterministic.

import {
  mergeAchievementsConfig,
  type MergedAchievement,
} from "@razzoozle/common/achievements"
import type { AchievementsConfig } from "@razzoozle/common/validators/achievements"
import type { Player, Question, Quizz } from "@razzoozle/common/types/game"
import { STATUS, type StatusDataMap } from "@razzoozle/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildRound,
  type CapturedRound,
  DISABLED_LL,
  makePlayer,
  makeSocket,
  openQuestion,
} from "./helpers"

const QUESTION_START = 1_000_000_000_000
const MANAGER_ID = "manager-socket"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(QUESTION_START)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── local harness ────────────────────────────────────────────────────────────

const choiceQuizz = (count = 1, q: Partial<Question> = {}): Quizz =>
  ({
    subject: "Achievements",
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

// Run the private showResults for the round's current question.
const callShowResults = (ctx: CapturedRound): void => {
  const r = ctx.round as unknown as {
    showResults: (_q: Question) => void
    opts: { quizz: Quizz }
    currentQuestion: number
  }
  r.showResults(r.opts.quizz.questions[r.currentQuestion])
}

const setCurrentQuestion = (ctx: CapturedRound, index: number): void => {
  ;(ctx.round as unknown as { currentQuestion: number }).currentQuestion = index
}

const enableTeamMode = (ctx: CapturedRound): void => {
  ;(ctx.round as unknown as { opts: { teamMode?: boolean } }).opts.teamMode =
    true
}

// Apply a merged achievements config to an already-built round. RoundManager
// snapshots the lookup Map in its constructor (read once, like teamMode), so a
// test that wants a custom config must both set the opts value AND rebuild the
// private id→MergedAchievement map. Defaults to the registry defaults when no
// patch is given (the same thing the constructor falls back to).
const applyAchievementsConfig = (
  ctx: CapturedRound,
  patch: AchievementsConfig = {},
): void => {
  const merged = mergeAchievementsConfig(patch)
  const inner = ctx.round as unknown as {
    opts: { achievements?: MergedAchievement[] }
    achievementsConfig: Map<string, MergedAchievement>
  }
  inner.opts.achievements = merged
  inner.achievementsConfig = new Map(merged.map((a) => [a.id, a]))
}

const answerAt = (
  ctx: CapturedRound,
  clientId: string,
  answerId: number,
  atMs: number,
): void => {
  vi.setSystemTime(atMs)
  ctx.round.selectAnswer(makeSocket(clientId).socket, answerId)
}

// SHOW_RESULT achievements for a player socket id.
const achievementsFor = (
  ctx: CapturedRound,
  playerSocketId: string,
): string[] | undefined => {
  const found = [...ctx.sends]
    .reverse()
    .find((s) => s.target === playerSocketId && s.status === STATUS.SHOW_RESULT)

  return (found?.data as StatusDataMap["SHOW_RESULT"] | undefined)?.achievements
}

// The last SHOW_RESULT `myPoints` (running total, bonus already folded in) for a
// player socket id — mirrors achievementsFor's reverse-find pattern.
const myPointsFor = (
  ctx: CapturedRound,
  playerSocketId: string,
): number | undefined => {
  const found = [...ctx.sends]
    .reverse()
    .find((s) => s.target === playerSocketId && s.status === STATUS.SHOW_RESULT)

  return (found?.data as StatusDataMap["SHOW_RESULT"] | undefined)?.myPoints
}

// The last SHOW_RESULT `bonusPoints` for a player socket id — undefined when the
// field is absent (sum of per-badge bonuses was 0).
const bonusPointsFor = (
  ctx: CapturedRound,
  playerSocketId: string,
): number | undefined => {
  const found = [...ctx.sends]
    .reverse()
    .find((s) => s.target === playerSocketId && s.status === STATUS.SHOW_RESULT)

  return (found?.data as StatusDataMap["SHOW_RESULT"] | undefined)?.bonusPoints
}

// The live roster row (players.getAll()) for a clientId — this is what
// players.replace() persisted after the last showResults().
const rosterRowFor = (
  ctx: CapturedRound,
  clientId: string,
): Player | undefined =>
  (
    ctx.round as unknown as {
      opts: { players: { getAll: () => Player[] } }
    }
  ).opts.players
    .getAll()
    .find((p) => p.clientId === clientId)

// The internal round leaderboard row (this.leaderboard) for a clientId — the
// source rows that feed SHOW_LEADERBOARD / FINISHED.
const leaderboardRowFor = (
  ctx: CapturedRound,
  clientId: string,
): Player | undefined =>
  (ctx.round as unknown as { leaderboard: Player[] }).leaderboard.find(
    (p) => p.clientId === clientId,
  )

// The persistent per-player gameCounters entry for a clientId (undefined when
// the player never accrued any counter — e.g. bots, which are skipped).
const gameCounterFor = (
  ctx: CapturedRound,
  clientId: string,
): { answered: number; correct: number; ever: boolean } | undefined =>
  (
    ctx.round as unknown as {
      gameCounters: Map<
        string,
        { answered: number; correct: number; ever: boolean }
      >
    }
  ).gameCounters.get(clientId)

const makeBot = (clientId: string): Player => ({
  ...makePlayer(clientId),
  isBot: true,
})

// Mirror the real openQuestion() reset of the per-question receive-time map.
// The shared test openQuestion fake skips this (it only stamps LL anchors), so
// a multi-round test must clear it itself or a prior round's "answered" stamp
// leaks into the next round's answered-count (and thus participation).
const resetReceiveTimes = (ctx: CapturedRound): void => {
  ;(
    ctx.round as unknown as { answerReceivedAt: Map<string, number> }
  ).answerReceivedAt.clear()
}

// ── Bronze ───────────────────────────────────────────────────────────────────

describe("achievements — Bronze", () => {
  it("first_correct only on the player's FIRST EVER correct, not again", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })

    // Round 1 (index 0): correct → first_correct.
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000) // 3s → no speed badge
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toContain("first_correct")

    // Round 2 (index 1): correct again → NO second first_correct.
    setCurrentQuestion(ctx, 1)
    openQuestion(ctx.round, {
      questionIndex: 1,
      startTime: QUESTION_START + 100_000,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 103_000)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a") ?? []).not.toContain("first_correct")
  })

  it("lucky_guess when correct in the last 5% of the window", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    // 19.5s of 20s = last 2.5% → ≥ 95% threshold.
    answerAt(ctx, "a", 1, QUESTION_START + 19_500)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toContain("lucky_guess")
  })

  it("participation on the last round once every scored question was answered", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })

    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 0, QUESTION_START + 3_000) // wrong but answered
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a") ?? []).not.toContain("participation")

    setCurrentQuestion(ctx, 1)
    openQuestion(ctx.round, {
      questionIndex: 1,
      startTime: QUESTION_START + 100_000,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 0, QUESTION_START + 103_000)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toContain("participation")
  })
})

// ── Silver ───────────────────────────────────────────────────────────────────

describe("achievements — Silver", () => {
  it("speed_demon under 1s, streak_3 at exactly 3", () => {
    const players = [makePlayer("a")]
    // streak 2 before → after a correct answer it becomes 3.
    players[0].streak = 2
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players,
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 500) // 0.5s → speed_demon
    callShowResults(ctx)
    const got = achievementsFor(ctx, "a") ?? []
    expect(got).toContain("speed_demon")
    expect(got).toContain("streak_3")
  })

  it("sharpshooter on a slider with > 95% accuracy", () => {
    const ctx = buildRound({
      quizz: {
        subject: "Slider",
        questions: [
          {
            question: "Guess",
            type: "slider",
            min: 0,
            max: 100,
            correct: 50,
            cooldown: 5,
            time: 20,
          },
        ],
      } as Quizz,
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    // Guess 51 → dist 1 → accuracy 0.99 > 0.95.
    answerAt(ctx, "a", 51, QUESTION_START + 3_000)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toContain("sharpshooter")
  })

  it("climber when a player moves up ≥3 ranks vs the prior round", () => {
    // 4 players. Round 1: d is far behind. Round 2: d leaps to the top.
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [
        makePlayer("a"),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      lowLatency: DISABLED_LL,
    })

    // Round 1: a,b,c correct (descending by speed), d wrong → d is rank 4.
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 1_000)
    answerAt(ctx, "b", 1, QUESTION_START + 5_000)
    answerAt(ctx, "c", 1, QUESTION_START + 9_000)
    answerAt(ctx, "d", 0, QUESTION_START + 2_000) // wrong
    callShowResults(ctx)

    // Round 2: only d answers correctly + a huge bonus would put it on top. Give
    // d a correct instant answer; a,b,c answer wrong so they don't out-score it.
    setCurrentQuestion(ctx, 1)
    openQuestion(ctx.round, {
      questionIndex: 1,
      startTime: QUESTION_START + 100_000,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    // d needs to overtake. Seed d's points high enough via a correct fast answer
    // plus first-correct bonus; the others answer wrong (no points).
    answerAt(ctx, "d", 1, QUESTION_START + 100_500)
    answerAt(ctx, "a", 0, QUESTION_START + 101_000)
    answerAt(ctx, "b", 0, QUESTION_START + 101_500)
    answerAt(ctx, "c", 0, QUESTION_START + 102_000)
    callShowResults(ctx)

    // d climbed from rank 4 to rank 1 (≥3) → climber.
    expect(achievementsFor(ctx, "d")).toContain("climber")
  })
})

// ── Manager config: enable/disable + custom thresholds (WP-1) ────────────────

describe("achievements — configurable gating + thresholds", () => {
  it("a DISABLED badge never unlocks even when its condition holds", () => {
    const players = [makePlayer("a")]
    // streak 2 before → after a correct answer it becomes exactly 3 → streak_3
    // would normally fire. With streak_3 disabled it must NOT appear.
    players[0].streak = 2
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players,
      lowLatency: DISABLED_LL,
    })
    applyAchievementsConfig(ctx, { streak_3: { enabled: false } })

    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000)
    callShowResults(ctx)

    const got = achievementsFor(ctx, "a") ?? []
    // streak_3 is disabled → absent; an unrelated enabled badge still fires.
    expect(got).not.toContain("streak_3")
    expect(got).toContain("first_correct")
  })

  it("a CUSTOM speed_demon threshold (maxMs=500) flips the unlock boundary", () => {
    // Default maxMs=1000 → a 700ms correct answer earns speed_demon. With the
    // configured maxMs lowered to 500, that same 700ms answer no longer unlocks.
    const makeCtx = (config: AchievementsConfig): CapturedRound => {
      const ctx = buildRound({
        quizz: choiceQuizz(1),
        players: [makePlayer("a")],
        lowLatency: DISABLED_LL,
      })
      applyAchievementsConfig(ctx, config)
      setCurrentQuestion(ctx, 0)
      openQuestion(ctx.round, {
        startTime: QUESTION_START,
        ll: DISABLED_LL,
        questionTimeSec: 20,
      })
      answerAt(ctx, "a", 1, QUESTION_START + 700) // 0.7s
      callShowResults(ctx)

      return ctx
    }

    // Defaults: 700ms < 1000ms → unlocked.
    expect(achievementsFor(makeCtx({}), "a") ?? []).toContain("speed_demon")

    // Custom maxMs=500: 700ms ≥ 500ms → NOT unlocked.
    expect(
      achievementsFor(makeCtx({ speed_demon: { threshold: 500 } }), "a") ?? [],
    ).not.toContain("speed_demon")
  })
})

// ── Manager config: per-achievement BONUS POINTS (Wave B) ────────────────────

describe("achievements — configurable bonus points", () => {
  // A fresh round per test: player.points accrues on the LIVE player object, so
  // a shared round would leak the bonus into a later test's running total.
  //
  // A lone player who answers correctly at 3s on a single-question quiz answers
  // in 3s (>1000ms → no speed badge) with streak starting at 0 (→ 1 after, no
  // streak badge). On the only/last scored question with 100% correct that
  // unlocks exactly: first_correct, first_responder, participation, perfect_game
  // (verified in BONUS AWARDED below via achievementsFor). We attach the bonus to
  // ONE of those ids (first_correct) and assert the delta is exactly that bonus —
  // the other three carry the default bonus of 0.
  const correctKey = choiceQuizz().questions[0].solutions![0] // 1

  const playFirstCorrect = (config: AchievementsConfig): CapturedRound => {
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })
    applyAchievementsConfig(ctx, config)
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", correctKey, QUESTION_START + 3_000) // 3s → no timing/streak badge
    callShowResults(ctx)

    return ctx
  }

  it("BASELINE: default config awards no bonus (bonusPoints absent)", () => {
    const ctx = playFirstCorrect({})
    expect(bonusPointsFor(ctx, "a")).toBeUndefined()
    // Sanity: a lone 3s correct still unlocks the expected badges.
    expect(achievementsFor(ctx, "a")).toContain("first_correct")
  })

  it("a configured bonus is folded into myPoints AND surfaced as bonusPoints", () => {
    const base = myPointsFor(playFirstCorrect({}), "a")
    expect(base).toBeDefined()

    const ctx = playFirstCorrect({ first_correct: { bonus: 250 } })
    // The bonus rides on first_correct only — confirm it is actually unlocked so
    // the 250 is summed (the other unlocked ids keep their default 0 bonus).
    expect(achievementsFor(ctx, "a")).toContain("first_correct")

    expect(myPointsFor(ctx, "a")).toBe(base! + 250)
    expect(bonusPointsFor(ctx, "a")).toBe(250)
  })

  it("a DISABLED badge awards no bonus even with a configured bonus", () => {
    const base = myPointsFor(playFirstCorrect({}), "a")
    expect(base).toBeDefined()

    const ctx = playFirstCorrect({
      first_correct: { enabled: false, bonus: 250 },
    })
    // first_correct is disabled → not unlocked → its 250 bonus is never summed.
    expect(achievementsFor(ctx, "a") ?? []).not.toContain("first_correct")
    expect(bonusPointsFor(ctx, "a")).toBeUndefined()
    expect(myPointsFor(ctx, "a")).toBe(base)
  })
})

// ── Gold + Diamant streaks ───────────────────────────────────────────────────

describe("achievements — Gold/Diamant streak + speed", () => {
  it("streak_5 + perfect_round co-fire at exactly 5", () => {
    const players = [makePlayer("a")]
    players[0].streak = 4
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players,
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000)
    callShowResults(ctx)
    const got = achievementsFor(ctx, "a") ?? []
    expect(got).toContain("streak_5")
    expect(got).toContain("perfect_round")
    expect(got).toContain("first_responder")
  })

  it("streak_10 at exactly 10 and speedy_gonzales under 0.4s", () => {
    const players = [makePlayer("a")]
    players[0].streak = 9
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players,
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 200) // 0.2s
    callShowResults(ctx)
    const got = achievementsFor(ctx, "a") ?? []
    expect(got).toContain("streak_10")
    expect(got).toContain("speedy_gonzales")
  })

  it("underdog beating someone >2000 pts ahead", () => {
    const players = [makePlayer("rich"), makePlayer("poor")]
    // rich is > 2000 ahead pre-round (poor at 0). A bonus question instant
    // correct nets poor 2000 (doubled) + 100 first-correct = 2100, edging past
    // rich's 2050 → underdog.
    players[0].points = 2050
    players[1].points = 0
    const ctx = buildRound({
      quizz: choiceQuizz(1, { bonus: true }),
      players,
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    // poor nails an instant correct on a bonus question (doubled + first-correct
    // bonus) → > 5000; rich answers wrong → stays 5000.
    answerAt(ctx, "poor", 1, QUESTION_START)
    answerAt(ctx, "rich", 0, QUESTION_START + 1_000)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "poor")).toContain("underdog")
  })

  it("perfect_game on the last round with 100% correct", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000)
    callShowResults(ctx)

    setCurrentQuestion(ctx, 1)
    openQuestion(ctx.round, {
      questionIndex: 1,
      startTime: QUESTION_START + 100_000,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 103_000)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toContain("perfect_game")
  })
})

// ── poll / practice gating ───────────────────────────────────────────────────

describe("achievements — poll/practice never unlock", () => {
  it("a poll question unlocks nothing", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(1, { type: "poll", solutions: undefined }),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 0, QUESTION_START + 100)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toBeUndefined()
  })

  it("a practice question unlocks nothing even on a fast correct answer", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(1, { practice: true }),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 100)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toBeUndefined()
  })
})

// ── Bug #1: stale achievements must not leak across rounds ───────────────────

describe("achievements — no stale leak across rounds (bug #1)", () => {
  it("a player who earns nothing in round N+1 carries NO achievements field in the roster/leaderboard", () => {
    const players = [makePlayer("a")]
    // streak 2 → after a correct answer it becomes 3 → streak_3 in round 1.
    players[0].streak = 2
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })

    // Round 1 (index 0): correct → unlocks first_correct + streak_3.
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000)
    callShowResults(ctx)
    // Sanity: round 1 did persist the badges onto the roster + leaderboard.
    expect(achievementsFor(ctx, "a")).toContain("streak_3")
    expect(rosterRowFor(ctx, "a")?.achievements).toContain("streak_3")
    expect(leaderboardRowFor(ctx, "a")?.achievements).toContain("streak_3")

    // Round 2 (index 1): the player does NOT answer at all → no fresh unlock
    // (answered count stays at 1 of 2, so no participation either). The prior
    // badges must be stripped, not ride along into the roster / between-questions
    // leaderboard.
    setCurrentQuestion(ctx, 1)
    openQuestion(ctx.round, {
      questionIndex: 1,
      startTime: QUESTION_START + 100_000,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    resetReceiveTimes(ctx) // real openQuestion() clears this; the fake doesn't
    callShowResults(ctx) // no answer → streak resets, nothing unlocks

    expect(achievementsFor(ctx, "a") ?? []).toHaveLength(0)
    expect(rosterRowFor(ctx, "a")).toBeDefined()
    expect(rosterRowFor(ctx, "a")?.achievements).toBeUndefined()
    expect(leaderboardRowFor(ctx, "a")?.achievements).toBeUndefined()

    // And SHOW_LEADERBOARD rows are equally free of the stale badge.
    ctx.round.showLeaderboard()
    const lb = ctx.sends.find((s) => s.status === STATUS.SHOW_LEADERBOARD)
    const data = lb?.data as StatusDataMap["SHOW_LEADERBOARD"] | undefined
    const aRow = data?.leaderboard.find((p) => p.clientId === "a")
    expect(aRow?.achievements).toBeUndefined()
  })
})

// ── Bug #2: participation / perfect_game fire on a poll-final quiz ────────────

describe("achievements — last-scored gating with a trailing poll (bug #2)", () => {
  // Quiz: scored choice question, then a poll as the literal LAST question.
  const choiceThenPoll = (): Quizz =>
    ({
      subject: "Scored then poll",
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
          question: "Poll",
          type: "poll",
          answers: ["A", "B"],
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  it("participation + perfect_game fire on the final SCORED round even though a poll follows", () => {
    const ctx = buildRound({
      quizz: choiceThenPoll(),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })

    // Round 1 (index 0) is the last SCORED question (index 1 is a poll).
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000) // correct → 100% of scored
    callShowResults(ctx)

    const got = achievementsFor(ctx, "a") ?? []
    expect(got).toContain("participation")
    expect(got).toContain("perfect_game")
  })

  it("the trailing poll round itself unlocks nothing", () => {
    const ctx = buildRound({
      quizz: choiceThenPoll(),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })

    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 3_000)
    callShowResults(ctx)

    // Now the poll round (literal last question) — must unlock nothing.
    setCurrentQuestion(ctx, 1)
    openQuestion(ctx.round, {
      questionIndex: 1,
      startTime: QUESTION_START + 100_000,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 0, QUESTION_START + 103_000)
    callShowResults(ctx)
    expect(achievementsFor(ctx, "a")).toBeUndefined()
  })
})

// ── Bug #3: bots get no achievements and no counters in live play ─────────────

describe("achievements — bots are excluded (bug #3)", () => {
  it("a bot row receives no achievements and never enters gameCounters", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [makePlayer("human"), makeBot("bot")],
      lowLatency: DISABLED_LL,
    })

    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    // Both answer correctly and fast. The human earns first_correct; the bot
    // must earn nothing and must not touch the persistent counters.
    answerAt(ctx, "human", 1, QUESTION_START + 1_000)
    answerAt(ctx, "bot", 1, QUESTION_START + 500)
    callShowResults(ctx)

    // Human earns badges + a counter; bot earns neither.
    expect(achievementsFor(ctx, "human")).toContain("first_correct")
    expect(gameCounterFor(ctx, "human")).toBeDefined()

    expect(achievementsFor(ctx, "bot") ?? []).toHaveLength(0)
    expect(rosterRowFor(ctx, "bot")?.achievements).toBeUndefined()
    expect(leaderboardRowFor(ctx, "bot")?.achievements).toBeUndefined()
    expect(gameCounterFor(ctx, "bot")).toBeUndefined()
  })

  it("a bot does not consume the human's participation/perfect_game totals", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players: [makePlayer("human"), makeBot("bot")],
      lowLatency: DISABLED_LL,
    })

    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "human", 1, QUESTION_START + 3_000)
    answerAt(ctx, "bot", 1, QUESTION_START + 2_000)
    callShowResults(ctx)

    // Single scored question answered correctly → human gets the full sweep.
    const got = achievementsFor(ctx, "human") ?? []
    expect(got).toContain("participation")
    expect(got).toContain("perfect_game")
    // Bot still left out of the counters map entirely.
    expect(gameCounterFor(ctx, "bot")).toBeUndefined()
  })
})

// ── Team standings ───────────────────────────────────────────────────────────

describe("team standings", () => {
  it("are absent when team mode is OFF", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [makePlayer("a"), makePlayer("b")],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()
    const lb = ctx.sends.find((s) => s.status === STATUS.SHOW_LEADERBOARD)
    expect(
      (lb?.data as StatusDataMap["SHOW_LEADERBOARD"] | undefined)
        ?.teamStandings,
    ).toBeUndefined()
  })

  it("aggregate member points per team, sorted desc, when team mode is ON", () => {
    const players = [makePlayer("a"), makePlayer("b"), makePlayer("c")]
    players[0].points = 300
    players[0].teamId = "red"
    players[1].points = 100
    players[1].teamId = "red"
    players[2].points = 500
    players[2].teamId = "blue"

    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })
    enableTeamMode(ctx)
    setCurrentQuestion(ctx, 0)
    ctx.round.showLeaderboard()

    const lb = ctx.sends.find((s) => s.status === STATUS.SHOW_LEADERBOARD)
    const standings = (
      lb?.data as StatusDataMap["SHOW_LEADERBOARD"] | undefined
    )?.teamStandings
    expect(standings).toEqual([
      { teamId: "blue", points: 500, playerCount: 1 },
      { teamId: "red", points: 400, playerCount: 2 },
    ])
  })

  it("selectTeam validates the enum and is a no-op when team mode is off", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(1),
      players: [makePlayer("a")],
      lowLatency: DISABLED_LL,
    })

    // Off → no-op.
    expect(ctx.round.selectTeam("a", "red")).toBeUndefined()

    enableTeamMode(ctx)
    // Invalid teamId → no-op.
    expect(ctx.round.selectTeam("a", "purple")).toBeUndefined()
    // Valid → assigns.
    const updated = ctx.round.selectTeam("a", "green")
    expect(updated?.teamId).toBe("green")
  })
})

// ── Bug #4: avatar present in the between-questions leaderboard ───────────────

describe("leaderboard avatar (bug #4)", () => {
  it("carries `avatar` into the SHOW_LEADERBOARD rows", () => {
    const players: Player[] = [
      { ...makePlayer("a"), avatar: "avatar-a.png" },
      { ...makePlayer("b"), avatar: "avatar-b.png" },
    ]
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players,
      lowLatency: DISABLED_LL,
    })

    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 1_000)
    answerAt(ctx, "b", 0, QUESTION_START + 2_000)
    callShowResults(ctx)
    // The first showLeaderboard() now interposes the per-round recap screen
    // (SHOW_ROUND_RECAP) on a non-last round with a non-empty recap; the SECOND
    // call advances to the real leaderboard. Call twice to reach the board.
    ctx.round.showLeaderboard()
    ctx.round.showLeaderboard()

    const lb = ctx.sends.find((s) => s.status === STATUS.SHOW_LEADERBOARD)
    const data = lb?.data as StatusDataMap["SHOW_LEADERBOARD"] | undefined
    expect(data).toBeDefined()
    // Every leaderboard row keeps its avatar (not undefined).
    for (const row of data?.leaderboard ?? []) {
      expect(row.avatar).toBeDefined()
    }
    const aRow = data?.leaderboard.find((p) => p.clientId === "a")
    expect(aRow?.avatar).toBe("avatar-a.png")
    // oldLeaderboard rows keep avatar too.
    for (const row of data?.oldLeaderboard ?? []) {
      expect(row.avatar).toBeDefined()
    }
  })

  it("does NOT leak internal achievement intermediates (aXxx) into the leaderboard rows", () => {
    const ctx = buildRound({
      quizz: choiceQuizz(2),
      players: [{ ...makePlayer("a"), avatar: "x.png" }],
      lowLatency: DISABLED_LL,
    })
    setCurrentQuestion(ctx, 0)
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerAt(ctx, "a", 1, QUESTION_START + 500)
    callShowResults(ctx)
    // First showLeaderboard() may interpose SHOW_ROUND_RECAP (non-last round,
    // non-empty recap); the second reaches the real leaderboard.
    ctx.round.showLeaderboard()
    ctx.round.showLeaderboard()

    const lb = ctx.sends.find((s) => s.status === STATUS.SHOW_LEADERBOARD)
    const serialized = JSON.stringify(lb)
    expect(serialized).not.toContain("aScored")
    expect(serialized).not.toContain("aResponseTimeMs")
    expect(serialized).not.toContain("aBaseFactor")
  })
})
