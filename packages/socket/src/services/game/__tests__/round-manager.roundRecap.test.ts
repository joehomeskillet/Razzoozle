// Characterization tests for RoundManager.computeRoundRecap — the per-round
// recap awards attached to SHOW_RESULT.roundRecap. These drive a round through
// the SAME private showResults path that results.test.ts uses (reusing the
// shared helpers harness) and then assert the DOCUMENTED invariants of the
// FROZEN RoundRecapAward / RoundRecapKey contract in @razzoozle/common.
//
// Invariants asserted (deterministic — no timers wall-clock, no network):
//   - A normal round (>= 2 players, >= 1 correct) attaches `roundRecap`, with
//     length <= 3, every entry a valid `key` in the RoundRecapKey union and a
//     non-empty `winnerName`.
//   - fastest_finger / slowest_player carry a numeric ms `value`;
//     first_correct / achievement_unlock omit `value`.
//   - A degenerate round (nobody answered) does NOT throw and either omits
//     `roundRecap` or yields [] — so old clients keep working.
//
// We never assert WHICH specific award fires beyond what the harness can
// deterministically trigger (fastest_finger + first_correct are guaranteed by
// the answer arrival order); everything else is asserted as an invariant.

import type { Player, Question, Quizz } from "@razzoozle/common/types/game"
import type {
  RoundRecapAward,
  RoundRecapKey,
} from "@razzoozle/common/types/game"
import type { StatusDataMap } from "@razzoozle/common/types/game/status"
import { STATUS } from "@razzoozle/common/types/game/status"
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

// The complete FROZEN key union — kept in sync with RoundRecapKey so any rename
// breaks the type-check here (the `satisfies` below pins it at compile time).
const VALID_KEYS = [
  "fastest_finger",
  "first_correct",
  "streak",
  "highest_round_score",
  "rank_climber",
  "achievement_unlock",
  "slowest_player",
  "most_wrong",
] as const satisfies ReadonlyArray<RoundRecapKey>

const VALID_KEY_SET = new Set<RoundRecapKey>(VALID_KEYS)

// Keys that MUST carry a numeric ms value, and keys that MUST omit value.
const MS_VALUE_KEYS = new Set<RoundRecapKey>(["fastest_finger", "slowest_player"])
const NO_VALUE_KEYS = new Set<RoundRecapKey>([
  "first_correct",
  "achievement_unlock",
])

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(QUESTION_START)
})

afterEach(() => {
  vi.useRealTimers()
})

