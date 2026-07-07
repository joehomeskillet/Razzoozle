// Pure-function unit tests for computeAchievementAwards (achievement-awards.ts)
// and computeRoundRecap (round-recap.ts) — both extracted verbatim from
// RoundManager.showResults (see each file's header comment). Everything the
// RoundManager-integration suites (achievements-teams.test.ts,
// round-manager.roundRecap.test.ts) cover indirectly through buildRound() +
// showResults() is deliberately NOT repeated here; this file targets the
// pure-function edge cases those integration tests can't reach — bot
// short-circuit, the two persistent caps, the re-sort/bonus fold-in, the
// defensive livePlayer-miss, empty input, the slider-type guard, disabled-badge
// gating, and computeRoundRecap's early-return + never-throws contract.
//
// No RoundManager, no buildRound, no fake io/socket — computeAchievementAwards
// and computeRoundRecap are called directly with hand-built ctx/params/rows, so
// there is nothing here to reflect into private fields.
import type {
  AchievementId,
  MergedAchievement,
} from "@razzoozle/common/achievements"
import { mergeAchievementsConfig } from "@razzoozle/common/achievements"
import type { Player, Question } from "@razzoozle/common/types/game"
import { describe, expect, it } from "vitest"
import { computeAchievementAwards } from "@razzoozle/socket/services/game/round-manager/achievement-awards"
import type {
  AchievementScoringRow,
  AchievementsCtx,
  ComputeAchievementAwardsParams,
  RecapStat,
} from "@razzoozle/socket/services/game/round-manager/achievement-awards-types"
import { computeRoundRecap } from "@razzoozle/socket/services/game/round-manager/round-recap"

// ── fixtures ─────────────────────────────────────────────────────────────────

const defaultAchievementsConfig = (): Map<AchievementId, MergedAchievement> =>
  new Map(mergeAchievementsConfig(undefined).map((a) => [a.id, a]))

const makeCtx = (overrides: Partial<AchievementsCtx> = {}): AchievementsCtx => ({
  gameCounters: new Map(),
  recapStats: new Map(),
  questionStats: new Map(),
  achievementsConfig: defaultAchievementsConfig(),
  answerReceivedAt: new Map(),
  currentQuestion: 0,
  ...overrides,
})

const makeRow = (
  clientId: string,
  overrides: Partial<AchievementScoringRow> = {},
): AchievementScoringRow => ({
  clientId,
  username: clientId,
  isBot: false,
  points: 0,
  lastPoints: 0,
  aScored: true,
  aIsCorrect: false,
  aBaseFactor: 0,
  aStreakAfter: 0,
  aResponseTimeMs: null,
  aPointsBefore: 0,
  aPointsAfter: 0,
  ...overrides,
})

const makeQuestion = (overrides: Partial<Question> = {}): Question =>
  ({
    question: "Q?",
    type: "choice",
    answers: ["A", "B"],
    solutions: [0],
    cooldown: 5,
    time: 20,
    ...overrides,
  }) as Question

const makeParams = (
  overrides: Partial<ComputeAchievementAwardsParams> = {},
): ComputeAchievementAwardsParams => ({
  sortedPlayers: [],
  currentPlayers: [],
  rankBefore: new Map(),
  hasPriorRound: false,
  firstCorrectId: null,
  isLastScoredRound: false,
  totalScoredQuestions: 0,
  question: makeQuestion(),
  ...overrides,
})

const makeLivePlayer = (clientId: string, points: number): Player => ({
  id: clientId,
  clientId,
  connected: true,
  username: clientId,
  points,
  streak: 0,
})

// ── computeAchievementAwards ─────────────────────────────────────────────────

describe("computeAchievementAwards — bot short-circuit", () => {
  it("a bot row is skipped before any mutation, even when aScored is true", () => {
    const ctx = makeCtx()
    const bot = makeRow("bot", {
      isBot: true,
      aScored: true,
      aIsCorrect: true,
      aStreakAfter: 3,
    })

    const result = computeAchievementAwards(
      ctx,
      makeParams({ sortedPlayers: [bot], currentPlayers: [] }),
    )

    expect(result.achievementsByClient.has("bot")).toBe(false)
    expect(result.bonusByClient.has("bot")).toBe(false)
    // The early `if (row.isBot) return` fires before gameCounters/recapStats
    // are touched at all — neither map gets an entry for the bot.
    expect(ctx.gameCounters.has("bot")).toBe(false)
    expect(ctx.recapStats.has("bot")).toBe(false)
  })
})

