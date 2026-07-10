// CRUD + error-path tests for the Postgres-backed quizz storage layer
// (services/storage/quizz-pg.ts). No mocking library — the Hausstil for this
// repo's few DB/HTTP-adjacent tests is real infra (see http-integration.test.ts's
// real-port server), so this file follows the same idea: real razzoozle_postgres
// for the CRUD/parsing behavior, plus a deliberately-unreachable connection
// (same resetModules()+dynamic-import env-gating pattern as http-integration's
// RAZZOOLE_DEV cases) to exercise the try/catch asymmetry that no amount of
// happy-path testing against a healthy DB could ever reach.
//
// The "real Postgres" block below skips itself when DATABASE_URL isn't set
// (e.g. a machine without the razzoozle_postgres container) — the "unreachable
// DB" tests need no DATABASE_URL at all and always run.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Pool } from "pg"
import {
  deleteQuizzPg,
  getQuizzByIdPg,
  getQuizzPg,
  setQuizzArchivedPg,
  updateQuizzPg,
} from "@razzoozle/socket/services/storage/quizz-pg"

const DATABASE_URL = process.env.DATABASE_URL
const describeRealDb = DATABASE_URL ? describe : describe.skip

// Unique per-run prefix so repeated/parallel runs never collide and cleanup
// only ever touches OUR rows — never a pre-existing production/dev quizz.
const PREFIX = `qpgtest-${Date.now()}`
const id = (suffix: string) => `${PREFIX}-${suffix}`

const validQuestions = [
  {
    question: "Q1",
    type: "choice",
    answers: ["A", "B"],
    solutions: [0],
    cooldown: 5,
    time: 20,
  },
]

// Nothing is listening on 127.0.0.1:1 — pg fails fast with ECONNREFUSED rather
// than hanging out to connectionTimeoutMillis, so these stay well inside the
// suite's 10s testTimeout.
const BAD_DATABASE_URL = "postgresql://bad:bad@127.0.0.1:1/nope"

// A fresh module instance pointed at the unreachable DB — vi.resetModules()
// gives quizz-pg.ts its own never-yet-created `pool` singleton, so setting
// DATABASE_URL right before the dynamic import determines which connection it
// lazily opens on first query (mirrors http-integration.test.ts's RAZZOOLE_DEV
// re-import gating).
const badModule = async () => {
  vi.resetModules()
  process.env.DATABASE_URL = BAD_DATABASE_URL
  return import("@razzoozle/socket/services/storage/quizz-pg")
}

afterEach(() => {
  // Undo badModule()'s env mutation so the statically-imported module above
  // (already pool-primed against the REAL db in beforeAll, when available)
  // never sees a corrupted DATABASE_URL on some later lazy getPool() call.
  if (DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = DATABASE_URL
  }
})

