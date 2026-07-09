// Plugin system: storage + ZIP pipeline (WP2). Extracted verbatim from
// services/config.ts (SRP split) — `export` was added to pluginDir (now also
// consumed by ./init's seedExamplePlugin).
import {
  pluginManifestValidator,
  type InstalledPlugin,
  type PluginManifest,
} from "@razzoozle/common/validators/plugin"
import { upsertInstalledPluginPg, deleteInstalledPluginPg } from "@razzoozle/socket/services/storage/plugins-pg"
import { THEME_REVISIONS_MAX } from "@razzoozle/common/constants"
import { z } from "zod"
import JSZip from "jszip"
import fs from "fs"
import { extname, relative, resolve } from "path"
import { assertSafeId, ensureDir, getPath } from "@razzoozle/socket/services/config/shared"
import {
  SKELETON_ASSET_EXT,
  SKELETON_ASSET_MAX_BYTES,
  SKELETON_ENTRY_MAX,
  SKELETON_TOTAL_MAX_BYTES,
} from "@razzoozle/socket/services/config/theme-skeleton"

// Helper: build a base64 map of all files in a plugin directory.
// Used to store plugin files in Postgres for backup/restore.
// Mirrors the buildPluginZip pattern: recursively walks the dir,
// skips symlinks + non-regular files, and encodes each file to base64.
const buildFilesMap = (dir: string): Record<string, string> => {
  const filesMap: Record<string, string> = {}

  const walk = (abs: string): void => {
    for (const name of fs.readdirSync(abs)) {
      const child = resolve(abs, name)
      const stat = fs.lstatSync(child)

      if (stat.isDirectory()) {
        walk(child)
        continue
      }

      if (!stat.isFile()) continue

      const rel = relative(dir, child).split("\\").join("/")
      filesMap[rel] = fs.readFileSync(child).toString("base64")
    }
  }
  walk(dir)
  return filesMap
}

// ---- Plugin system: storage + ZIP pipeline (WP2) --------------------------
// Mirrors the skeleton ZIP+storage pipeline (buildSkeletonZip / importSkeletonZip
// + the theme-revisions ring), scoped to INSTALL/REMOVE/LIST/extract only. WP2
// NEVER executes plugin code (no require of server.js, no handler/route binding)
// — that is WP3. Install just stores+extracts+tracks.
//
// On-disk layout:
//   config/plugins/index.json          InstalledPlugin[] registry (single file)
//   config/plugins/plugin-revisions.json   index.json snapshot ring (newest-first)
//   config/plugins/<id>/plugin.json     the validated manifest
//   config/plugins/<id>/ui.js           client UI bundle (manifest.hooks.client)
//   config/plugins/<id>/server.js       optional server hook (stored, NOT run)
//   config/plugins/<id>/assets/**       arbitrary plugin assets (ext-allowlisted)

const PLUGIN_REVISIONS_MAX = THEME_REVISIONS_MAX
// Plugin ZIPs additionally carry code (js) + the manifest (json) on top of the
// skeleton media exts; reuse the skeleton allowlist and extend it.
const PLUGIN_ASSET_EXT = new Set([
  ...SKELETON_ASSET_EXT,
  "js",
  "mjs",
  "cjs",
  "json",
  "css",
  "ttf",
  "woff",
  "gif",
])
// SECURITY: the PUBLIC /plugins/:id/:path route must never serve
// browser-renderable markup (same-origin XSS). "svg" is inherited from
// SKELETON_ASSET_EXT (which gates the separate skeleton-upload surface and is
// left untouched); delete it here so only this public allowlist drops it.
PLUGIN_ASSET_EXT.delete("svg")

const pluginsRoot = (): string => getPath("plugins")
export const pluginDir = (id: string): string => getPath(`plugins/${id}`)
const pluginIndexFile = (): string => getPath("plugins/index.json")
const pluginRevisionsFile = (): string => getPath("plugins/plugin-revisions.json")

