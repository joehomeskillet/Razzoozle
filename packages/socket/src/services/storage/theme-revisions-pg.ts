import type { ThemeRevision } from "@razzoozle/common/types/theme"
import { themeRevisionValidator } from "@razzoozle/common/validators/theme"

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
// class is scoped to game_config/manager_password). Theme revisions are a distinct
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

interface ThemeRevisionRow {
  id: number
  theme_id: string
  theme_snapshot: unknown
  created_at: string
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

const rowToThemeRevision = (row: ThemeRevisionRow): ThemeRevision | null => {
  const candidate = row.theme_snapshot
  const result = themeRevisionValidator.safeParse(candidate)

  if (!result.success) {
    console.error(
      `theme-revisions-pg: invalid revision row (db id ${row.id}):`,
      result.error.issues,
    )
    return null
  }

  return result.data as ThemeRevision
}

/** Read all theme revisions from Postgres (newest-first, capped at 10). */
export const listThemeRevisionsPg = async (): Promise<ThemeRevision[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, theme_id, theme_snapshot, created_at
       FROM theme_revisions
       WHERE theme_id = 'active'
       ORDER BY id DESC
       LIMIT 10`,
    )
    const revisions = result.rows
      .map((row: ThemeRevisionRow) => rowToThemeRevision(row))
      .filter((r: ThemeRevision | null): r is ThemeRevision => r !== null)

    if (result.rows.length > 0 && revisions.length === 0) {
      console.error(
        `theme-revisions-pg: all ${result.rows.length} rows failed validation`,
      )
    }

    return revisions
  } catch (error) {
    console.error("theme-revisions-pg.listThemeRevisionsPg failed", error)
    return []
  }
}

/** Read a single theme revision by id from Postgres (in-memory find over the
 * newest-10 ring — mirrors file-based getThemeRevisionById(), which returns
 * null on a miss). */
export const getThemeRevisionByIdPg = async (id: string): Promise<ThemeRevision | null> => {
  const revisions = await listThemeRevisionsPg()
  return revisions.find((r) => r.id === id) ?? null
}

/** Insert a theme revision (theme_id='active', snapshot=$1, created_at=$2), then prune to newest 10. */
export const insertThemeRevisionPg = async (entry: ThemeRevision): Promise<void> => {
  try {
    const pool = getPool()

    // INSERT the new revision
    await pool.query(
      `INSERT INTO theme_revisions (theme_id, theme_snapshot, created_at)
       VALUES ($1, $2, $3::timestamptz)`,
      ["active", JSON.stringify(entry), entry.createdAt],
    )

    // Prune to newest 10 for theme_id='active'
    await pool.query(
      `DELETE FROM theme_revisions
       WHERE theme_id = 'active'
       AND id NOT IN (
         SELECT id FROM theme_revisions
         WHERE theme_id = 'active'
         ORDER BY id DESC
         LIMIT 10
       )`,
    )
  } catch (error) {
    console.error("theme-revisions-pg.insertThemeRevisionPg failed", error)
    throw error
  }
}