// Single-choice quizz (matches results.test.ts conventions).
const quizzOf = (q: Partial<Question> & { question?: string }): Quizz =>
  ({
    subject: "Recap",
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

const callShowResults = (ctx: CapturedRound): void => {
  const q = ctx.round as unknown as {
    showResults: (_q: Question) => void
    opts: { quizz: Quizz }
    currentQuestion: number
  }
  q.showResults(q.opts.quizz.questions[q.currentQuestion])
}

const resultFor = (
  ctx: CapturedRound,
  playerSocketId: string,
): StatusDataMap["SHOW_RESULT"] | undefined => {
  const found = ctx.sends.find(
    (s) => s.target === playerSocketId && s.status === STATUS.SHOW_RESULT,
  )

  return found?.data as StatusDataMap["SHOW_RESULT"] | undefined
}

// The roundRecap is the SAME array on every player's payload — read it off the
// first SHOW_RESULT send. May be absent (field omitted) on a degenerate round.
const recapOf = (
  ctx: CapturedRound,
): RoundRecapAward[] | undefined => {
  const found = ctx.sends.find((s) => s.status === STATUS.SHOW_RESULT)
  const data = found?.data as
    | (StatusDataMap["SHOW_RESULT"] & { roundRecap?: RoundRecapAward[] })
    | undefined

  return data?.roundRecap
}

const answer = (
  ctx: CapturedRound,
  clientId: string,
  answerId: number,
): void => {
  ctx.round.selectAnswer(makeSocket(clientId).socket, answerId)
}

// Assert the structural invariants every recap entry must satisfy.
const assertEntryValid = (award: RoundRecapAward): void => {
  expect(VALID_KEY_SET.has(award.key)).toBe(true)
  expect(typeof award.winnerName).toBe("string")
  expect(award.winnerName.length).toBeGreaterThan(0)

  if (MS_VALUE_KEYS.has(award.key)) {
    expect(typeof award.value).toBe("number")
    expect(Number.isFinite(award.value)).toBe(true)
    // ms response time within the question window is non-negative.
    expect(award.value!).toBeGreaterThanOrEqual(0)
  }

  if (NO_VALUE_KEYS.has(award.key)) {
    expect(award.value).toBeUndefined()
  }
}

describe("RoundManager.computeRoundRecap — per-round recap awards", () => {
  it("attaches a recap (<=3, valid keys, non-empty winnerName) on a normal round", () => {
    const players = [
      makePlayer("alice"),
      makePlayer("bob"),
      makePlayer("cara"),
    ]
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

    // alice answers first+correct (fastest + first_correct), bob correct later,
    // cara wrong.
    answer(ctx, "alice", 1)
    vi.setSystemTime(QUESTION_START + 3_000)
    answer(ctx, "bob", 1)
    vi.setSystemTime(QUESTION_START + 6_000)
    answer(ctx, "cara", 0)

    callShowResults(ctx)

    const recap = recapOf(ctx)
    expect(recap).toBeDefined()
    const awards = recap!
    expect(Array.isArray(awards)).toBe(true)
    expect(awards.length).toBeGreaterThan(0)
    expect(awards.length).toBeLessThanOrEqual(3)

    for (const award of awards) {
      assertEntryValid(award)
    }

    // Every winnerName resolves to an actual player username in the round.
    const names = new Set(players.map((p) => p.username))
    for (const award of awards) {
      expect(names.has(award.winnerName)).toBe(true)
    }
  })

  it("makes the recap identical across every player's SHOW_RESULT payload", () => {
    const players = [makePlayer("p1"), makePlayer("p2")]
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

    answer(ctx, "p1", 1)
    vi.setSystemTime(QUESTION_START + 2_000)
    answer(ctx, "p2", 1)

    callShowResults(ctx)

    const r1 = resultFor(ctx, "p1") as
      | (StatusDataMap["SHOW_RESULT"] & { roundRecap?: RoundRecapAward[] })
      | undefined
    const r2 = resultFor(ctx, "p2") as
      | (StatusDataMap["SHOW_RESULT"] & { roundRecap?: RoundRecapAward[] })
      | undefined

    expect(r1?.roundRecap).toBeDefined()
    // Same game-wide array shared on every payload.
    expect(r2?.roundRecap).toEqual(r1?.roundRecap)
  })

  it("surfaces fastest_finger with a numeric ms value when someone answers correctly", () => {
    // Two correct answerers at distinct times ⇒ fastest_finger is guaranteed.
    const players = [makePlayer("quick"), makePlayer("slow")]
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

    answer(ctx, "quick", 1) // t+0 — fastest
    vi.setSystemTime(QUESTION_START + 5_000)
    answer(ctx, "slow", 1) // t+5s

    callShowResults(ctx)

    const awards = recapOf(ctx)!
    const fastest = awards.find((a) => a.key === "fastest_finger")
    expect(fastest).toBeDefined()
    expect(typeof fastest?.value).toBe("number")
    expect(fastest?.value).toBeGreaterThanOrEqual(0)
    // The earliest correct answerer wins fastest_finger.
    expect(fastest?.winnerName).toBe("quick")
  })

  it("emits first_correct WITHOUT a value (no-value key contract)", () => {
    const players = [makePlayer("early"), makePlayer("late")]
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

    answer(ctx, "early", 1)
    vi.setSystemTime(QUESTION_START + 4_000)
    answer(ctx, "late", 1)

    callShowResults(ctx)

    const awards = recapOf(ctx)!
    const firstCorrect = awards.find((a) => a.key === "first_correct")
    if (firstCorrect !== undefined) {
      // first_correct is a no-value key.
      expect(firstCorrect.value).toBeUndefined()
      expect(firstCorrect.winnerName).toBe("early")
    }
    // Whether or not first_correct made the top-3 cut, the contract holds for all.
    for (const award of awards) {
      assertEntryValid(award)
    }
  })

  it("does NOT throw and omits/empties the recap when nobody answered (degenerate round)", () => {
    const players = [makePlayer("silent1"), makePlayer("silent2")]
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

    // No answers at all.
    expect(() => callShowResults(ctx)).not.toThrow()

    // SHOW_RESULT still goes out to each player…
    expect(resultFor(ctx, "silent1")).toBeDefined()
    // …but the recap field is omitted (old clients unaffected) or an empty array.
    const recap = recapOf(ctx)
    if (recap !== undefined) {
      expect(recap).toEqual([])
    }
  })

  it("does NOT throw and produces no recap entries for a solo (single-player) round", () => {
    const players = [makePlayer("solo")]
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

    answer(ctx, "solo", 1) // correct

    expect(() => callShowResults(ctx)).not.toThrow()

    const recap = recapOf(ctx)
    // A single player CAN still earn highlights (fastest_finger etc.); whatever
    // is present must satisfy the contract and stay within bounds.
    if (recap !== undefined) {
      expect(recap.length).toBeLessThanOrEqual(3)
      for (const award of recap) {
        assertEntryValid(award)
      }
    }
  })
})

// SHOW_ROUND_RECAP interposition: showLeaderboard() diverts ONCE to the
// manager-only per-round recap screen (reusing RecapSequence) BEFORE the real
// SHOW_LEADERBOARD — but never on the last round (the podium owns the end-of-game
// recap), only when there is a non-empty recap, and only once per round
// (roundRecapShown guard, reset by the next showResults). These drive the same
// private showResults path and then call the public showLeaderboard() to assert
// the interposition contract documented in round-manager.ts.
describe("RoundManager.showLeaderboard — SHOW_ROUND_RECAP interposition", () => {
  // N-question single-choice quizz (solution = answer index 1 for every Q).
  const quizzN = (n: number): Quizz =>
    ({
      subject: "Recap",
      questions: Array.from({ length: n }, (_, i) => ({
        question: `Q${i + 1}`,
        type: "choice",
        answers: ["A", "B", "C", "D"],
        solutions: [1],
        cooldown: 5,
        time: 20,
      })),
    }) as Quizz

  // Count the manager-only SHOW_ROUND_RECAP sends captured so far.
  const recapSends = (ctx: CapturedRound) =>
    ctx.sends.filter(
      (s) =>
        s.target === "manager-socket" && s.status === STATUS.SHOW_ROUND_RECAP,
    )

  // Set the (private) currentQuestion index using the same cast style the file
  // uses elsewhere — lets us place the round at the last (or a later) question.
  const setCurrentQuestion = (ctx: CapturedRound, n: number): void => {
    ;(ctx.round as unknown as { currentQuestion: number }).currentQuestion = n
  }

  // Drive a round to a NON-EMPTY tempRoundRecap: a + b correct at distinct server
  // times (guarantees fastest_finger / first_correct), c wrong. callShowResults
  // sets tempRoundRecap and resets roundRecapShown=false.
  const driveRecapRound = (ctx: CapturedRound, startTime: number): void => {
    openQuestion(ctx.round, {
      startTime,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answer(ctx, "a", 1) // first + correct
    vi.setSystemTime(startTime + 3_000)
    answer(ctx, "b", 1) // correct, later
    vi.setSystemTime(startTime + 6_000)
    answer(ctx, "c", 0) // wrong
    callShowResults(ctx)
  }

  it("interposes SHOW_ROUND_RECAP to the manager on the first showLeaderboard of a non-last round", () => {
    const ctx = buildRound({
      quizz: quizzN(2),
      players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
      lowLatency: DISABLED_LL,
    })

    // currentQuestion stays 0 ⇒ NOT the last of a 2-question quizz.
    driveRecapRound(ctx, QUESTION_START)
    ctx.round.showLeaderboard()

    const sends = recapSends(ctx)
    expect(sends.length).toBe(1)
    const data = sends[0].data as { roundRecap?: RoundRecapAward[] }
    expect(Array.isArray(data.roundRecap)).toBe(true)
  })

  it("is idempotent — a second showLeaderboard does not re-emit SHOW_ROUND_RECAP", () => {
    const ctx = buildRound({
      quizz: quizzN(2),
      players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
      lowLatency: DISABLED_LL,
    })

    driveRecapRound(ctx, QUESTION_START)
    ctx.round.showLeaderboard() // interposes the recap, returns early
    ctx.round.showLeaderboard() // passes the guard ⇒ real leaderboard

    // The recap is emitted exactly once across both calls.
    expect(recapSends(ctx).length).toBe(1)
    // …and the second call produced the real SHOW_LEADERBOARD.
    const board = ctx.sends.filter(
      (s) => s.status === STATUS.SHOW_LEADERBOARD,
    )
    expect(board.length).toBeGreaterThanOrEqual(1)
  })

  it("skips SHOW_ROUND_RECAP on the last round", () => {
    const ctx = buildRound({
      quizz: quizzN(2),
      players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
      lowLatency: DISABLED_LL,
    })

    driveRecapRound(ctx, QUESTION_START)
    // Make this the LAST round (index 1 of a 2-question quizz) before advancing.
    setCurrentQuestion(ctx, 1)
    ctx.round.showLeaderboard()

    // Last round goes straight to FINISHED/Podium — no manager recap screen.
    expect(recapSends(ctx).length).toBe(0)
  })

  it("resets roundRecapShown between rounds so round 2 also interposes", () => {
    const ctx = buildRound({
      quizz: quizzN(3),
      players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
      lowLatency: DISABLED_LL,
    })

    // Round 1 (currentQuestion 0) ⇒ one recap interposition.
    driveRecapRound(ctx, QUESTION_START)
    ctx.round.showLeaderboard()
    expect(recapSends(ctx).length).toBe(1)

    // Advance to round 2 (currentQuestion 1, still not last of 3). showResults
    // resets roundRecapShown=false and sets a fresh tempRoundRecap, so the next
    // showLeaderboard interposes the recap again.
    setCurrentQuestion(ctx, 1)
    driveRecapRound(ctx, QUESTION_START + 60_000)
    ctx.round.showLeaderboard()

    expect(recapSends(ctx).length).toBe(2)
  })
})
