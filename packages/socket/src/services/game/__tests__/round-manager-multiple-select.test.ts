// Multiple-select question-type tests for the RoundManager scoring + anti-cheat
// + histogram pipeline, plus the questionValidator multiple-select branch.
//
// Pattern mirrors results.test.ts exactly: build a round with the lightweight
// fakes (helpers.ts), accept answers via the REAL selectAnswer path, then invoke
// the (private) showResults to read the emitted SHOW_RESULT (per player) and
// SHOW_RESPONSES (manager-only) payloads. evalAnswer is a private closure inside
// showResults, so its all-or-nothing verdict is asserted through the public
// SHOW_RESULT.correct it produces — never reflected at directly.
//
// Multiple-select wire shape: the client sends an ARRAY of selected option
// indices as the `answerId` arg to selectAnswer (handlers/game.ts passes
// `answerKeys ?? answerKey`). The server stores them in Answer.answerIds and a
// -1 sentinel in answerId. evalAnswer compares the selected SET to question
// .solutions: correct iff equal size AND every solution is selected (order
// irrelevant — Set comparison; no partial credit).
//
// Anti-cheat (R4): the STATUS.SELECT_ANSWER broadcast that players receive must
// NEVER carry `solutions` (or the slider `correct` sentinel). The no-leak test
// drives the REAL newQuestion() broadcast and string-searches the serialized
// payload — robust against field addition/renaming.
//
// All time is controlled with vi.useFakeTimers()/setSystemTime so points are
// deterministic (the all-or-nothing scoring is independent of time, but the
// shared harness assumes a fixed system clock).

import type { Question, Quizz } from "@razzoozle/common/types/game"
import { STATUS, type StatusDataMap } from "@razzoozle/common/types/game/status"
import { questionValidator } from "@razzoozle/common/validators/quizz"
import { selectedAnswerValidator } from "@razzoozle/socket/services/validators"
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

// ── Local harness (reuse the buildRound fakes; reach the private bits the same
//    way helpers.ts / results.test.ts already do) ─────────────────────────────

// A single-question multiple-select quizz with 4 answers (defaults overridable).
const multiSelectQuizz = (q: Partial<Question> = {}): Quizz =>
  ({
    subject: "Multiple-Select",
    questions: [
      {
        question: "Q1",
        type: "multiple-select",
        answers: ["A", "B", "C", "D"],
        solutions: [0, 2],
        cooldown: 5,
        time: 20,
        ...q,
      },
    ],
  }) as Quizz

// Invoke the private showResults(question) exactly as newQuestion() would after
// the answer window closes (identical to results.test.ts).
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

// Accept a multiple-select answer (an ARRAY of selected option indices) for a
// clientId at the current system time — the real selectAnswer path.
const answerMulti = (
  ctx: CapturedRound,
  clientId: string,
  answerKeys: number[],
): void => {
  ctx.round.selectAnswer(makeSocket(clientId).socket, answerKeys)
}

// Open the window and run the full all-or-nothing flow for ONE player whose
// selected set is `answerKeys`, returning the resulting SHOW_RESULT.
const evalFor = (
  answerKeys: number[],
  solutions: number[],
): StatusDataMap["SHOW_RESULT"] | undefined => {
  const players = [makePlayer("p")]
  const ctx = buildRound({
    quizz: multiSelectQuizz({ solutions }),
    players,
    lowLatency: DISABLED_LL,
  })
  openQuestion(ctx.round, {
    startTime: QUESTION_START,
    ll: DISABLED_LL,
    questionTimeSec: 20,
  })

  if (answerKeys.length > 0) {
    answerMulti(ctx, "p", answerKeys)
  }

  callShowResults(ctx)

  return resultFor(ctx, "p")
}

// ── 6.2 Scoring correctness — evalAnswer all-or-nothing ──────────────────────

