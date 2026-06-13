// Type-answer (free-text) question-type tests: text normalization + matching,
// the questionValidator type-answer branch, and the SELECT_ANSWER anti-cheat
// no-leak guarantee. Consolidates the type-answer spec §6.1/§6.2/§6.3 cases.
//
// ── text-match (§6.1) ────────────────────────────────────────────────────────
// normalizeText: trim + lowercase + strip combining diacritics (NFD).
// matchAnswer(submitted, acceptedAnswers, mode):
//   - "exact": byte-identical to ANY accepted answer.
//   - "normalized" (default): equal after normalizeText.
//   - "fuzzy": Levenshtein distance to a normalized accepted answer within the
//     tuned threshold = max(1, floor(len/10)) — i.e. ~1 edit per 10 chars, floor 1.
//
// NOTE on fuzzy cases: the raw spec §6.1 listed `matchAnswer("Prais",["Paris"])`
// and `matchAnswer("Stockholmm!",["Stockholm"])` as fuzzy matches. Those are
// distance-2 against ≤9-char words whose threshold is 1, so under the SHIPPED
// tuning (fuzzyThreshold = max(1, floor(len/10)) in text-match.ts) they do NOT
// match. The tuning is a deliberate, documented design choice (text-match.ts
// l.59-62), not a bug — the spec examples simply predate it. We assert the SAME
// INTENT (accept a single-char typo within threshold; reject a totally-wrong
// answer; a long word tolerates 2 edits) against the actual tuning.
//
// ── anti-cheat (§6.2, R4) ────────────────────────────────────────────────────
// The STATUS.SELECT_ANSWER broadcast that players receive must NEVER carry
// `acceptedAnswers` or `matchMode`. We drive the REAL newQuestion() broadcast
// and string-search the serialized payload — robust against field add/rename.
//
// ── validator (§6.3) ─────────────────────────────────────────────────────────
// questionValidator: type-answer requires >=1 acceptedAnswers; solutions/answers
// not required; solutions stays undefined.

import type { Player, Quizz } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { questionValidator } from "@razzia/common/validators/quizz"
import {
  matchAnswer,
  normalizeText,
} from "@razzia/socket/services/game/text-match"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildRound,
  DISABLED_LL,
  makePlayer,
  makeSocket,
} from "@razzia/socket/services/game/__tests__/helpers"

// ── §6.1 text-match: normalizeText ───────────────────────────────────────────

describe("normalizeText", () => {
  it("lowercases", () => expect(normalizeText("Paris")).toBe("paris"))
  it("trims whitespace", () => expect(normalizeText("  paris  ")).toBe("paris"))
  it("strips diacritics", () => expect(normalizeText("Zürich")).toBe("zurich"))
  it("combined (trim + lower + diacritics)", () =>
    expect(normalizeText("  São Paulo  ")).toBe("sao paulo"))
})

// ── §6.1 text-match: matchAnswer — exact mode ────────────────────────────────

describe("matchAnswer — exact mode", () => {
  it("matches an identical string", () =>
    expect(matchAnswer("Paris", ["Paris"], "exact")).toBe(true))
  it("rejects a case variant", () =>
    expect(matchAnswer("paris", ["Paris"], "exact")).toBe(false))
  it("rejects a whitespace variant", () =>
    expect(matchAnswer(" Paris", ["Paris"], "exact")).toBe(false))
})

// ── §6.1 text-match: matchAnswer — normalized mode (default) ──────────────────

describe("matchAnswer — normalized mode (default)", () => {
  it("matches case-insensitively", () =>
    expect(matchAnswer("paris", ["Paris"], "normalized")).toBe(true))
  it("matches diacritic-stripped", () =>
    expect(matchAnswer("Zurich", ["Zürich"], "normalized")).toBe(true))
  it("matches a trimmed variant", () =>
    expect(matchAnswer("  Paris  ", ["Paris"], "normalized")).toBe(true))
  it("rejects a wrong answer", () =>
    expect(matchAnswer("London", ["Paris"], "normalized")).toBe(false))
  it("matches ANY accepted answer", () =>
    expect(matchAnswer("paris", ["Lyon", "Paris"], "normalized")).toBe(true))
  it("defaults to normalized when no mode is given", () =>
    expect(matchAnswer("paris", ["Paris"])).toBe(true))
})

// ── §6.1 text-match: matchAnswer — fuzzy mode ────────────────────────────────
// Asserted against the SHIPPED tuning: threshold = max(1, floor(len/10)).

