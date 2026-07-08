import type { Assignment } from "@razzoozle/common/validators/assignment"
import { assignmentValidator } from "@razzoozle/common/validators/assignment"

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
// class is scoped to game_config/manager_password). Assignments are a distinct
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

interface AssignmentRow {
  id: string
  quiz_id: string
  assigned_at: string
  metadata: Record<string, unknown>
}

const rowToAssignment = (row: AssignmentRow): Assignment | null => {
  const candidate = {
    id: row.id,
    quizzId: row.quiz_id,
    createdAt: new Date(row.assigned_at).getTime(),
    ...(row.metadata.deadline !== undefined && { deadline: row.metadata.deadline }),
    ...(row.metadata.maxAttempts !== undefined && { maxAttempts: row.metadata.maxAttempts }),
    ...(row.metadata.requireIdentifier !== undefined && {
      requireIdentifier: row.metadata.requireIdentifier,
    }),
    ...(row.metadata.showCorrectAnswers !== undefined && {
      showCorrectAnswers: row.metadata.showCorrectAnswers,
    }),
  }

  const result = assignmentValidator.safeParse(candidate)

  if (!result.success) {
    console.error(`assignments-pg: invalid assignment row "${row.id}":`, result.error.issues)
    return null
  }

  return result.data as Assignment
}

/** Read all assignments from Postgres (mirrors file-based listAssignments() listing). */
export const listAllAssignmentsPg = async (): Promise<Assignment[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, quiz_id, assigned_at, metadata
       FROM assignments ORDER BY assigned_at DESC`,
    )
    const assignments = result.rows
      .map((row: AssignmentRow) => rowToAssignment(row))
      .filter((a: Assignment | null): a is Assignment => a !== null)

    if (result.rows.length > 0 && assignments.length === 0) {
      console.error(`assignments-pg: all ${result.rows.length} rows failed validation`)
    }

    return assignments
  } catch (error) {
    console.error("assignments-pg.listAllAssignmentsPg failed", error)
    return []
  }
}

/** Upsert (create-or-update) an assignment by id. version += 1 on update, updated_at = NOW(). */
export const upsertAssignmentPg = async (a: Assignment): Promise<{ id: string }> => {
  try {
    // Build metadata object: include only keys where value is not null/undefined
    const metadata: Record<string, unknown> = {}
    if (a.deadline !== null && a.deadline !== undefined) {
      metadata.deadline = a.deadline
    }
    if (a.maxAttempts !== null && a.maxAttempts !== undefined) {
      metadata.maxAttempts = a.maxAttempts
    }
    if (a.requireIdentifier !== null && a.requireIdentifier !== undefined) {
      metadata.requireIdentifier = a.requireIdentifier
    }
    if (a.showCorrectAnswers !== null && a.showCorrectAnswers !== undefined) {
      metadata.showCorrectAnswers = a.showCorrectAnswers
    }

    await getPool().query(
      `INSERT INTO assignments (id, quiz_id, assigned_to, assigned_at, metadata, version)
       VALUES ($1, $2, NULL, to_timestamp($3 / 1000.0), $4, 0)
       ON CONFLICT (id) DO UPDATE SET
         quiz_id = EXCLUDED.quiz_id,
         assigned_at = EXCLUDED.assigned_at,
         metadata = EXCLUDED.metadata,
         version = assignments.version + 1,
         updated_at = NOW()`,
      [a.id, a.quizzId, a.createdAt, JSON.stringify(metadata)],
    )
    return { id: a.id }
  } catch (error) {
    console.error("assignments-pg.upsertAssignmentPg failed", error)
    throw error
  }
}
