import type { GameResult, GameResultPlayer } from "@razzoozle/common/types/game"
import { gameResultValidator } from "@razzoozle/socket/services/validators"

// Lazy-load pg so it is only required when DATABASE_MODE is dual/pg/pg-only.
// Mirrors the pattern in storage/postgres-repository.ts.
let Pool: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Pool = require("pg").Pool
} catch {
  // pg not installed — the functions below will throw when invoked.
}

// Own lazily-initialized pool, separate from PostgresRepository's pool.
// Results are a distinct table/concern, so a dedicated pool keeps migrations decoupled.
let pool: any = null

const getPool = (): any => {
  if (pool) {
    return pool
  }
  if (!Pool) {
    throw new Error("pg package not installed. Install with: pnpm add pg")
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured")
  }
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
  return pool
}

interface ResultRow {
  id: string
  quiz_id: string | null
  subject: string | null
  date: string | null
  players: unknown
  questions: unknown
  recap: unknown
}

// Normalize Date to ISO string (node-postgres parses timestamptz as Date).
const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === "string") {
    return value
  }
  return new Date().toISOString()
}

const rowToResult = (row: ResultRow): GameResult | null => {
  const candidate: any = {
    id: row.id,
    subject: row.subject ?? "",
    date: toIsoString(row.date),
    players: Array.isArray(row.players) ? row.players : [],
    questions: Array.isArray(row.questions) ? row.questions : [],
  }
  // Deserialize recap if present (optional field).
  if (row.recap) {
    candidate.recap = row.recap
  }
  // Include quiz_id if present (optional field).
  if (row.quiz_id) {
    candidate.quizId = row.quiz_id
  }
  const result = gameResultValidator.safeParse(candidate)

  if (!result.success) {
    console.warn(`results-pg: invalid result row "${row.id}":`, result.error.issues)
    return null
  }

  return result.data as GameResult
}

/** Read all results from Postgres (for boot-time hydration). */
export const listAllResultsPg = async (): Promise<GameResult[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, quiz_id, subject, date, players, questions, recap FROM game_results ORDER BY date DESC`,
    )
    return result.rows
      .map((row: ResultRow) => rowToResult(row))
      .filter((r: GameResult | null): r is GameResult => r !== null)
  } catch (error) {
    console.error("results-pg.listAllResultsPg failed", error)
    return []
  }
}

/** Read a single result by id from Postgres (in-memory find over listAllResultsPg
 * — mirrors the file-based getResultById(), which also throws on a missing id). */
export const getResultByIdPg = async (id: string): Promise<GameResult> => {
  const results = await listAllResultsPg()
  const result = results.find((r) => r.id === id)
  if (!result) {
    throw new Error(`Result "${id}" not found`)
  }
  return result
}

/** Upsert (create-or-update) a result by id. version += 1 on update, updated_at = NOW(). */
export const updateResultPg = async (data: GameResult): Promise<{ id: string }> => {
  try {
    const playersArray = (data.players ?? []) as GameResultPlayer[]
    const questionsJson = JSON.stringify(data.questions ?? [])
    const recapJson = data.recap ? JSON.stringify(data.recap) : null
    await getPool().query(
      `INSERT INTO game_results (id, quiz_id, subject, date, players, questions, recap)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         quiz_id = COALESCE(EXCLUDED.quiz_id, game_results.quiz_id),
         subject = EXCLUDED.subject,
         date = EXCLUDED.date,
         players = EXCLUDED.players,
         questions = EXCLUDED.questions,
         recap = EXCLUDED.recap,
         version = game_results.version + 1,
         updated_at = NOW()`,
      [data.id, data.quizId ?? null, data.subject, data.date, JSON.stringify(playersArray), questionsJson, recapJson],
    )
    return { id: data.id }
  } catch (error) {
    console.error("results-pg.updateResultPg failed", error)
    throw error
  }
}

/** Delete a result by id. */
export const deleteResultPg = async (id: string): Promise<void> => {
  try {
    const result = await getPool().query(
      `DELETE FROM game_results WHERE id = $1`,
      [id],
    )
    if (result.rowCount === 0) {
      throw new Error(`Result "${id}" not found`)
    }
  } catch (error) {
    console.error("results-pg.deleteResultPg failed", error)
    throw error
  }
}
