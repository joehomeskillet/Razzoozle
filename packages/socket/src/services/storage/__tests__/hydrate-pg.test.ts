// Test the hydrate-pg no-clobber guard: verify that hydrating results
// from DB does NOT overwrite file-based results that have questions/recap
// when the DB row lacks them (stale/lossy rows).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import fs from "fs"
import path from "path"
import { Pool } from "pg"
import { updateResultPg, listAllResultsPg } from "@razzoozle/socket/services/storage/results-pg"
import { hydrateConfigFromPg } from "@razzoozle/socket/services/storage/hydrate-pg"
import { getPath } from "@razzoozle/socket/services/config/shared"
import type { GameResult, GameResultPlayer, QuestionResult, ManagerRecap } from "@razzoozle/common/types/game"

const DATABASE_URL = process.env.DATABASE_URL
const describeRealDb = DATABASE_URL ? describe : describe.skip

const PREFIX = `hpgtest-${Date.now()}`
const id = (suffix: string) => `${PREFIX}-${suffix}`

const validPlayer: GameResultPlayer = {
  username: "Bob",
  points: 200,
  rank: 1,
}

const validQuestion: QuestionResult = {
  question: "Question 1",
  type: "choice",
  answers: ["A", "B"],
  solutions: [0],
  cooldown: 5,
  time: 20,
  playerAnswers: [
    {
      playerName: "Bob",
      answerId: 0,
      responseMs: 2000,
    },
  ],
}

const validRecap: ManagerRecap = {
  superlatives: [
    {
      key: "most_correct",
      winnerName: "Bob",
      value: 5,
    },
  ],
}

const resultWithAllFields: GameResult = {
  id: id("guard-test"),
  subject: "Test Quiz",
  date: new Date().toISOString(),
  players: [validPlayer],
  questions: [validQuestion],
  recap: validRecap,
}

const resultMinimalFields: GameResult = {
  id: id("guard-test"),
  subject: "Test Quiz",
  date: new Date().toISOString(),
  players: [validPlayer],
  questions: [],
  // no recap
}

describeRealDb("hydrate-pg guard (real Postgres)", () => {
  let rawPool: Pool

  beforeAll(async () => {
    rawPool = new Pool({ connectionString: DATABASE_URL })
    // Set up the hydration environment.
    process.env.DATABASE_MODE = "pg"
    await listAllResultsPg()
  })

  afterAll(async () => {
    await rawPool.query(`DELETE FROM game_results WHERE id LIKE $1`, [`${PREFIX}%`])
    await rawPool.end()
    delete process.env.DATABASE_MODE
  })

  it("hydrate does NOT clobber file that has questions/recap with DB row that lacks them", async () => {
    // Step 1: Write result with all fields to file directly (simulating legacy save).
    const resultsDir = getPath("results")
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    const filePath = getPath(`results/${resultWithAllFields.id}.json`)
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          subject: resultWithAllFields.subject,
          date: resultWithAllFields.date,
          players: resultWithAllFields.players,
          questions: resultWithAllFields.questions,
          recap: resultWithAllFields.recap,
        },
        null,
        2,
      ),
    )

    // Step 2: Write a LOSSY row to the DB (simulating old buggy INSERT that omits questions/recap).
    await rawPool.query(
      `INSERT INTO game_results (id, subject, date, players, questions, recap) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        resultMinimalFields.id,
        resultMinimalFields.subject,
        resultMinimalFields.date,
        JSON.stringify(resultMinimalFields.players),
        null, // Missing questions
        null, // Missing recap
      ],
    )

    // Step 3: Run hydration (which would normally overwrite the file).
    await hydrateConfigFromPg()

    // Step 4: Verify file still has the original questions/recap (not clobbered).
    const fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    expect(fileContent.questions).toEqual(resultWithAllFields.questions)
    expect(fileContent.recap).toEqual(resultWithAllFields.recap)
  })

  it("hydrate DOES write file when DB row has matching data", async () => {
    // Step 1: Write full result to DB (proper INSERT).
    await updateResultPg(resultWithAllFields)

    // Step 2: Delete the file so hydrate will write it.
    const filePath = getPath(`results/${resultWithAllFields.id}.json`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Step 3: Run hydration.
    await hydrateConfigFromPg()

    // Step 4: Verify file was written and has all fields.
    expect(fs.existsSync(filePath)).toBe(true)
    const fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    expect(fileContent.questions).toEqual(resultWithAllFields.questions)
    expect(fileContent.recap).toEqual(resultWithAllFields.recap)
  })
})