describe("computeAchievementAwards — recap.achievementIds cap (50, cumulative across rounds)", () => {
  it("caps at 50 and keeps the FIRST 50 (a fresh unlock this round is the one sliced off)", () => {
    const ctx = makeCtx()
    // Pre-seed a prior-rounds accumulator already AT the cap — the real award
    // mechanism can never reach 50 on its own (only 14 ids exist in the
    // registry), so this reproduces the "already near the cap" state directly
    // via ctx, exactly as it would look after many real rounds.
    const seeded = Array.from({ length: 50 }, (_, i) => `seed-${i}`)
    const priorRecap: RecapStat = {
      username: "a",
      fastestMs: null,
      peakStreak: 0,
      correct: 0,
      wrong: 0,
      answered: 0,
      bestClimb: 0,
      worstRankEver: 1,
      achievementCount: 50,
      achievementIds: [...seeded],
      luckyGuess: false,
    }
    ctx.recapStats.set("a", priorRecap)

    // This round unlocks a genuine 51st (distinct) id: first_correct.
    const answerReceivedAt = new Map([["a", 1_000]])
    const row = makeRow("a", { aIsCorrect: true, aScored: true })
    computeAchievementAwards(
      { ...ctx, answerReceivedAt },
      makeParams({ sortedPlayers: [row], currentPlayers: [] }),
    )

    const recap = ctx.recapStats.get("a")
    expect(recap?.achievementIds).toHaveLength(50)
    // slice(0, 50) keeps the ORIGINAL 50 — the just-pushed 51st (appended at
    // the end) is the one that gets dropped, not one of the seeded ids.
    expect(recap?.achievementIds).toEqual(seeded)
    expect(recap?.achievementIds).not.toContain("first_correct")
  })
})

describe("computeAchievementAwards — re-sort after bonus fold-in", () => {
  it("a bonus can REVERSE sortedPlayers order vs. the caller's pre-bonus rank", () => {
    const ctx = makeCtx({
      achievementsConfig: new Map(
        mergeAchievementsConfig({ first_correct: { bonus: 1000 } }).map(
          (a) => [a.id, a],
        ),
      ),
    })

    // Pre-round order (as the caller would pass it in): a (100) ahead of b (50).
    const rowA = makeRow("a", { points: 100, aScored: false })
    const rowB = makeRow("b", {
      points: 50,
      aScored: true,
      aIsCorrect: true,
    })
    const answerReceivedAt = new Map([["b", 1_000]])

    const params = makeParams({
      sortedPlayers: [rowA, rowB],
      currentPlayers: [makeLivePlayer("a", 100), makeLivePlayer("b", 50)],
    })
    computeAchievementAwards({ ...ctx, answerReceivedAt }, params)

    // b unlocked first_correct → +1000 bonus → 1050, now ahead of a's 100.
    expect(params.sortedPlayers.map((r) => r.clientId)).toEqual(["b", "a"])
  })
})

describe("computeAchievementAwards — defensive livePlayer miss", () => {
  it("still books the bonus on row.points/bonusByClient when the live player isn't found", () => {
    const ctx = makeCtx({
      achievementsConfig: new Map(
        mergeAchievementsConfig({ first_correct: { bonus: 50 } }).map((a) => [
          a.id,
          a,
        ]),
      ),
    })
    const row = makeRow("a", {
      aIsCorrect: true,
      aScored: true,
      points: 100,
      lastPoints: 10,
    })
    const answerReceivedAt = new Map([["a", 1_000]])

    // currentPlayers does NOT contain "a" — the find() misses.
    const result = computeAchievementAwards(
      { ...ctx, answerReceivedAt },
      makeParams({ sortedPlayers: [row], currentPlayers: [] }),
    )

    expect(result.bonusByClient.get("a")).toBe(50)
    expect(row.points).toBe(150)
    expect(row.lastPoints).toBe(60)
  })
})