describeRealDb("quizz-pg (real Postgres)", () => {
  let rawPool: Pool

  beforeAll(async () => {
    rawPool = new Pool({ connectionString: DATABASE_URL })
    // Prime quizz-pg's own lazily-initialized pool with the REAL url now,
    // before any "unreachable DB" test elsewhere in the file gets a chance to
    // mutate process.env.DATABASE_URL — getPool() caches its pool forever
    // after the first call, so this locks in the correct connection.
    await getQuizzPg()
  })

  afterAll(async () => {
    await rawPool.query(`DELETE FROM quizzes WHERE id LIKE $1`, [`${PREFIX}%`])
    await rawPool.end()
  })

  it("getQuizzPg filters an invalid row (empty questions) out, keeps a valid sibling", async () => {
    await updateQuizzPg(id("valid"), {
      subject: "Valid quizz",
      questions: validQuestions,
    })
    // questions: [] passes straight through updateQuizzPg (it does not
    // validate) but fails quizzValidator's .min(1) on read-back.
    await updateQuizzPg(id("invalid"), { subject: "Invalid quizz", questions: [] })

    const ours = (await getQuizzPg())
      .filter((q) => q.id.startsWith(PREFIX))
      .map((q) => q.id)

    expect(ours).toContain(id("valid"))
    expect(ours).not.toContain(id("invalid"))
  })

  it("rowToQuizz: archived NULL coalesces to false; themeId persists when set", async () => {
    // updateQuizzPg always writes an explicit boolean (data.archived ?? false)
    // — a NULL archived column only happens via a raw INSERT, bypassing it.
    await rawPool.query(
      `INSERT INTO quizzes (id, subject, questions, archived, theme_id) VALUES ($1, $2, $3, NULL, $4)`,
      [id("archived-null"), "Null archived", JSON.stringify(validQuestions), "theme-abc"],
    )

    const quizz = await getQuizzByIdPg(id("archived-null"))
    expect(quizz.archived).toBe(false)
    expect(quizz.themeId).toBe("theme-abc")
  })

  it("rowToQuizz: themeId omitted when NULL in DB", async () => {
    await updateQuizzPg(id("no-theme"), {
      subject: "No theme",
      questions: validQuestions,
    })

    const quizz = await getQuizzByIdPg(id("no-theme"))
    expect(quizz).not.toHaveProperty("themeId")
  })

  it("getQuizzByIdPg: not-found and invalid-row failures carry DIFFERENT messages", async () => {
    await expect(getQuizzByIdPg(id("missing"))).rejects.toThrow(
      `Quizz "${id("missing")}" not found`,
    )

    await updateQuizzPg(id("invalid2"), { subject: "Bad", questions: [] })
    await expect(getQuizzByIdPg(id("invalid2"))).rejects.toThrow(
      `Invalid quizz "${id("invalid2")}"`,
    )
  })

  it("updateQuizzPg: UPSERT on an existing id bumps version and persists the new data (including theme_id)", async () => {
    await updateQuizzPg(id("upsert"), {
      subject: "First",
      questions: validQuestions,
      themeId: "theme-v1",
    })
    const first = await rawPool.query(
      `SELECT version, updated_at, theme_id FROM quizzes WHERE id = $1`,
      [id("upsert")],
    )
    expect(first.rows[0].version).toBe(0)
    expect(first.rows[0].theme_id).toBe("theme-v1")

    const secondQuestions = [{ ...validQuestions[0], question: "Q1 updated" }]
    await updateQuizzPg(id("upsert"), {
      subject: "Second",
      questions: secondQuestions,
      archived: true,
      themeId: "theme-v2",
    })
    const second = await rawPool.query(
      `SELECT version, updated_at, subject, questions, archived, theme_id FROM quizzes WHERE id = $1`,
      [id("upsert")],
    )
    expect(second.rows[0].version).toBe(1)
    expect(second.rows[0].subject).toBe("Second")
    expect(second.rows[0].archived).toBe(true)
    expect(second.rows[0].theme_id).toBe("theme-v2")
    // Proves the query params bind correctly, including JSON.stringify(questions).
    expect(second.rows[0].questions).toEqual(secondQuestions)
    expect(new Date(second.rows[0].updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.rows[0].updated_at).getTime(),
    )
  })

  it("setQuizzArchivedPg: not-found throws (real DB); connection failure rethrows (unreachable DB)", async () => {
    await expect(setQuizzArchivedPg(id("missing-archive"), true)).rejects.toThrow(
      `Quizz "${id("missing-archive")}" not found`,
    )

    const bad = await badModule()
    await expect(bad.setQuizzArchivedPg("whatever", true)).rejects.toThrow()
  })

  it("deleteQuizzPg: not-found throws (real DB); connection failure rethrows (unreachable DB)", async () => {
    await expect(deleteQuizzPg(id("missing-delete"))).rejects.toThrow(
      `Quizz "${id("missing-delete")}" not found`,
    )

    const bad = await badModule()
    await expect(bad.deleteQuizzPg("whatever")).rejects.toThrow()
  })
})

// ── try/catch asymmetry — needs no working DB at all ─────────────────────────
// getQuizzPg is the ONLY one of the 5 that swallows its error and returns [];
// the other 4 rethrow. This is the single riskiest asymmetry in the file (easy
// to "fix" by accidentally aligning one direction with the other) and the only
// place it can be proven without a healthy Postgres in play.

describe("quizz-pg (unreachable DB — try/catch asymmetry, P0)", () => {
  it("getQuizzPg swallows the connection failure and resolves to [] — the one silent path", async () => {
    const mod = await badModule()
    await expect(mod.getQuizzPg()).resolves.toEqual([])
  })

  it("getQuizzByIdPg has no try/catch of its own — the connection failure propagates uncaught", async () => {
    const mod = await badModule()
    await expect(mod.getQuizzByIdPg("whatever")).rejects.toThrow()
  })

  it("updateQuizzPg rethrows the connection failure — NOT swallowed like getQuizzPg", async () => {
    const mod = await badModule()
    await expect(
      mod.updateQuizzPg("whatever", { subject: "x", questions: [] }),
    ).rejects.toThrow()
  })
})
