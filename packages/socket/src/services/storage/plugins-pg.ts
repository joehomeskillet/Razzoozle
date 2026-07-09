import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"
import fs from "fs"
import { getPath, ensureDir } from "@razzoozle/socket/services/config/shared"

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
// Plugins are a distinct table/concern, so a dedicated pool keeps migrations decoupled.
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

interface InstalledPluginRow {
  id: string
  name: string
  version: string
  enabled: boolean
  capabilities: string[]
  config: Record<string, unknown> | null
  files: Record<string, string> | null
}

const rowToInstalledPlugin = (row: InstalledPluginRow): InstalledPlugin => ({
  id: row.id,
  name: row.name,
  version: row.version,
  enabled: row.enabled,
  capabilities: row.capabilities || [],
  config: row.config || undefined,
})

/**
 * List all installed plugins from Postgres.
 * Returns an empty array if the query fails.
 */
export const listInstalledPluginsPg = async (): Promise<InstalledPlugin[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, name, version, enabled, capabilities, config, files
       FROM installed_plugins
       ORDER BY id ASC`,
    )

    return result.rows.map((row: InstalledPluginRow) =>
      rowToInstalledPlugin(row),
    )
  } catch (error) {
    console.error("plugins-pg.listInstalledPluginsPg failed", error)
    return []
  }
}

/**
 * Read all installed plugins from Postgres INCLUDING the files jsonb.
 * Used by hydrate to get both metadata and file contents.
 */
const listInstalledPluginsWithFilesPg = async (): Promise<
  Array<InstalledPluginRow>
> => {
  try {
    const result = await getPool().query(
      `SELECT id, name, version, enabled, capabilities, config, files
       FROM installed_plugins
       ORDER BY id ASC`,
    )

    return result.rows as InstalledPluginRow[]
  } catch (error) {
    console.error("plugins-pg.listInstalledPluginsWithFilesPg failed", error)
    return []
  }
}

/**
 * Upsert an installed plugin row: INSERT ... ON CONFLICT (id) DO UPDATE.
 * Stores metadata (id, name, version, enabled, capabilities, config) + files jsonb.
 *
 * @param meta - InstalledPlugin metadata
 * @param filesMap - { "<relpath>": "<base64>" } map of plugin files
 */
export const upsertInstalledPluginPg = async (
  meta: InstalledPlugin,
  filesMap: Record<string, string>,
): Promise<void> => {
  try {
    const pool = getPool()

    await pool.query(
      `INSERT INTO installed_plugins (id, name, version, enabled, capabilities, config, files)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
       SET name = $2,
           version = $3,
           enabled = $4,
           capabilities = $5,
           config = $6,
           files = $7,
           updated_at = CURRENT_TIMESTAMP`,
      [
        meta.id,
        meta.name,
        meta.version,
        meta.enabled,
        JSON.stringify(meta.capabilities || []),
        JSON.stringify(meta.config || {}),
        JSON.stringify(filesMap),
      ],
    )
  } catch (error) {
    console.error("plugins-pg.upsertInstalledPluginPg failed", error)
    throw error
  }
}

/**
 * Delete an installed plugin row from Postgres.
 */
export const deleteInstalledPluginPg = async (id: string): Promise<void> => {
  try {
    await getPool().query(`DELETE FROM installed_plugins WHERE id = $1`, [id])
  } catch (error) {
    console.error("plugins-pg.deleteInstalledPluginPg failed", error)
    throw error
  }
}

/**
 * Boot-hydrate plugins from Postgres to disk.
 *
 * Reads installed_plugins from PG (metadata + files jsonb) and reconstructs:
 * - config/plugins/index.json (metadata array)
 * - config/plugins/<id>/<relpath> for each file (base64-decoded)
 *
 * CRITICAL EMPTY-GUARD: if installed_plugins has 0 rows, do ABSOLUTELY NOTHING.
 * This prevents nuking an existing on-disk plugin dir if the PG seed is empty.
 *
 * Idempotent: only writes missing files (create dirs as needed).
 * Non-blocking: errors are logged, hydration continues.
 */
export const hydratePluginsFromPg = async (): Promise<void> => {
  try {
    // Read all plugins (with files) from Postgres
    const allRows = await listInstalledPluginsWithFilesPg()

    // CRITICAL: Empty-guard — if PG has 0 rows, do ABSOLUTELY NOTHING
    if (allRows.length === 0) {
      return
    }

    // Ensure plugins root dir exists
    const pluginsRoot = getPath("plugins")
    ensureDir(pluginsRoot)

    // Write index.json with metadata only (mirrors readPlugins schema)
    const indexArray = allRows.map((row) => rowToInstalledPlugin(row))
    fs.writeFileSync(
      `${pluginsRoot}/index.json`,
      JSON.stringify(indexArray, null, 2),
    )

    // For each plugin, restore files to disk (only if missing, idempotent)
    for (const row of allRows) {
      const pluginId = row.id
      const filesMap = row.files || {}
      const pluginDir = getPath(`plugins/${pluginId}`)

      // Ensure plugin dir exists
      ensureDir(pluginDir)

      // Restore each file from base64
      for (const [relpath, base64] of Object.entries(filesMap)) {
        // Guard against traversal attacks (should never happen, but be paranoid)
        if (
          relpath.startsWith("/") ||
          relpath.startsWith("\\") ||
          relpath.includes("..") ||
          relpath.includes("\0")
        ) {
          console.warn(
            `plugins-pg: skipping unsafe relpath in plugin ${pluginId}: ${relpath}`,
          )
          continue
        }

        const filePath = `${pluginDir}/${relpath}`

        // Only write if missing (idempotent, preserves any on-disk changes)
        if (!fs.existsSync(filePath)) {
          // Ensure parent dir exists
          const parentDir = filePath.split("/").slice(0, -1).join("/")
          ensureDir(parentDir)

          // Decode base64 and write
          try {
            const buffer = Buffer.from(base64, "base64")
            fs.writeFileSync(filePath, buffer)
          } catch (error) {
            console.error(
              `plugins-pg: failed to restore file ${relpath} in plugin ${pluginId}:`,
              error,
            )
          }
        }
      }
    }
  } catch (error) {
    console.error("plugins-pg.hydratePluginsFromPg failed", error)
    // Non-blocking: errors are logged but don't crash boot
  }
}
