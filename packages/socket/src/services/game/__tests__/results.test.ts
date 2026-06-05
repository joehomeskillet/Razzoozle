// Characterization / regression tests for RoundManager.showResults — the
// scoring + leaderboard pipeline. scoring.test.ts already covers the
// selectAnswer timing/dedup/deadline path; this file drives accepted answers
// into a round and then invokes the (private) showResults to assert the EXACT
// emitted SHOW_RESULT (per player) and SHOW_RESPONSES (manager) payloads.
//
// These assert the ACTUAL current behaviour of the code as-is:
//   - correct vs incorrect points (time-decay from MAX_POINTS),
//   - streak multiplier grows by STREAK_STEP, capped at STREAK_CAP (+50% max),
//   - first-correct flat FIRST_CORRECT_BONUS only for the first correct arrival
//     (scaled by base/accuracy),
//   - slider accuracy + SLIDER_TOLERANCE_FRACTION tolerance,
//   - poll = neutral (no correctness, no points),
//   - practice question = 0 points AND streak preserved,
//   - bonus question = points doubled,
//   - leaderboard ordering / snapshot after results.
//
// We import the tuning constants from @razzia/common and assert against them
// (never hardcode 100 / 1000 / 0.1 …) so a constant change is reflected here.
//
// All time is controlled with vi.useFakeTimers()/setSystemTime so the points
// captured at selectAnswer (timeToPoint over the server clock) are deterministic.

import {
  FIRST_CORRECT_BONUS,
  MAX_POINTS,
  SLIDER_TOLERANCE_FRACTION,
  STREAK_CAP,
  STREAK_STEP,
} from "@razzia/common/constants"
import type { Player, Question, Quizz } from "@razzia/common/types/game"
import type { StatusDataMap } from "@razzia/common/types/game/status"
import { STATUS } from "@razzia/common/types/game/status"
import { timeToPoint } from "@razzia/socket/utils/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildRound,
  type CapturedRound,
  DISABLED_LL,
  makePlayer,
  makeSocket,
  openQuestion,
} from "./helpers"