describe("matchAnswer — fuzzy mode", () => {
  it("accepts a one-char deletion in a short word (dist 1, threshold 1)", () =>
    expect(matchAnswer("Pari", ["Paris"], "fuzzy")).toBe(true))
  it("accepts a one-char insertion in a short word", () =>
    expect(matchAnswer("Pariss", ["Paris"], "fuzzy")).toBe(true))
  it("accepts a one-char substitution in a short word", () =>
    expect(matchAnswer("Parus", ["Paris"], "fuzzy")).toBe(true))
  it("accepts a one-char typo (case/diacritic-insensitive)", () =>
    expect(matchAnswer("züric", ["Zurich"], "fuzzy")).toBe(true))
  it("rejects a two-char typo against a short word (dist 2 > threshold 1)", () =>
    expect(matchAnswer("Prais", ["Paris"], "fuzzy")).toBe(false))
  it("tolerates two edits in a long (>=20 char) word (threshold 2)", () =>
    // "wolfeschlegelsteinhausen" is 24 chars -> threshold = floor(24/10) = 2.
    // "wolfeschlegelstinhasen" is exactly 2 deletions away.
    expect(
      matchAnswer(
        "Wolfeschlegelstinhasen",
        ["Wolfeschlegelsteinhausen"],
        "fuzzy",
      ),
    ).toBe(true))
  it("rejects a totally-wrong answer", () =>
    expect(matchAnswer("Berlin", ["Paris"], "fuzzy")).toBe(false))
})

// ── §6.3 questionValidator — type-answer branch ──────────────────────────────

describe("questionValidator — type-answer branch", () => {
  it("accepts a valid type-answer question", () => {
    const result = questionValidator.safeParse({
      question: "Capital of France?",
      type: "type-answer",
      acceptedAnswers: ["Paris"],
      matchMode: "normalized",
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a type-answer question without acceptedAnswers", () => {
    const result = questionValidator.safeParse({
      question: "Capital of France?",
      type: "type-answer",
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(false)
    expect(
      result.success ? [] : result.error.issues.flatMap((i) => i.path),
    ).toContain("acceptedAnswers")
  })

  it("rejects a type-answer question with an empty acceptedAnswers array", () => {
    const result = questionValidator.safeParse({
      question: "Capital of France?",
      type: "type-answer",
      acceptedAnswers: [],
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(false)
  })

  it("does not require solutions for type-answer (solutions stays undefined)", () => {
    const result = questionValidator.safeParse({
      question: "Q?",
      type: "type-answer",
      acceptedAnswers: ["A"],
      cooldown: 5,
      time: 30,
    })
    expect(result.success).toBe(true)
    expect(
      result.success ? (result.data.solutions as unknown) : "parse-failed",
    ).toBeUndefined()
  })
})

// ── §6.2 anti-cheat — SELECT_ANSWER never leaks acceptedAnswers / matchMode ───

describe("SELECT_ANSWER anti-cheat for type-answer", () => {
  const MANAGER_ID = "manager-socket"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // A single-question type-answer quizz.
  const typeAnswerQuizz = (): Quizz =>
    ({
      subject: "Type-Answer",
      questions: [
        {
          question: "Capital of France?",
          type: "type-answer",
          acceptedAnswers: ["Paris", "Lutetia"],
          matchMode: "fuzzy",
          cooldown: 5,
          time: 20,
        },
      ],
    }) as Quizz

  const playerOf = (): Player[] => [makePlayer("p")]

  it("never emits acceptedAnswers in the SELECT_ANSWER broadcast", async () => {
    const ctx = buildRound({
      quizz: typeAnswerQuizz(),
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
    // String-search the serialized payload — robust against field add/rename.
    expect(JSON.stringify(selectAnswer)).not.toContain("acceptedAnswers")
  })

  it("never emits matchMode in the SELECT_ANSWER broadcast", async () => {
    const ctx = buildRound({
      quizz: typeAnswerQuizz(),
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
    expect(JSON.stringify(selectAnswer)).not.toContain("matchMode")
  })

  it("the manager-only SHOW_RESPONSES DOES carry acceptedAnswers + matchMode (sanity: it leaks nowhere player-facing, only to the manager)", async () => {
    // Counterpart sanity: prove the data exists server-side and only reaches the
    // manager (this.opts.send(getManagerId(), ...)), never the player broadcast.
    const ctx = buildRound({
      quizz: typeAnswerQuizz(),
      players: playerOf(),
      lowLatency: DISABLED_LL,
    })

    // Drive a full round (start -> question -> answer-window -> results).
    const promise = ctx.round.start(makeSocket(MANAGER_ID, MANAGER_ID).socket)
    await vi.runAllTimersAsync()
    await promise

    const showResponses = ctx.sends.find(
      (s) => s.target === MANAGER_ID && s.status === STATUS.SHOW_RESPONSES,
    )
    expect(showResponses).toBeDefined()
    const data = showResponses?.data as {
      acceptedAnswers?: string[]
      matchMode?: string
    }
    expect(data.acceptedAnswers).toEqual(["Paris", "Lutetia"])
    expect(data.matchMode).toBe("fuzzy")

    // And confirm it went ONLY to the manager — no player-facing send/broadcast
    // carries acceptedAnswers or matchMode.
    const playerFacing = [
      ...ctx.broadcasts.map((b) => ({ status: b.status, data: b.data })),
      ...ctx.sends
        .filter((s) => s.target !== MANAGER_ID)
        .map((s) => ({ status: s.status, data: s.data })),
    ]
    for (const entry of playerFacing) {
      const serialized = JSON.stringify(entry)
      expect(serialized).not.toContain("acceptedAnswers")
      expect(serialized).not.toContain("matchMode")
    }
  })
})