describe("computeAchievementAwards — empty input", () => {
  it("an empty sortedPlayers yields empty maps and does not throw", () => {
    const ctx = makeCtx()
    const result = computeAchievementAwards(
      ctx,
      makeParams({ sortedPlayers: [], currentPlayers: [] }),
    )
    expect(result.achievementsByClient.size).toBe(0)
    expect(result.bonusByClient.size).toBe(0)
  })
})

describe("computeAchievementAwards — sharpshooter type guard", () => {
  it("never fires on a non-slider question, even at perfect accuracy", () => {
    const ctx = makeCtx()
    const row = makeRow("a", {
      aIsCorrect: true,
      aScored: true,
      aBaseFactor: 1, // would be well over the 95% threshold on a slider
    })
    const answerReceivedAt = new Map([["a", 1_000]])

    const result = computeAchievementAwards(
      { ...ctx, answerReceivedAt },
      makeParams({
        sortedPlayers: [row],
        currentPlayers: [],
        question: makeQuestion({ type: "choice" }),
      }),
    )

    expect(result.achievementsByClient.get("a") ?? []).not.toContain(
      "sharpshooter",
    )
  })
})

describe("computeAchievementAwards — disabled-badge gating", () => {
  it("a disabled achievement never unlocks even when its condition holds", () => {
    const ctx = makeCtx({
      achievementsConfig: new Map(
        mergeAchievementsConfig({ streak_3: { enabled: false } }).map((a) => [
          a.id,
          a,
        ]),
      ),
    })
    const row = makeRow("a", {
      aIsCorrect: true,
      aScored: true,
      aStreakAfter: 3,
    })
    const answerReceivedAt = new Map([["a", 1_000]])

    const result = computeAchievementAwards(
      { ...ctx, answerReceivedAt },
      makeParams({ sortedPlayers: [row], currentPlayers: [] }),
    )
    const got = result.achievementsByClient.get("a") ?? []

    expect(got).not.toContain("streak_3")
    // An unrelated, enabled badge on the same row still fires — proves the
    // gate is per-id, not a global kill switch.
    expect(got).toContain("first_correct")
  })
})

// ── computeRoundRecap (round-recap.ts) ───────────────────────────────────────
// Grouped here rather than a third file — both modules were split out of the
// same RoundManager.showResults block and share this file's fixture style.

describe("computeRoundRecap — early return", () => {
  it("returns [] immediately for empty rows, and for all-bot rows", () => {
    expect(
      computeRoundRecap([], new Map(), new Map(), new Map(), null, false),
    ).toEqual([])

    const allBotRows = [
      {
        clientId: "bot",
        username: "bot",
        isBot: true,
        aIsCorrect: true,
        aResponseTimeMs: 100,
        aStreakAfter: 5,
        lastPoints: 100,
        answeredThisRound: true,
      },
    ]
    expect(
      computeRoundRecap(allBotRows, new Map(), new Map(), new Map(), null, false),
    ).toEqual([])
  })
})

describe("computeRoundRecap — never throws", () => {
  it("an internal error is swallowed by the catch-all and yields []", () => {
    const rows = [
      {
        clientId: "a",
        username: "a",
        isBot: false,
        aIsCorrect: true,
        aResponseTimeMs: 100,
        aStreakAfter: 5,
        lastPoints: 100,
        answeredThisRound: true,
      },
    ]
    const rankBefore = new Map([["a", 3]])
    // A rankAfterByClient whose .get() throws forces the ONLY reachable
    // failure path (the rank_climber loop, gated on hasPriorRound) to blow up
    // mid-computation — proving the try/catch really is a catch-ALL, not just
    // documentation.
    const throwingRankAfter = {
      get: () => {
        throw new Error("boom")
      },
    } as unknown as ReadonlyMap<string, number>

    expect(
      computeRoundRecap(
        rows,
        throwingRankAfter,
        rankBefore,
        new Map(),
        null,
        true,
      ),
    ).toEqual([])
  })
})