describe("multiple-select evalAnswer (all-or-nothing)", () => {
  it("exact match = correct (base 1)", () => {
    // Solutions [0,2], selected [0,2] -> correct.
    const r = evalFor([0, 2], [0, 2])
    expect(r?.correct).toBe(true)
    // Lone correct player => also first-correct; base factor 1 => non-zero points.
    expect(r?.points).toBeGreaterThan(0)
  })

  it("superset = incorrect (selected too many)", () => {
    // Solutions [0,2], selected [0,1,2] -> size 3 !== 2 -> incorrect.
    const r = evalFor([0, 1, 2], [0, 2])
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
  })

  it("subset = incorrect (missed one)", () => {
    // Solutions [0,2], selected [0] -> size 1 !== 2 -> incorrect.
    const r = evalFor([0], [0, 2])
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
  })

  it("wrong set = incorrect", () => {
    // Solutions [0,2], selected [1,3] -> same size, content differs -> incorrect.
    const r = evalFor([1, 3], [0, 2])
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
  })

  it("order does not matter (Set comparison)", () => {
    // Solutions [0,2], selected [2,0] -> correct.
    const r = evalFor([2, 0], [0, 2])
    expect(r?.correct).toBe(true)
    expect(r?.points).toBeGreaterThan(0)
  })

  it("empty selection = incorrect", () => {
    // No answer submitted at all -> not-correct, 0 points.
    const r = evalFor([], [0, 2])
    expect(r?.correct).toBe(false)
    expect(r?.points).toBe(0)
  })

  it("all options selected for a 3-solution question = incorrect (size guard)", () => {
    // Solutions [0,1,2], selected ALL four [0,1,2,3] -> size 4 !== 3 -> incorrect.
    const players = [makePlayer("p")]
    const ctx = buildRound({
      quizz: multiSelectQuizz({
        answers: ["A", "B", "C", "D"],
        solutions: [0, 1, 2],
      }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerMulti(ctx, "p", [0, 1, 2, 3])
    callShowResults(ctx)
    expect(resultFor(ctx, "p")?.correct).toBe(false)
  })

  it("dedups duplicate selected keys before size comparison", () => {
    // Client smuggles [0,0,2] — server dedups to {0,2} which equals solutions.
    const players = [makePlayer("p")]
    const ctx = buildRound({
      quizz: multiSelectQuizz({ solutions: [0, 2] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })
    answerMulti(ctx, "p", [0, 0, 2])
    callShowResults(ctx)
    expect(resultFor(ctx, "p")?.correct).toBe(true)
  })
})

// ── 6.3 Anti-cheat regression ────────────────────────────────────────────────

describe("multiple-select anti-cheat", () => {
  it("rejects a scalar answerKey for a multiple-select question (no answer stored)", () => {
    // A hostile client sends a scalar where an array is required: silent reject.
    const players = [makePlayer("p")]
    const ctx = buildRound({
      quizz: multiSelectQuizz({ solutions: [0, 2] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // Scalar 0 sent to a multiple-select question — shape mismatch, rejected.
    ctx.round.selectAnswer(makeSocket("p").socket, 0)

    const stored = (
      ctx.round as unknown as { playersAnswers: unknown[] }
    ).playersAnswers
    expect(stored).toHaveLength(0)
  })

  it("rejects an array answerKeys for a choice question (no answer stored)", () => {
    // Mirror of the above: an array is malformed for a scalar (choice) type.
    const players = [makePlayer("p")]
    const ctx = buildRound({
      quizz: {
        subject: "Choice",
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
      } as Quizz,
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    // Array [0,1] sent to a scalar (choice) question — shape mismatch, rejected.
    ctx.round.selectAnswer(makeSocket("p").socket, [0, 1])

    const stored = (
      ctx.round as unknown as { playersAnswers: unknown[] }
    ).playersAnswers
    expect(stored).toHaveLength(0)
  })

  it("validator rejects an answerKeys payload exceeding max(4)", () => {
    const ok = selectedAnswerValidator.safeParse({
      answerKey: -1,
      answerKeys: [0, 1, 2, 3],
    })
    expect(ok.success).toBe(true)

    const tooMany = selectedAnswerValidator.safeParse({
      answerKey: -1,
      answerKeys: [0, 1, 2, 3, 4],
    })
    expect(tooMany.success).toBe(false)
  })

  it("SELECT_ANSWER broadcast never carries solutions (or the slider correct sentinel)", async () => {
    // Drive the REAL newQuestion() broadcast (fake timers flush its sleeps).
    const players = [makePlayer("p")]
    const ctx = buildRound({
      quizz: multiSelectQuizz({ solutions: [0, 2] }),
      players,
      lowLatency: DISABLED_LL,
    })

    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()
    await promise

    const selectAnswer = ctx.broadcasts.find(
      (b) => b.status === STATUS.SELECT_ANSWER,
    )
    expect(selectAnswer).toBeDefined()

    const payload = selectAnswer?.data as Record<string, unknown>
    // No correct-answer data may ever reach players (anti-cheat R4).
    expect(payload).not.toHaveProperty("solutions")
    expect(payload).not.toHaveProperty("correct")
    // String-search the serialized payload — robust against renames.
    const serialized = JSON.stringify(selectAnswer)
    expect(serialized).not.toContain("solutions")
    expect(serialized).not.toContain('"correct"')
  })
})

// ── 6.4 Histogram (per-option counts) ────────────────────────────────────────

describe("multiple-select histogram (responses / totalType)", () => {
  it("accumulates per-option counts independently (not a -1 sentinel bucket)", () => {
    // Player A selects [0,2], Player B selects [0,1] -> {0:2, 1:1, 2:1}.
    const players = [makePlayer("A"), makePlayer("B")]
    const ctx = buildRound({
      quizz: multiSelectQuizz({ solutions: [0, 2] }),
      players,
      lowLatency: DISABLED_LL,
    })
    openQuestion(ctx.round, {
      startTime: QUESTION_START,
      ll: DISABLED_LL,
      questionTimeSec: 20,
    })

    answerMulti(ctx, "A", [0, 2])
    answerMulti(ctx, "B", [0, 1])
    callShowResults(ctx)

    const responses = responsesPayload(ctx)?.responses
    expect(responses).toEqual({ 0: 2, 1: 1, 2: 1 })
    // The -1 sentinel must NOT be counted as an option bucket.
    expect(responses).not.toHaveProperty("-1")
  })
})

// ── 6.5 questionValidator multiple-select branch ─────────────────────────────

describe("questionValidator multiple-select branch", () => {
  it("accepts a valid question with 2+ solutions", () => {
    const result = questionValidator.safeParse({
      type: "multiple-select",
      question: "Pick the even numbers",
      answers: ["A", "B", "C", "D"],
      solutions: [0, 2],
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a single solution (needs >=2)", () => {
    const result = questionValidator.safeParse({
      type: "multiple-select",
      question: "Q?",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(false)
    expect(
      result.success ? [] : result.error.issues.flatMap((i) => i.path),
    ).toContain("solutions")
  })

  it("rejects zero solutions", () => {
    // An empty solutions array fails the union's .min(1) before superRefine, so
    // assert only that the whole parse fails (the intent: no <2-solution MS Q).
    const result = questionValidator.safeParse({
      type: "multiple-select",
      question: "Q?",
      answers: ["A", "B", "C", "D"],
      solutions: [],
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(false)
  })
})
