import type { QuizzMeta, QuizzWithId } from "@razzoozle/common/types/game"
import { quizzValidator } from "@razzoozle/common/validators/quizz"

// Lazy-load pg so it is only required when DATABASE_MODE is dual/pg/pg-only.
// Mirrors the pattern in storage/postgres-repository.ts.
let Pool: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Pool = require("pg").Pool
} catch {
  // pg not installed — the functions below will throw when invoked.
}

// Own lazily-initialized pool, separate from PostgresRepository's pool (that
// class is scoped to game_config/manager_password). Quizzes are a distinct
// table/concern, so a dedicated pool keeps the two migrations decoupled.
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

interface QuizzRow {
  id: string
  subject: string | null
  questions: unknown
  archived: boolean | null
}

// themeId has no column in the `quizzes` table (matches rust db.rs, which
// also always yields theme_id: None) — dropped on the DB round-trip.
const rowToQuizz = (row: QuizzRow): QuizzWithId | null => {
  const candidate = {
    subject: row.subject ?? "",
    questions: row.questions ?? [],
    archived: !!row.archived,
  }
  const result = quizzValidator.safeParse(candidate)

  if (!result.success) {
    console.warn(`quizz-pg: invalid quizz row "${row.id}":`, result.error.issues)

    return null
  }

  return { id: row.id, ...result.data }
}

/** Read all quizzes from Postgres (no archived filter — mirrors the file-based getQuizz() listing, which includes archived quizzes for the manager UI). */
export const getQuizzPg = async (): Promise<QuizzWithId[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, subject, questions, archived FROM quizzes ORDER BY id`,
    )
    return result.rows
      .map((row: QuizzRow) => rowToQuizz(row))
      .filter((q: QuizzWithId | null): q is QuizzWithId => q !== null)
  } catch (error) {
    console.error("quizz-pg.getQuizzPg failed", error)
    return []
  }
}

export const getQuizzMetaPg = async (): Promise<QuizzMeta[]> => {
  const quizz = await getQuizzPg()
  return quizz.map(
    (q): QuizzMeta => ({
      id: q.id,
      subject: q.subject,
      archived: !!q.archived,
      questionCount: q.questions.length,
    }),
  )
}

export const getQuizzByIdPg = async (id: string): Promise<QuizzWithId> => {
  const result = await getPool().query(
    `SELECT id, subject, questions, archived FROM quizzes WHERE id = $1`,
    [id],
  )
  if (result.rows.length === 0) {
    throw new Error(`Quizz "${id}" not found`)
  }
  const quizz = rowToQuizz(result.rows[0])
  if (!quizz) {
    throw new Error(`Invalid quizz "${id}"`)
  }
  return quizz
}

/** Upsert (create-or-update) a quizz by id. version += 1 on update, updated_at = NOW(). */
export const updateQuizzPg = async (
  id: string,
  data: { subject: string; questions: unknown; archived?: boolean },
): Promise<{ id: string }> => {
  try {
    await getPool().query(
      `INSERT INTO quizzes (id, subject, questions, archived)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         subject = EXCLUDED.subject,
         questions = EXCLUDED.questions,
         archived = EXCLUDED.archived,
         version = quizzes.version + 1,
         updated_at = NOW()`,
      [id, data.subject, JSON.stringify(data.questions), data.archived ?? false],
    )
    return { id }
  } catch (error) {
    console.error("quizz-pg.updateQuizzPg failed", error)
    throw error
  }
}

export const setQuizzArchivedPg = async (
  id: string,
  archived: boolean,
): Promise<void> => {
  try {
    const result = await getPool().query(
      `UPDATE quizzes SET
         archived = $1,
         archived_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
         version = version + 1,
         updated_at = NOW()
       WHERE id = $2`,
      [archived, id],
    )
    if (result.rowCount === 0) {
      throw new Error(`Quizz "${id}" not found`)
    }
  } catch (error) {
    console.error("quizz-pg.setQuizzArchivedPg failed", error)
    throw error
  }
}

export const deleteQuizzPg = async (id: string): Promise<void> => {
  try {
    const result = await getPool().query(`DELETE FROM quizzes WHERE id = $1`, [
      id,
    ])
    if (result.rowCount === 0) {
      throw new Error(`Quizz "${id}" not found`)
    }
  } catch (error) {
    console.error("quizz-pg.deleteQuizzPg failed", error)
    throw error
  }
}
