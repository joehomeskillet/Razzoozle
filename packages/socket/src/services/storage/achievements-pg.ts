import type { AchievementsConfig } from "@razzoozle/common/validators/achievements"

// Lazy-load pg so it is only required when DATABASE_MODE is dual/pg/pg-only.
// Mirrors the pattern in storage/quizz-pg.ts.
let Pool: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Pool = require("pg").Pool
} catch {
  // pg not installed — the functions below will throw when invoked.
}

// Own lazily-initialized pool, separate from other config pools.
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

interface AchievementRow {
  id: string
  enabled: boolean | null
  name: string | null
  description: string | null
  threshold: number | null
  bonus: number | null
}

const rowToAchievementConfig = (row: AchievementRow): [string, any] => {
  const override: any = {}
  if (row.enabled !== null && row.enabled !== true) {
    override.enabled = row.enabled
  }
  if (row.name !== null) {
    override.name = row.name
  }
  if (row.description !== null) {
    override.description = row.description
  }
  if (row.threshold !== null) {
    override.threshold = row.threshold
  }
  if (row.bonus !== null && row.bonus !== 0) {
    override.bonus = row.bonus
  }
  return [row.id, override]
}

/**
 * Read all achievements from Postgres (mirrors file-based getAchievementsConfig()).
 * Returns a record mapping achievement id to override object.
 */
export const listAllAchievementsPg = async (): Promise<AchievementsConfig> => {
  try {
    const result = await getPool().query(
      `SELECT id, enabled, name, description, threshold, bonus FROM achievements_config ORDER BY id`,
    )
    const config: AchievementsConfig = {}
    for (const row of result.rows) {
      const [id, override] = rowToAchievementConfig(row as AchievementRow)
      if (Object.keys(override).length > 0) {
        config[id] = override
      }
    }
    return config
  } catch (error) {
    console.error("achievements-pg.listAllAchievementsPg failed", error)
    return {}
  }
}

/**
 * Upsert (create-or-update) a single achievement override by id.
 * version += 1 on update, updated_at = NOW().
 */
export const upsertAchievementPg = async (
  id: string,
  data: {
    enabled?: boolean
    name?: string | null
    description?: string | null
    threshold?: number | null
    bonus?: number | null
  },
): Promise<{ id: string }> => {
  try {
    await getPool().query(
      `INSERT INTO achievements_config (id, enabled, name, description, threshold, bonus)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         enabled = COALESCE($2, achievements_config.enabled),
         name = COALESCE($3, achievements_config.name),
         description = COALESCE($4, achievements_config.description),
         threshold = COALESCE($5, achievements_config.threshold),
         bonus = COALESCE($6, achievements_config.bonus),
         version = achievements_config.version + 1,
         updated_at = NOW()`,
      [
        id,
        data.enabled ?? null,
        data.name ?? null,
        data.description ?? null,
        data.threshold ?? null,
        data.bonus ?? null,
      ],
    )
    return { id }
  } catch (error) {
    console.error("achievements-pg.upsertAchievementPg failed", error)
    throw error
  }
}

export const deleteAchievementPg = async (id: string): Promise<void> => {
  try {
    const result = await getPool().query(
      `DELETE FROM achievements_config WHERE id = $1`,
      [id],
    )
    if (result.rowCount === 0) {
      throw new Error(`Achievement "${id}" not found`)
    }
  } catch (error) {
    console.error("achievements-pg.deleteAchievementPg failed", error)
    throw error
  }
}