const QUESTION_START = 1_000_000_000_000 // Fixed epoch ms for determinism
const MANAGER_ID = "manager-socket"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(QUESTION_START)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Local helpers (reuse the buildRound fakes; reach the private bits the same
//    way helpers.ts already does for state inspection) ───────────────────────

// Build a single-question quizz from one question (defaults match scoring.test).
const quizzOf = (q: Partial<Question> & { question?: string }): Quizz =>
  ({
    subject: "Results",
    questions: [
      {
        question: "Q1",
        type: "choice",
        answers: ["A", "B", "C", "D"],
        solutions: [1],
        cooldown: 5,
        time: 20,
        ...q,
      },
    ],
  }) as Quizz

// Invoke the private showResults(question) exactly as newQuestion() would after
// the answer window closes.
const callShowResults = (ctx: CapturedRound): void => {
  const q = ctx.round as unknown as {
    showResults: (_q: Question) => void
    opts: { quizz: Quizz }
    currentQuestion: number
  }
  q.showResults(q.opts.quizz.questions[q.currentQuestion])
}

// The SHOW_RESULT payload the round sent to a given player socket id.
const resultFor = (
  ctx: CapturedRound,
  playerSocketId: string,
): StatusDataMap["SHOW_RESULT"] | undefined => {
  const found = ctx.sends.find(
    (s) => s.target === playerSocketId && s.status === STATUS.SHOW_RESULT,
  )

  return found?.data as StatusDataMap["SHOW_RESULT"] | undefined
}

// The single SHOW_RESPONSES payload the round sent to the manager.
const responsesPayload = (
  ctx: CapturedRound,
): StatusDataMap["SHOW_RESPONSES"] | undefined => {
  const found = ctx.sends.find(
    (s) => s.target === MANAGER_ID && s.status === STATUS.SHOW_RESPONSES,
  )

  return found?.data as StatusDataMap["SHOW_RESPONSES"] | undefined
}

// Open the window (DISABLED_LL → no deadline gate) and accept an answer for a
// clientId at the current system time, so its stored `points` = timeToPoint.
const answer = (
  ctx: CapturedRound,
  clientId: string,
  answerId: number,
): void => {
  ctx.round.selectAnswer(makeSocket(clientId).socket, answerId)
}

// Mutate a player's streak/points BEFORE results to set up streak scenarios.
// getAll() returns the live player objects showResults reads streakBefore from.
const setPlayerState = (
  players: Player[],
  clientId: string,
  state: Partial<Pick<Player, "streak" | "points">>,
): void => {
  const p = players.find((pl) => pl.clientId === clientId)

  if (p) {
    Object.assign(p, state)
  }
}

// ── correct vs incorrect (time decay) ───────────────────────────────────────

describe("correct vs incorrect points (time-decay from MAX_POINTS)", () => {
  it("awards full MAX_POINTS for a correct instant answer, 0 for a wrong one", () => {
    const players = [makePlayer("right"), makePlayer("wrong")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // Both answer at t+0 (no decay): timeToPoint == MAX_POINTS.
    answer(ctx, "right", 1) // Correct
    answer(ctx, "wrong", 0) // Wrong

    callShowResults(ctx)

    const r = resultFor(ctx, "right")
    const w = resultFor(ctx, "wrong")
    expect(r?.correct).toBe(true)
    // Single correct player ⇒ also the first-correct ⇒ flat bonus added.
    expect(r?.points).toBe(MAX_POINTS + FIRST_CORRECT_BONUS)
    expect(r?.myPoints).toBe(MAX_POINTS + FIRST_CORRECT_BONUS)

    expect(w?.correct).toBe(false)
    expect(w?.points).toBe(0)
    expect(w?.myPoints).toBe(0)
  })

  it("decays a correct answer linearly with server-receive time", () => {
    const players = [makePlayer("late")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // Answer at t+10s of a 20s window ⇒ half points = MAX_POINTS / 2 = 500.
    vi.setSystemTime(QUESTION_START + 10_000)
    answer(ctx, "late", 1)
    const decayed = timeToPoint(QUESTION_START, 20) // 500 at this "now"
    expect(decayed).toBe(MAX_POINTS / 2)

    callShowResults(ctx)

    const r = resultFor(ctx, "late")
    // Lone correct ⇒ first-correct flat bonus on top of the decayed base.
    expect(r?.points).toBe(decayed + FIRST_CORRECT_BONUS)
  })

  it("gives a non-answering player 0 points and not-correct", () => {
    const players = [makePlayer("silent")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    // No answer at all.
    callShowResults(ctx)

    const r = resultFor(ctx, "silent")
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
    expect(r?.streak).toBe(0)
  })
})

// ── streak multiplier + cap ──────────────────────────────────────────────────

describe("streak multiplier (grows by STREAK_STEP, capped at STREAK_CAP)", () => {
  it("applies 1 + STREAK_STEP * streakBefore for a correct answer", () => {
    const players = [makePlayer("streaky")]
    // StreakBefore = 2 ⇒ mult = 1 + 0.1*2 = 1.2
    setPlayerState(players, "streaky", { streak: 2 })

    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "streaky", 1) // Correct, full base = MAX_POINTS, at t+0
    callShowResults(ctx)

    const mult = 1 + STREAK_STEP * 2
    const base = Math.round(MAX_POINTS * mult)
    // Lone correct player ⇒ first-correct flat bonus added (full base factor).
    expect(resultFor(ctx, "streaky")?.points).toBe(base + FIRST_CORRECT_BONUS)
    // StreakBefore > 0 + correct ⇒ streakBonus flag set; streak advances to 3.
    expect(resultFor(ctx, "streaky")?.streakBonus).toBe(true)
    expect(resultFor(ctx, "streaky")?.streak).toBe(3)
  })

  it("caps the multiplier at 1 + STREAK_STEP * STREAK_CAP (+50% max)", () => {
    const players = [makePlayer("hot")]
    // A streak far above the cap must NOT scale past STREAK_CAP.
    setPlayerState(players, "hot", { streak: STREAK_CAP + 100 })

    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "hot", 1) // Correct, full base at t+0
    callShowResults(ctx)

    const cappedMult = 1 + STREAK_STEP * STREAK_CAP // == 1.5
    expect(cappedMult).toBeCloseTo(1.5, 10)
    const base = Math.round(MAX_POINTS * cappedMult)
    expect(resultFor(ctx, "hot")?.points).toBe(base + FIRST_CORRECT_BONUS)
  })

  it("resets the streak to 0 on a wrong answer and applies no multiplier", () => {
    const players = [makePlayer("breaks")]
    setPlayerState(players, "breaks", { streak: 4 })

    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "breaks", 0) // WRONG
    callShowResults(ctx)

    const r = resultFor(ctx, "breaks")
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
    expect(r?.streak).toBe(0) // Reset
    expect(r?.streakBonus).toBe(false)
  })
})

// ── first-correct flat bonus ─────────────────────────────────────────────────

describe("first-correct flat FIRST_CORRECT_BONUS (first arrival only)", () => {
  it("adds the flat bonus to the first correct answer by arrival order only", () => {
    const players = [makePlayer("first"), makePlayer("second")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // "first" answers first (arrival order = push order), then "second".
    answer(ctx, "first", 1) // Correct, t+0
    vi.setSystemTime(QUESTION_START + 2_000)
    answer(ctx, "second", 1) // Correct, t+2s (slightly decayed)

    callShowResults(ctx)

    const f = resultFor(ctx, "first")
    const s = resultFor(ctx, "second")
    expect(f?.firstCorrect).toBe(true)
    expect(s?.firstCorrect).toBe(false)

    // First: full base + flat bonus (base factor 1.0 ⇒ full FIRST_CORRECT_BONUS).
    expect(f?.points).toBe(MAX_POINTS + FIRST_CORRECT_BONUS)
    // Second: decayed base, NO flat bonus. Points were captured at answer() time
    // (system time still at t+2s here), so timeToPoint(start, 20) re-derives the
    // same stored value: 1000 - (1000/20)*2 = 900.
    const secondBase = timeToPoint(QUESTION_START, 20)
    expect(secondBase).toBe(MAX_POINTS - (MAX_POINTS / 20) * 2)
    expect(s?.points).toBe(Math.round(secondBase))
    expect(s?.firstCorrect).toBe(false)
  })

  it("gives the flat bonus to the first CORRECT arrival even if a wrong answer arrived earlier", () => {
    const players = [makePlayer("earlyWrong"), makePlayer("laterRight")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    answer(ctx, "earlyWrong", 0) // Wrong, arrives first
    answer(ctx, "laterRight", 1) // Correct, arrives second

    callShowResults(ctx)

    // The wrong-but-first arrival is skipped; the first CORRECT one gets it.
    expect(resultFor(ctx, "earlyWrong")?.firstCorrect).toBe(false)
    expect(resultFor(ctx, "laterRight")?.firstCorrect).toBe(true)
    expect(resultFor(ctx, "laterRight")?.points).toBe(
      MAX_POINTS + FIRST_CORRECT_BONUS,
    )
  })
})

// ── slider accuracy + tolerance ──────────────────────────────────────────────

describe("slider accuracy + SLIDER_TOLERANCE_FRACTION tolerance", () => {
  const sliderQuizz = (): Quizz =>
    ({
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
    }) as Quizz

  it("treats a guess inside range*SLIDER_TOLERANCE_FRACTION as correct (no step)", () => {
    // Range = 100, tolerance = max(0, 100 * 0.05) = 5. Guess 53 ⇒ dist 3 ≤ 5.
    const tol = 100 * SLIDER_TOLERANCE_FRACTION
    expect(tol).toBe(5)

    const players = [makePlayer("near")]
    const ctx = buildRound({
      quizz: sliderQuizz(),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "near", 53) // Dist 3 ≤ 5 ⇒ correct, accuracy 1 - 3/100 = 0.97
    callShowResults(ctx)

    const r = resultFor(ctx, "near")
    expect(r?.correct).toBe(true)
    // Points = round(accuracy * MAX_POINTS) + first-correct(round(BONUS*accuracy))
    const accuracy = 1 - 3 / 100
    const expected =
      Math.round(accuracy * MAX_POINTS) +
      Math.round(FIRST_CORRECT_BONUS * accuracy)
    expect(r?.points).toBe(expected)
    expect(r?.firstCorrect).toBe(true)
  })

  it("an exact slider guess earns full MAX_POINTS (accuracy 1.0)", () => {
    const players = [makePlayer("exact")]
    const ctx = buildRound({
      quizz: sliderQuizz(),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "exact", 50)
    callShowResults(ctx)

    const r = resultFor(ctx, "exact")
    expect(r?.correct).toBe(true)
    expect(r?.points).toBe(MAX_POINTS + FIRST_CORRECT_BONUS)
  })

  it("a guess outside tolerance is NOT correct and earns 0 points", () => {
    // An OUT-OF-TOLERANCE slider guess (correct=false) earns NO partial credit:
    // base is gated on `within`, so it is 0 once dist exceeds the tolerance.
    const players = [makePlayer("off")]
    const ctx = buildRound({
      quizz: sliderQuizz(),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "off", 60) // Dist 10 > 5 ⇒ NOT correct ⇒ 0 points
    callShowResults(ctx)

    const r = resultFor(ctx, "off")
    expect(r?.correct).toBe(false)
    // No partial credit when outside tolerance.
    expect(r?.points).toBe(0)
    expect(r?.firstCorrect).toBe(false)
    expect(r?.streak).toBe(0) // Incorrect ⇒ streak reset
  })

  it("reports averageGuess in SHOW_RESPONSES for a slider", () => {
    const players = [makePlayer("g1"), makePlayer("g2")]
    const ctx = buildRound({
      quizz: sliderQuizz(),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "g1", 40)
    answer(ctx, "g2", 60)
    callShowResults(ctx)

    const resp = responsesPayload(ctx)
    expect(resp?.averageGuess).toBe(50) // Round((40+60)/2)
  })
})

// ── poll = neutral ───────────────────────────────────────────────────────────

describe("poll question = neutral (no correctness, no points)", () => {
  it("awards 0 points, never correct, preserves streak, sets poll flags", () => {
    const players = [makePlayer("voter")]
    setPlayerState(players, "voter", { streak: 3, points: 250 })

    const ctx = buildRound({
      quizz: quizzOf({
        type: "poll",
        answers: ["X", "Y"],
        solutions: undefined,
      }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "voter", 0)
    callShowResults(ctx)

    const r = resultFor(ctx, "voter")
    expect(r?.poll).toBe(true)
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
    // Streak preserved (poll branch uses player.streak unchanged).
    expect(r?.streak).toBe(3)
    expect(r?.myPoints).toBe(250) // Unchanged total
    expect(r?.message).toBe("game:pollThanks")
    expect(r?.streakBonus).toBe(false)
    expect(r?.bonus).toBe(false)
    expect(r?.firstCorrect).toBe(false)
  })
})

// ── practice = 0 points, streak preserved ────────────────────────────────────

describe("practice question = 0 points AND streak preserved", () => {
  it("awards 0 points but keeps the player's streak (and adds no flat bonus)", () => {
    const players = [makePlayer("learner")]
    setPlayerState(players, "learner", { streak: 4, points: 800 })

    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1], practice: true }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "learner", 1) // CORRECT but practice ⇒ 0 points
    callShowResults(ctx)

    const r = resultFor(ctx, "learner")
    // Practice still evaluates correctness for the UI tick…
    expect(r?.correct).toBe(true)
    // …but awards no points and no flat bonus.
    expect(r?.points).toBe(0)
    expect(r?.myPoints).toBe(800) // Total untouched
    // …and the streak is PRESERVED (not incremented, not reset).
    expect(r?.streak).toBe(4)
    expect(r?.firstCorrect).toBe(false)
    expect(r?.streakBonus).toBe(false)
    expect(r?.bonus).toBe(false)
  })
})

// ── bonus = points doubled ───────────────────────────────────────────────────

describe("bonus question = points doubled", () => {
  it("doubles the awarded base points (before the flat first-correct bonus)", () => {
    const players = [makePlayer("dbl")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1], bonus: true }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "dbl", 1) // Correct, full base at t+0, streak 0 ⇒ mult 1
    callShowResults(ctx)

    const r = resultFor(ctx, "dbl")
    // Points = round(MAX_POINTS * 1 * 2) + flat first-correct bonus.
    expect(r?.points).toBe(MAX_POINTS * 2 + FIRST_CORRECT_BONUS)
    expect(r?.bonus).toBe(true)
  })

  it("does NOT set the bonus flag for an incorrect answer on a bonus question", () => {
    const players = [makePlayer("missBonus")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1], bonus: true }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "missBonus", 0) // Wrong
    callShowResults(ctx)

    const r = resultFor(ctx, "missBonus")
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
    expect(r?.bonus).toBe(false) // Bonus flag only when correct
  })
})

// ── leaderboard ordering + responses snapshot ────────────────────────────────

describe("leaderboard ordering / snapshot after results", () => {
  it("sorts players by total points desc and assigns ranks + aheadOfMe", () => {
    const players = [makePlayer("low"), makePlayer("high"), makePlayer("mid")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // Arrival order: high (t+0, first-correct), mid (t+5s), low (t+15s).
    answer(ctx, "high", 1) // Full base + flat bonus
    vi.setSystemTime(QUESTION_START + 5_000)
    answer(ctx, "mid", 1) // 750 base
    vi.setSystemTime(QUESTION_START + 15_000)
    answer(ctx, "low", 1) // 250 base

    callShowResults(ctx)

    const high = resultFor(ctx, "high")
    const mid = resultFor(ctx, "mid")
    const low = resultFor(ctx, "low")

    // Ranks reflect descending points.
    expect(high?.rank).toBe(1)
    expect(mid?.rank).toBe(2)
    expect(low?.rank).toBe(3)

    // Rank 1 has nobody ahead; lower ranks name the player directly above.
    expect(high?.aheadOfMe).toBeNull()
    expect(mid?.aheadOfMe).toBe("high")
    expect(low?.aheadOfMe).toBe("mid")

    // The internal leaderboard snapshot is sorted the same way.
    const lb = (ctx.round as unknown as { leaderboard: Player[] }).leaderboard
    expect(lb.map((p) => p.clientId)).toEqual(["high", "mid", "low"])
    // PlayersAnswers is cleared at the end of results.
    expect(
      (ctx.round as unknown as { playersAnswers: unknown[] }).playersAnswers
        .length,
    ).toBe(0)
  })

  it("emits SHOW_RESPONSES to the manager with the per-answer tally", () => {
    const players = [makePlayer("a"), makePlayer("b"), makePlayer("c")]
    const ctx = buildRound({
      quizz: quizzOf({ solutions: [1] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    answer(ctx, "a", 1) // AnswerId 1
    answer(ctx, "b", 1) // AnswerId 1
    answer(ctx, "c", 2) // AnswerId 2

    callShowResults(ctx)

    const resp = responsesPayload(ctx)
    expect(resp).toBeDefined()
    // Responses is a tally keyed by answerId.
    expect(resp?.responses[1]).toBe(2)
    expect(resp?.responses[2]).toBe(1)
    // The question's solutions are echoed through (defaulted to []).
    expect(resp?.solutions).toEqual([1])
    expect(resp?.answers).toEqual(["A", "B", "C", "D"])
  })
})
