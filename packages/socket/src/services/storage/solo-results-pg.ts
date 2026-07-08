import type { SoloScoreEntry } from "@razzoozle/socket/services/config/solo-results"
import { randomUUID } from "crypto"

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
// Solo-results are a distinct table/concern, so a dedicated pool keeps migrations decoupled.
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

interface SoloResultRow {
  player_name: string
  score: number
  answered_at: string
  assignment_id?: string | null
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

const rowToEntry = (row: SoloResultRow): SoloScoreEntry => {
  return {
    playerName: row.player_name,
    score: row.score,
    answeredAt: toIsoString(row.answered_at),
    ...(row.assignment_id && { assignmentId: row.assignment_id }),
  }
}

/** Insert a solo result into the Postgres table. */
export const insertSoloResultPg = async (
  quizId: string,
  entry: SoloScoreEntry,
): Promise<void> => {
  try {
    const id = `${quizId}-${randomUUID()}`
    await getPool().query(
      `INSERT INTO solo_results (id, quiz_id, player_name, score, answered_at, assignment_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        quizId,
        entry.playerName,
        entry.score,
        entry.answeredAt,
        entry.assignmentId ?? null,
      ],
    )
  } catch (error) {
    console.error("solo-results-pg.insertSoloResultPg failed", error)
    throw error
  }
}

/** List solo results for a specific quiz, ordered by score descending (up to 1000). */
export const listSoloResultsPg = async (quizId: string): Promise<SoloScoreEntry[]> => {
  try {
    const result = await getPool().query(
      `SELECT player_name, score, answered_at, assignment_id
       FROM solo_results WHERE quiz_id = $1 ORDER BY score DESC LIMIT 1000`,
      [quizId],
    )
    return result.rows.map((row: SoloResultRow) => rowToEntry(row))
  } catch (error) {
    console.error("solo-results-pg.listSoloResultsPg failed", error)
    return []
  }
}

/** List all solo results grouped by quiz_id for hydration. */
export const listAllSoloResultsPg = async (): Promise<{
  quizId: string
  entries: SoloScoreEntry[]
}[]> => {
  try {
    const result = await getPool().query(
      `SELECT quiz_id, player_name, score, answered_at, assignment_id
       FROM solo_results WHERE quiz_id IS NOT NULL ORDER BY quiz_id, score DESC`,
    )

    // Group by quiz_id in JS
    const grouped: Map<string, SoloScoreEntry[]> = new Map()
    for (const row of result.rows) {
      const quizId = row.quiz_id
      if (!grouped.has(quizId)) {
        grouped.set(quizId, [])
      }
      grouped.get(quizId)!.push(rowToEntry(row as SoloResultRow))
    }

    // Convert to array of { quizId, entries }
    return Array.from(grouped.entries()).map(([quizId, entries]) => ({
      quizId,
      entries,
    }))
  } catch (error) {
    console.error("solo-results-pg.listAllSoloResultsPg failed", error)
    return []
  }
}