const installedPluginValidator = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  capabilities: z.array(z.string()).default([]),
  config: z.record(z.string(), z.unknown()).optional(),
})

// Read config/plugins/index.json → InstalledPlugin[]. safeParse-with-fallback []
// (mirrors getGameConfig / getThemeRevisions): a missing or malformed file yields
// an empty list so the server never crashes on a corrupt registry.
export const readPlugins = (): InstalledPlugin[] => {
  const file = pluginIndexFile()

  if (!fs.existsSync(file)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown
    const arr = Array.isArray(parsed) ? parsed : []

    return arr.flatMap((entry) => {
      const result = installedPluginValidator.safeParse(entry)

      if (!result.success) {
        console.warn("Invalid installed-plugin entry:", result.error.issues)

        return []
      }

      return [result.data as InstalledPlugin]
    })
  } catch (error) {
    console.error("Failed to read plugins index:", error)

    return []
  }
}

export const writePlugins = (plugins: InstalledPlugin[]): void => {
  ensureDir(pluginsRoot())
  fs.writeFileSync(pluginIndexFile(), JSON.stringify(plugins, null, 2))
}

// Snapshot the current index.json into a rolling ring (newest-first, capped),
// before any mutation — cloned from saveThemeRevision / the theme-revisions ring.
const savePluginRevision = (): void => {
  const record = {
    id: `rev-${Date.now()}`,
    createdAt: new Date().toISOString(),
    plugins: readPlugins(),
  }

  let prior: unknown[] = []
  const file = pluginRevisionsFile()

  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown
      prior = Array.isArray(parsed) ? parsed : []
    } catch {
      prior = []
    }
  }

  const next = [record, ...prior].slice(0, PLUGIN_REVISIONS_MAX)
  ensureDir(pluginsRoot())
  fs.writeFileSync(file, JSON.stringify(next, null, 2))
}

// Pack config/plugins/<id>/ into a ZIP: plugin.json + ui.js + optional server.js
// + assets/**. Clone of buildSkeletonZip's addAsset/walk pattern.
export const buildPluginZip = async (id: string): Promise<Buffer> => {
  assertSafeId(id)

  const dir = pluginDir(id)

  if (!fs.existsSync(dir)) {
    throw new Error("errors:plugin.notFound")
  }

  const zip = new JSZip()

  // Recursively add every file under <dir>, keyed by its path relative to <dir>
  // (so plugin.json / ui.js / server.js / assets/** keep their layout). Entry +
  // size caps mirror the skeleton import side.
  const addDir = (abs: string): void => {
    for (const name of fs.readdirSync(abs)) {
      const child = resolve(abs, name)
      const stat = fs.lstatSync(child)

      if (stat.isDirectory()) {
        addDir(child)

        continue
      }

      // lstatSync + isFile() skips symlinks (and any non-regular file) so a
      // symlink under config/plugins/<id>/ can never be packed out of dir.
      if (!stat.isFile()) {
        continue
      }

      const rel = relative(dir, child).split("\\").join("/")
      zip.file(rel, fs.readFileSync(child))
    }
  }

  addDir(dir)

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer
}

