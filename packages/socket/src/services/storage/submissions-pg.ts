import type { Submission } from "@razzoozle/common/types/submission"
import { submissionRecordValidator } from "@razzoozle/common/validators/submission"

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
// class is scoped to game_config/manager_password). Submissions are a distinct
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

interface SubmissionRow {
  id: string
  submitted_by: string
  submitted_at: string
  status: string
  question: unknown
  source?: string
  category?: string
  rejection_reason?: string
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

const rowToSubmission = (row: SubmissionRow): Submission | null => {
  const candidate = {
    id: row.id,
    submittedBy: row.submitted_by,
    submittedAt: toIsoString(row.submitted_at),
    status: row.status,
    question: row.question,
    ...(row.category && { category: row.category }),
    ...(row.rejection_reason && { rejectionReason: row.rejection_reason }),
    ...(row.source && { source: row.source }),
  }
  const result = submissionRecordValidator.safeParse(candidate)

  if (!result.success) {
    console.error(`submissions-pg: invalid submission row "${row.id}":`, result.error.issues)
    return null
  }

  return result.data as Submission
}

/** Read all submissions from Postgres (mirrors file-based getSubmissions() listing). */
export const listAllSubmissionsPg = async (): Promise<Submission[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, submitted_by, submitted_at, status, question, source, category, rejection_reason
       FROM submissions ORDER BY submitted_at DESC`,
    )
    const submissions = result.rows
      .map((row: SubmissionRow) => rowToSubmission(row))
      .filter((s: Submission | null): s is Submission => s !== null)

    if (result.rows.length > 0 && submissions.length === 0) {
      console.error(`submissions-pg: all ${result.rows.length} rows failed validation`)
    }

    return submissions
  } catch (error) {
    console.error("submissions-pg.listAllSubmissionsPg failed", error)
    return []
  }
}

/** Read a single submission by id from Postgres (in-memory find over the full
 * list — mirrors file-based getSubmissionById(), which returns null on a miss). */
export const getSubmissionByIdPg = async (id: string): Promise<Submission | null> => {
  const submissions = await listAllSubmissionsPg()
  return submissions.find((s) => s.id === id) ?? null
}

/** Count submissions still awaiting moderation (mirrors file-based
 * countPendingSubmissions()). NO in-memory cache here — a fresh listAllSubmissionsPg
 * query per call, consistent with the "no cache" principle for the PG read path. */
export const countPendingSubmissionsPg = async (): Promise<number> => {
  const submissions = await listAllSubmissionsPg()
  return submissions.filter((s) => s.status === "pending").length
}

/** Upsert (create-or-update) a submission by id. version += 1 on update, updated_at = NOW(). */
export const upsertSubmissionPg = async (data: Submission): Promise<{ id: string }> => {
  try {
    await getPool().query(
      `INSERT INTO submissions (id, submitted_by, submitted_at, status, question, source, category, rejection_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         submitted_by = EXCLUDED.submitted_by,
         submitted_at = EXCLUDED.submitted_at,
         status = EXCLUDED.status,
         question = EXCLUDED.question,
         source = EXCLUDED.source,
         category = EXCLUDED.category,
         rejection_reason = EXCLUDED.rejection_reason,
         version = submissions.version + 1,
         updated_at = NOW()`,
      [
        data.id,
        data.submittedBy,
        data.submittedAt,
        data.status,
        JSON.stringify(data.question),
        'submission',
        data.category ?? null,
        data.rejectionReason ?? null,
      ],
    )
    return { id: data.id }
  } catch (error) {
    console.error("submissions-pg.upsertSubmissionPg failed", error)
    throw error
  }
}

/** Delete a submission by id. */
export const deleteSubmissionPg = async (id: string): Promise<void> => {
  try {
    const result = await getPool().query(`DELETE FROM submissions WHERE id = $1`, [id])
    if (result.rowCount === 0) {
      throw new Error(`Submission "${id}" not found`)
    }
  } catch (error) {
    console.error("submissions-pg.deleteSubmissionPg failed", error)
    throw error
  }
}
