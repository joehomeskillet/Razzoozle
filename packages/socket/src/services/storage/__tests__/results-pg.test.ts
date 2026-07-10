// CRUD + roundtrip + hydrate-guard tests for Postgres-backed results storage layer
// (services/storage/results-pg.ts). Uses real Postgres when DATABASE_URL is set,
// skips gracefully otherwise. Tests verify questions/recap persistence fix.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Pool } from "pg"
import {
  deleteResultPg,
  getResultByIdPg,
  listAllResultsPg,
  updateResultPg,
} from "@razzoozle/socket/services/storage/results-pg"
import type { GameResult, GameResultPlayer, QuestionResult, ManagerRecap } from "@razzoozle/common/types/game"

const DATABASE_URL = process.env.DATABASE_URL
const describeRealDb = DATABASE_URL ? describe : describe.skip

// Unique per-run prefix for test isolation.
const PREFIX = `rpgtest-${Date.now()}`
const id = (suffix: string) => `${PREFIX}-${suffix}`

const validPlayer: GameResultPlayer = {
  username: "Alice",
  points: 100,
  rank: 1,
}

const validQuestion: QuestionResult = {
  question: "What is 2+2?",
  type: "choice",
  answers: ["3", "4", "5"],
  solutions: [1],
  cooldown: 5,
  time: 20,
  playerAnswers: [
    {
      playerName: "Alice",
      answerId: 1,
      responseMs: 1000,
    },
  ],
}

const validRecap: ManagerRecap = {
  superlatives: [
    {
      key: "fastest_finger",
      winnerName: "Alice",
      value: 500,
    },
  ],
}

const validResult: GameResult = {
  id: id("valid"),
  subject: "Math Quiz",
  date: new Date().toISOString(),
  players: [validPlayer],
  questions: [validQuestion],
  recap: validRecap,
}

// Nothing is listening on 127.0.0.1:1 — pg fails fast with ECONNREFUSED.
const BAD_DATABASE_URL = "postgresql://bad:bad@127.0.0.1:1/nope"

const badModule = async () => {
  vi.resetModules()
  process.env.DATABASE_URL = BAD_DATABASE_URL
  return import("@razzoozle/socket/services/storage/results-pg")
}

afterEach(() => {
  // Undo badModule()'s env mutation.
  if (DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = DATABASE_URL
  }
})

describeRealDb("results-pg (real Postgres)", () => {
  let rawPool: Pool

  beforeAll(async () => {
    rawPool = new Pool({ connectionString: DATABASE_URL })
    // Prime the module's pool before any "unreachable DB" test mutates DATABASE_URL.
    await listAllResultsPg()
  })

  afterAll(async () => {
    await rawPool.query(`DELETE FROM game_results WHERE id LIKE $1`, [`${PREFIX}%`])
    await rawPool.end()
  })

  it("roundtrip: persist result with questions + recap, read back identically", async () => {
    await updateResultPg(validResult)
    const loaded = await getResultByIdPg(validResult.id)

    // Verify all fields survive the round-trip.
    expect(loaded.id).toBe(validResult.id)
    expect(loaded.subject).toBe(validResult.subject)
    expect(loaded.players).toEqual(validResult.players)
    expect(loaded.questions).toEqual(validResult.questions)
    expect(loaded.recap).toEqual(validResult.recap)
  })

  it("persist result without recap, read back without recap", async () => {
    const resultNoRecap: GameResult = {
      ...validResult,
      id: id("no-recap"),
      recap: undefined,
    }
    await updateResultPg(resultNoRecap)
    const loaded = await getResultByIdPg(resultNoRecap.id)

    expect(loaded.questions).toEqual(validResult.questions)
    expect(loaded.recap).toBeUndefined()
  })

  it("listAllResultsPg deserializes all fields correctly", async () => {
    await updateResultPg(validResult)
    const all = await listAllResultsPg()
    const found = all.find((r) => r.id === validResult.id)

    expect(found).toBeDefined()
    expect(found!.questions).toEqual(validResult.questions)
    expect(found!.recap).toEqual(validResult.recap)
  })

  it("updateResultPg UPSERT bumps version on existing id", async () => {
    const id1 = id("upsert")
    await updateResultPg({ ...validResult, id: id1 })

    const first = await rawPool.query(
      `SELECT version FROM game_results WHERE id = $1`,
      [id1],
    )
    expect(first.rows[0].version).toBe(0)

    // Re-save with different subject.
    await updateResultPg({ ...validResult, id: id1, subject: "Updated Subject" })
    const second = await rawPool.query(
      `SELECT version, subject FROM game_results WHERE id = $1`,
      [id1],
    )
    expect(second.rows[0].version).toBe(1)
    expect(second.rows[0].subject).toBe("Updated Subject")
  })

  it("getResultByIdPg throws on missing id", async () => {
    await expect(getResultByIdPg(id("missing"))).rejects.toThrow(
      `Result "${id("missing")}" not found`,
    )
  })

  it("deleteResultPg removes result from DB", async () => {
    const id1 = id("delete-me")
    await updateResultPg({ ...validResult, id: id1 })
    await deleteResultPg(id1)

    // Verify it's gone.
    const remaining = await listAllResultsPg()
    expect(remaining.find((r) => r.id === id1)).toBeUndefined()
  })

  it("deleteResultPg throws on missing id", async () => {
    await expect(deleteResultPg(id("missing-delete"))).rejects.toThrow(
      `Result "${id("missing-delete")}" not found`,
    )
  })
})

// Unreachable DB tests — verify error handling consistency.
describe("results-pg (unreachable DB — error handling)", () => {
  it("listAllResultsPg swallows connection failure and resolves to []", async () => {
    const mod = await badModule()
    await expect(mod.listAllResultsPg()).resolves.toEqual([])
  })

  it("getResultByIdPg propagates connection failure as rejection", async () => {
    const mod = await badModule()
    await expect(mod.getResultByIdPg("whatever")).rejects.toThrow()
  })

  it("updateResultPg rethrows connection failure", async () => {
    const mod = await badModule()
    await expect(mod.updateResultPg(validResult)).rejects.toThrow()
  })

  it("deleteResultPg rethrows connection failure", async () => {
    const mod = await badModule()
    await expect(mod.deleteResultPg("whatever")).rejects.toThrow()
  })
})
