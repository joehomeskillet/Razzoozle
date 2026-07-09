// backfill-e4e5-blobs.mjs — one-time backfill of the E4/E5 blob columns for rows
// created BEFORE migration 006. Reads the derived disk cache (host ./config volume)
// and writes it into the PG SSOT: media_assets.data (bytea) + installed_plugins.files
// (jsonb base64 map). After this, pg_dump is a COMPLETE source of truth and a fresh
// DB-restore can boot-hydrate the disk cache. Idempotent (only touches NULL rows).
//
// Residuals kept disk-only (NOT backfilled), per .claude/state/E4E5_contract.md:
//   - media_assets rows with source='ai' (AI-generated images, regenerable/ephemeral)
//
// Run from source/ so `pg` resolves from node_modules:
//   DATABASE_URL='postgres://razzoozle:...@127.0.0.1:5432/razzoozle' node scripts/backfill-e4e5-blobs.mjs
import pg from "pg"
import fs from "fs"
import path from "path"

const CONFIG = process.env.CONFIG_DIR || "/nvmetank1/projects/Razzoozle/config"
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const walk = (dir, base = "") => {
  const map = {}
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) Object.assign(map, walk(abs, rel))
    else if (e.isFile()) map[rel] = fs.readFileSync(abs).toString("base64")
  }
  return map
}

// --- media: backfill non-ai rows from the disk file named by their url ---
const media = await pool.query(
  "SELECT id, url, source FROM media_assets WHERE source <> 'ai' AND data IS NULL",
)
let mOk = 0,
  mMiss = 0
for (const r of media.rows) {
  const rel = String(r.url).replace(/^\/media\//, "")
  const fp = path.join(CONFIG, "media", rel)
  if (!fs.existsSync(fp)) {
    console.error(`media MISS: ${r.id} -> ${fp}`)
    mMiss++
    continue
  }
  const buf = fs.readFileSync(fp)
  await pool.query("UPDATE media_assets SET data = $1, updated_at = now() WHERE id = $2", [buf, r.id])
  mOk++
}

// --- plugins: backfill files jsonb from config/plugins/<id>/ ---
const plugins = await pool.query("SELECT id FROM installed_plugins WHERE files IS NULL")
let pOk = 0,
  pMiss = 0
for (const p of plugins.rows) {
  const pdir = path.join(CONFIG, "plugins", p.id)
  if (!fs.existsSync(pdir)) {
    console.error(`plugin dir MISS: ${pdir}`)
    pMiss++
    continue
  }
  const files = walk(pdir)
  await pool.query("UPDATE installed_plugins SET files = $1, updated_at = now() WHERE id = $2", [
    JSON.stringify(files),
    p.id,
  ])
  pOk++
}

console.log(
  `backfill done — media: ${mOk} filled, ${mMiss} missing (of ${media.rows.length}); plugins: ${pOk} filled, ${pMiss} missing (of ${plugins.rows.length})`,
)
await pool.end()
