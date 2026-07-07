import type { Theme, ThemeTemplate } from "@razzoozle/common/types/theme"
import { themeValidator, themeTemplateValidator } from "@razzoozle/common/validators/theme"

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
// class is scoped to game_config/manager_password). Themes are a distinct
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

interface ThemeRow {
  id: string
  name: string | null
  theme: unknown
}

const rowToTheme = (row: ThemeRow): Theme | null => {
  const result = themeValidator.safeParse(row.theme)
  if (!result.success) {
    console.warn(`theme-pg: invalid theme row "${row.id}":`, result.error.issues)
    return null
  }
  return result.data
}

const rowToThemeTemplate = (row: ThemeRow): ThemeTemplate | null => {
  const candidate = {
    id: row.id,
    name: row.name ?? "",
    theme: row.theme,
  }
  const result = themeTemplateValidator.safeParse(candidate)
  if (!result.success) {
    console.warn(`theme-pg: invalid theme template row "${row.id}":`, result.error.issues)
    return null
  }
  return { ...result.data, id: row.id }
}

/** Read all themes and templates from Postgres (mirrors file-based getTheme + getThemeTemplates). */
export const listAllThemesPg = async (): Promise<{
  active: Theme | null
  templates: ThemeTemplate[]
}> => {
  try {
    const result = await getPool().query(
      `SELECT id, name, theme FROM themes ORDER BY id`,
    )
    const active: Theme | null = result.rows
      .filter((row: ThemeRow) => row.id === "active")
      .map((row: ThemeRow) => rowToTheme(row))
      .find((t: Theme | null) => t !== null) ?? null

    const templates: ThemeTemplate[] = result.rows
      .filter((row: ThemeRow) => row.id !== "active")
      .map((row: ThemeRow) => rowToThemeTemplate(row))
      .filter((t: ThemeTemplate | null): t is ThemeTemplate => t !== null)

    return { active, templates }
  } catch (error) {
    console.error("theme-pg.listAllThemesPg failed", error)
    return { active: null, templates: [] }
  }
}

/** Upsert (create-or-update) the active theme (id='active'). version += 1 on update, updated_at = NOW(). */
export const updateThemePg = async (theme: Theme): Promise<{ id: string }> => {
  try {
    await getPool().query(
      `INSERT INTO themes (id, name, theme)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         theme = EXCLUDED.theme,
         version = themes.version + 1,
         updated_at = NOW()`,
      ["active", null, JSON.stringify(theme)],
    )
    return { id: "active" }
  } catch (error) {
    console.error("theme-pg.updateThemePg failed", error)
    throw error
  }
}

/** Upsert (create-or-update) a theme template by id. version += 1 on update, updated_at = NOW(). */
export const upsertThemeTemplatePg = async (
  id: string,
  name: string,
  theme: Theme,
): Promise<{ id: string }> => {
  try {
    await getPool().query(
      `INSERT INTO themes (id, name, theme)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         theme = EXCLUDED.theme,
         version = themes.version + 1,
         updated_at = NOW()`,
      [id, name, JSON.stringify(theme)],
    )
    return { id }
  } catch (error) {
    console.error("theme-pg.upsertThemeTemplatePg failed", error)
    throw error
  }
}

/** Delete a theme template by id (does not delete the active theme). */
export const deleteThemeTemplatePg = async (id: string): Promise<void> => {
  try {
    const result = await getPool().query(
      `DELETE FROM themes WHERE id = $1 AND id != $2`,
      [id, "active"],
    )
    if (result.rowCount === 0) {
      throw new Error(`Theme template "${id}" not found or is the active theme`)
    }
  } catch (error) {
    console.error("theme-pg.deleteThemeTemplatePg failed", error)
    throw error
  }
}
