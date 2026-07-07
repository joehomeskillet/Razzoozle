import type { CatalogEntry } from "@razzoozle/common/types/catalog"
import { catalogEntryValidator } from "@razzoozle/common/validators/catalog"

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
// class is scoped to game_config/manager_password). Catalog entries are a distinct
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

interface CatalogRow {
  id: string
  question: unknown
  tags: unknown
  source: string | null
  added_at: string | null
}

// Convert DB row to CatalogEntry, validating against the schema.
const rowToCatalogEntry = (row: CatalogRow): CatalogEntry | null => {
  const candidate = {
    id: row.id,
    question: row.question,
    tags: row.tags,
    source: row.source,
    addedAt: row.added_at,
  }
  const result = catalogEntryValidator.safeParse(candidate)

  if (!result.success) {
    console.warn(`catalog-pg: invalid catalog entry "${row.id}":`, result.error.issues)
    return null
  }

  return result.data as CatalogEntry
}

/** Read all catalog entries from Postgres (for boot hydration). */
export const listAllCatalogEntriesPg = async (): Promise<CatalogEntry[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, question, tags, source, added_at FROM catalog_entries ORDER BY id`,
    )
    return result.rows
      .map((row: CatalogRow) => rowToCatalogEntry(row))
      .filter((entry: CatalogEntry | null): entry is CatalogEntry => entry !== null)
  } catch (error) {
    console.error("catalog-pg.listAllCatalogEntriesPg failed", error)
    return []
  }
}

/** Upsert (create-or-update) a catalog entry by id. version += 1 on update, updated_at = NOW(). */
export const upsertCatalogEntryPg = async (
  id: string,
  data: { question: CatalogEntry["question"]; tags?: string[]; source?: string; addedAt: string },
): Promise<{ id: string }> => {
  try {
    // Catalog source must be one of: upload, ai, submission (DB CHECK constraint).
    // If missing or invalid, default to 'upload'.
    const validSource =
      data.source && ["upload", "ai", "submission"].includes(data.source)
        ? data.source
        : "upload"

    await getPool().query(
      `INSERT INTO catalog_entries (id, question, tags, source, added_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         question = EXCLUDED.question,
         tags = EXCLUDED.tags,
         source = EXCLUDED.source,
         version = catalog_entries.version + 1,
         updated_at = NOW()`,
      [
        id,
        JSON.stringify(data.question),
        data.tags ? JSON.stringify(data.tags) : null,
        validSource,
        data.addedAt,
      ],
    )
    return { id }
  } catch (error) {
    console.error("catalog-pg.upsertCatalogEntryPg failed", error)
    throw error
  }
}

/** Delete a catalog entry by id. */
export const deleteCatalogEntryPg = async (id: string): Promise<void> => {
  try {
    const result = await getPool().query(`DELETE FROM catalog_entries WHERE id = $1`, [id])
    if (result.rowCount === 0) {
      throw new Error(`Catalog entry "${id}" not found`)
    }
  } catch (error) {
    console.error("catalog-pg.deleteCatalogEntryPg failed", error)
    throw error
  }
}