// Parse + validate a plugin ZIP, then extract it to config/plugins/<id>/ and
// upsert the index. Clone of importSkeletonZip (same JSZip load, entry/size caps,
// per-entry ext + path-traversal guards). Rejects id collisions and unsafe ids.
export const importPluginZip = async (
  buf: Buffer,
): Promise<InstalledPlugin> => {
  const zip = await JSZip.loadAsync(buf)
  const entries = Object.values(zip.files)

  if (entries.length > SKELETON_ENTRY_MAX) {
    throw new Error("errors:plugin.tooManyEntries")
  }

  const buffers = new Map<string, Buffer>()
  let totalBytes = 0

  for (const entry of entries) {
    if (entry.dir) {
      continue
    }

    const entryBuffer = await entry.async("nodebuffer")
    totalBytes += entryBuffer.byteLength

    if (totalBytes > SKELETON_TOTAL_MAX_BYTES) {
      throw new Error("errors:plugin.tooLarge")
    }

    if (entryBuffer.byteLength > SKELETON_ASSET_MAX_BYTES) {
      throw new Error("errors:plugin.assetTooLarge")
    }

    buffers.set(entry.name, entryBuffer)
  }

  const manifestRaw = buffers.get("plugin.json")

  if (!manifestRaw) {
    throw new Error("errors:plugin.missingManifest")
  }

  const parsedJson = JSON.parse(manifestRaw.toString("utf-8")) as unknown
  const manifest: PluginManifest = pluginManifestValidator.parse(parsedJson)

  // Filesystem guard on the id BEFORE any path use (the wire validator already
  // shape-checked it, this is the on-disk re-assertion).
  assertSafeId(manifest.id)

  if (readPlugins().some((p) => p.id === manifest.id)) {
    throw new Error("errors:plugin.idCollision")
  }

  const dir = pluginDir(manifest.id)
  ensureDir(dir)

  for (const entry of entries) {
    if (entry.dir) {
      continue
    }

    const content = buffers.get(entry.name)

    if (!content) {
      continue
    }

    // Reject any traversal/absolute/odd path before joining it under <dir>.
    const rel = entry.name
    if (
      rel.startsWith("/") ||
      rel.startsWith("\\") ||
      rel.includes("..") ||
      rel.includes("\0")
    ) {
      continue
    }

    const ext = extname(rel).slice(1).toLowerCase()

    if (!PLUGIN_ASSET_EXT.has(ext)) {
      continue
    }

    const dest = resolve(dir, rel)

    // Defence-in-depth: the resolved path must stay inside <dir>.
    if (dest !== dir && !dest.startsWith(dir + "/")) {
      continue
    }

    ensureDir(resolve(dest, ".."))
    fs.writeFileSync(dest, content)
  }

  savePluginRevision()

  const record: InstalledPlugin = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: true,
    capabilities: manifest.capabilities,
    config: manifest.config,
  }

  writePlugins([...readPlugins(), record])

  // Mirror to Postgres after disk write (additive: keep disk/index.json/broadcast behavior)
  const filesMap = buildFilesMap(dir)
  void upsertInstalledPluginPg(record, filesMap).catch((error: unknown) => {
    console.error("importPluginZip: upsertInstalledPluginPg failed (non-blocking):", error)
  })

  return record
}

// Remove config/plugins/<id>/ and its index entry. Snapshots first.
export const removePlugin = (id: string): void => {
  assertSafeId(id)
  savePluginRevision()

  const dir = pluginDir(id)

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }

  writePlugins(readPlugins().filter((p) => p.id !== id))

  // Remove from Postgres after disk delete (additive, non-blocking)
  void deleteInstalledPluginPg(id).catch((error: unknown) => {
    console.error("removePlugin: deleteInstalledPluginPg failed (non-blocking):", error)
  })
}

// Merge a config bag into the index entry for <id>. Snapshots first.
export const setPluginConfig = (
  id: string,
  config: Record<string, unknown>,
): void => {
  assertSafeId(id)
  savePluginRevision()

  const updated = readPlugins().map((p) =>
    p.id === id
      ? { ...p, config: { ...(p.config ?? {}), ...config } }
      : p,
  )

  writePlugins(updated)

  // Mirror to Postgres after config update (build fresh filesMap from disk)
  const dir = pluginDir(id)
  if (fs.existsSync(dir)) {
    const filesMap = buildFilesMap(dir)
    const updatedPlugin = updated.find((p) => p.id === id)
    if (updatedPlugin) {
      void upsertInstalledPluginPg(updatedPlugin, filesMap).catch((error: unknown) => {
        console.error("setPluginConfig: upsertInstalledPluginPg failed (non-blocking):", error)
      })
    }
  }
}

