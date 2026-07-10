import type { MediaMeta } from "@razzoozle/common/types/media"
import { logger } from "@razzoozle/socket/services/logger"
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

// Own lazily-initialized pool, separate from other storage pools.
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

interface MediaAssetRow {
  id: string
  filename: string
  url: string
  size: number
  type: string
  category: string
  source: string
  width: number | null
  height: number | null
  uploaded_at: string
  data: Buffer | null
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

const rowToMediaMeta = (row: MediaAssetRow): MediaMeta => {
  const base: MediaMeta = {
    id: row.id,
    filename: row.filename,
    url: row.url,
    size: row.size,
    type: row.type as "image" | "audio" | "video",
    category: row.category as any,
    source: row.source as "upload" | "ai" | "theme",
    uploadedAt: toIsoString(row.uploaded_at),
  }

  // Include width/height only if both are present
  if (row.width !== null && row.height !== null) {
    return { ...base, width: row.width, height: row.height }
  }

  return base
}

/** List all media assets from Postgres (metadata only, no bytea). */
export const listMediaAssetsPg = async (): Promise<MediaMeta[]> => {
  try {
    const result = await getPool().query(
      `SELECT id, filename, url, size, type, category, source, width, height, uploaded_at
       FROM media_assets
       ORDER BY uploaded_at DESC`,
    )

    return result.rows.map((row: MediaAssetRow) => rowToMediaMeta(row))
  } catch (error) {
    logger.error({ err: error }, "media-pg.listMediaAssetsPg failed")
    return []
  }
}

/** Fetch the bytea data for a media asset by id. Returns null if not found. */
const getMediaAssetDataPg = async (id: string): Promise<Buffer | null> => {
  try {
    const result = await getPool().query(
      `SELECT data FROM media_assets WHERE id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      return null
    }

    return result.rows[0].data as Buffer
  } catch (error) {
    logger.error({ err: error }, `media-pg.getMediaAssetDataPg(${id}) failed`)
    return null
  }
}

/** Insert a media asset with metadata and bytea data. Idempotent (ON CONFLICT DO UPDATE). */
export const insertMediaAssetPg = async (
  meta: MediaMeta,
  data: Buffer,
): Promise<void> => {
  try {
    const pool = getPool()

    // INSERT or UPDATE on conflict (idempotent for re-uploads)
    await pool.query(
      `INSERT INTO media_assets
       (id, filename, url, size, type, category, source, width, height, uploaded_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11)
       ON CONFLICT (id) DO UPDATE SET
         filename = $2,
         url = $3,
         size = $4,
         type = $5,
         category = $6,
         source = $7,
         width = $8,
         height = $9,
         uploaded_at = $10::timestamptz,
         data = $11`,
      [
        meta.id,
        meta.filename,
        meta.url,
        meta.size,
        meta.type,
        meta.category,
        meta.source,
        meta.width ?? null,
        meta.height ?? null,
        meta.uploadedAt,
        data,
      ],
    )
  } catch (error) {
    logger.error({ err: error }, `media-pg.insertMediaAssetPg(${meta.id}) failed`)
    throw error
  }
}

/** Delete a media asset by id from Postgres. */
export const deleteMediaAssetPg = async (id: string): Promise<void> => {
  try {
    await getPool().query(`DELETE FROM media_assets WHERE id = $1`, [id])
  } catch (error) {
    logger.error({ err: error }, `media-pg.deleteMediaAssetPg(${id}) failed`)
    throw error
  }
}

/** Delete media assets by slot and source (theme slot cleanup). */

interface HydrationStats {
  media?: number
  errors?: string[]
}

/** Boot-hydrate media assets from Postgres to disk. */
export const hydrateMediaFromPg = async (stats?: HydrationStats): Promise<void> => {
  const shouldHydrate = (): boolean => {
    const mode = process.env.DATABASE_MODE?.toLowerCase()
    const hasDb = !!process.env.DATABASE_URL
    return (mode === "pg" || mode === "pg-only") && hasDb
  }

  if (!shouldHydrate()) {
    return
  }

  try {
    const assets = await listMediaAssetsPg()

    // Guard: if PG has 0 media rows, do nothing (never nuke existing disk files)
    if (assets.length === 0) {
      if (stats) {
        stats.media = 0
      }
      return
    }

    // Ensure media directories exist
    ensureDir(getPath("media"))
    for (const category of [
      "questions",
      "backgrounds",
      "audio",
      "avatars",
      "generated",
    ]) {
      ensureDir(getPath(`media/${category}`))
    }

    // Write each media file to disk (only if missing or size mismatch)
    let written = 0
    for (const asset of assets) {
      // Path-traversal guard: validate category and filename
      const isSafeSeg = (s: string): boolean =>
        !!s && !s.includes("/") && !s.includes("\\") && s !== "." && s !== ".."
      if (!isSafeSeg(asset.category) || !isSafeSeg(asset.filename)) {
        logger.warn(
          { id: asset.id, category: asset.category, filename: asset.filename },
          "media-pg.hydrateMediaFromPg: rejecting unsafe path segment (traversal)",
        )
        continue
      }

      const filePath = getPath(`media/${asset.category}/${asset.filename}`)

      // Check if file exists and has matching size
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath)
        if (stat.size === asset.size) {
          // File exists and size matches — skip
          continue
        }
      }

      // Fetch the bytea data from PG
      const data = await getMediaAssetDataPg(asset.id)
      if (!data) {
        logger.warn(
          { id: asset.id },
          "media-pg.hydrateMediaFromPg: no data for asset, skipping write",
        )
        continue
      }

      // Write the file
      fs.writeFileSync(filePath, data)
      written++
    }

    // Rebuild media-manifest.json from the PG list
    const manifestPath = getPath("media-manifest.json")
    fs.writeFileSync(manifestPath, JSON.stringify(assets, null, 2))

    if (stats) {
      stats.media = assets.length
    }
    logger.info(
      { count: assets.length, written },
      `media-pg.hydrateMediaFromPg: hydrated ${assets.length} assets (${written} written)`,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error({ err: error }, "media-pg.hydrateMediaFromPg failed")
    if (stats && stats.errors) {
      stats.errors.push(`media: ${msg}`)
    }
    // Non-blocking: boot continues
  }
}