// Resolve a public "/plugins/<id>/<rest>" request to an on-disk file + its
// content-type. Returns null on any unsafe path / missing file / disallowed ext,
// so the HTTP layer can 404 uniformly. The node server serves these directly
// (unlike /theme/ + /media/, which nginx serves from the config volume).
const PLUGIN_MIME: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  css: "text/css; charset=utf-8",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
}

export const resolvePluginAsset = (
  id: string,
  rest: string,
): { buffer: Buffer; contentType: string } | null => {
  try {
    assertSafeId(id)
  } catch {
    return null
  }

  if (
    !rest ||
    rest.startsWith("/") ||
    rest.includes("..") ||
    rest.includes("\0")
  ) {
    return null
  }

  const ext = extname(rest).slice(1).toLowerCase()

  if (!PLUGIN_ASSET_EXT.has(ext)) {
    return null
  }

  const dir = pluginDir(id)
  const dest = resolve(dir, rest)

  if (dest !== dir && !dest.startsWith(dir + "/")) {
    return null
  }

  // PUBLIC surface restriction: this route is unauthenticated, so only ever
  // serve client-facing files. The allowed client entry is HARD-CODED to
  // "ui.js" (the manifest default + what the client injector loads) — never
  // read from the plugin's own attacker-controlled manifest. Everything else at
  // the plugin root (server.js, plugin.json, plugin-revisions.json, ...) is
  // denied (404); only ui.js or anything under assets/ is served.
  if (rest !== "ui.js" && !rest.startsWith("assets/")) {
    return null
  }

  // lstatSync (not statSync) so a symlink is never a regular file -> 404. A
  // symlink under config/plugins/<id>/ can therefore never be served out of dir.
  if (!fs.existsSync(dest) || !fs.lstatSync(dest).isFile()) {
    return null
  }

  return {
    buffer: fs.readFileSync(dest),
    contentType: PLUGIN_MIME[ext] ?? "application/octet-stream",
  }
}

// Read + validate an installed plugin's on-disk plugin.json manifest. Returns
// null on a missing/corrupt/invalid manifest (never throws) so the plugin
// runtime can skip a broken plugin instead of crashing the server. assertSafeId
// guards the path before any interpolation.
export const readPluginManifest = (id: string): PluginManifest | null => {
  try {
    assertSafeId(id)
  } catch {
    return null
  }

  const file = resolve(pluginDir(id), "plugin.json")

  if (!fs.existsSync(file)) {
    return null
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown
    const result = pluginManifestValidator.safeParse(parsed)

    return result.success ? result.data : null
  } catch {
    return null
  }
}

// Resolve the ABSOLUTE on-disk path of a plugin's server hook (manifest
// hooks.server, e.g. "server.js"). Returns null if no server hook is declared,
// the resolved path escapes config/plugins/<id>/, the file is missing, or it is
// not a regular file (symlink-safe via lstatSync). The plugin runtime loads it
// with a bundle-safe dynamic import of pathToFileURL(thisPath). The server hook
// is NEVER served on the public asset route (resolvePluginAsset denies it).
export const pluginServerPath = (id: string): string | null => {
  const manifest = readPluginManifest(id)
  const serverFile = manifest?.hooks.server

  if (!serverFile) {
    return null
  }

  // Guard the manifest-supplied filename like an asset path (no traversal /
  // absolute / nul) before joining it under the plugin dir.
  if (
    serverFile.startsWith("/") ||
    serverFile.startsWith("\\") ||
    serverFile.includes("..") ||
    serverFile.includes("\0")
  ) {
    return null
  }

  const dir = pluginDir(id)
  const dest = resolve(dir, serverFile)

  if (dest !== dir && !dest.startsWith(dir + "/")) {
    return null
  }

  if (!fs.existsSync(dest) || !fs.lstatSync(dest).isFile()) {
    return null
  }

  return dest
}
