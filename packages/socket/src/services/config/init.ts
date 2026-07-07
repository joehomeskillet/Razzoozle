// Bootstrap: idempotent seeding of branding assets + the example plugin, the
// fresh-config-volume dir/file scaffold (initConfig), and the storage
// repository re-export (PHASE 1). Extracted verbatim from services/config.ts
// (SRP split).
import { DEFAULT_MANAGER_PASSWORD, EXAMPLE_QUIZZ } from "@razzoozle/common/constants"
import { themeTemplateValidator } from "@razzoozle/common/validators/theme"
import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"
import fs from "fs"
import { resolve } from "path"
import { assertSafeId, ensureDir, getBrandingPath, getPath } from "@razzoozle/socket/services/config/shared"
import { MEDIA_MANIFEST, MEDIA_ROOT, ensureMediaDirs } from "@razzoozle/socket/services/config/media"
import { pluginDir, readPlugins, writePlugins } from "@razzoozle/socket/services/config/plugins"

// Copy a single file into place only when the destination is missing — never
// overwrites existing user data. Returns true if a copy happened.
const copyIfMissing = (src: string, dest: string): boolean => {
  if (!fs.existsSync(src) || fs.existsSync(dest)) {
    return false
  }

  ensureDir(resolve(dest, ".."))
  fs.copyFileSync(src, dest)

  return true
}

// One-time, idempotent seeding of the Razzoozle brand assets baked into the
// image (source/branding → /app/branding via BRANDING_PATH). Every copy is
// guarded by copyIfMissing, so re-running on an existing config volume is a
// no-op and a manager's edits to a template/background/og/logo are never
// clobbered. Does NOT touch the ACTIVE theme (config/theme/theme.json): presets
// are merely offered in the picker; the live theme stays whatever exists
// (Südhang default).
const seedBrandingAssets = (): void => {
  const brandingDir = getBrandingPath()

  if (!fs.existsSync(brandingDir)) {
    return
  }

  // 1. Theme presets → config/theme-templates/<id>.json (the picker reads these).
  //    The id used for the on-disk filename is the preset's own `id` field, so a
  //    manager who later edits/saves the same template overwrites the seed copy
  //    instead of producing a duplicate.
  const presetsDir = getBrandingPath("presets")

  if (fs.existsSync(presetsDir)) {
    for (const file of fs.readdirSync(presetsDir)) {
      if (!file.endsWith(".json")) {
        continue
      }

      try {
        const raw = fs.readFileSync(resolve(presetsDir, file), "utf-8")
        const parsed = themeTemplateValidator.safeParse(JSON.parse(raw))

        if (!parsed.success) {
          console.warn(
            `Skipping invalid brand preset "${file}":`,
            parsed.error.issues,
          )

          continue
        }

        const id = parsed.data.id

        if (!id) {
          continue
        }

        assertSafeId(id)
        copyIfMissing(
          resolve(presetsDir, file),
          getPath(`theme-templates/${id}.json`),
        )
      } catch (error) {
        console.warn(`Failed to seed brand preset "${file}":`, error)
      }
    }
  }

  // 2. Background images → config/media/backgrounds/<name> (referenced by the
  //    preset `backgrounds` asset paths). WebP-only, matching the project policy.
  const backgroundsSrcDir = getBrandingPath("backgrounds")

  if (fs.existsSync(backgroundsSrcDir)) {
    ensureDir(getPath(`${MEDIA_ROOT}/backgrounds`))

    for (const file of fs.readdirSync(backgroundsSrcDir)) {
      if (!file.endsWith(".webp")) {
        continue
      }

      copyIfMissing(
        resolve(backgroundsSrcDir, file),
        getPath(`${MEDIA_ROOT}/backgrounds/${file}`),
      )
    }
  }

  // 3. Brand chrome served from /theme/: the OG share image + the wordmark SVG.
  //    Seed BOTH brand sets idempotently (each copyIfMissing only writes a
  //    missing target). The Razzoozle preset's `logo` points at
  //    /theme/razzoozle-logo.svg; the rahoot preset's at /theme/rahoot-logo.svg.
  ensureDir(getPath("theme"))
  copyIfMissing(
    getBrandingPath("razzoozle-og.webp"),
    getPath("theme/razzoozle-og.webp"),
  )
  copyIfMissing(
    getBrandingPath("razzoozle-logo.svg"),
    getPath("theme/razzoozle-logo.svg"),
  )
  copyIfMissing(
    getBrandingPath("rahoot-og.webp"),
    getPath("theme/rahoot-og.webp"),
  )
  copyIfMissing(
    getBrandingPath("rahoot-logo.svg"),
    getPath("theme/rahoot-logo.svg"),
  )
}

// Recursively copy <src> into <dest> (files only; symlinks/non-regular files are
// skipped via lstat, mirroring buildPluginZip's addDir guard). Reuses ensureDir +
// copyFileSync — no per-file overwrite guard because the only caller already
// checks the destination plugin dir is absent (idempotent at the dir level).
const copyDirRecursive = (src: string, dest: string): void => {
  ensureDir(dest)

  for (const name of fs.readdirSync(src)) {
    const from = resolve(src, name)
    const to = resolve(dest, name)
    const stat = fs.lstatSync(from)

    if (stat.isDirectory()) {
      copyDirRecursive(from, to)

      continue
    }

    if (stat.isFile()) {
      fs.copyFileSync(from, to)
    }
  }
}

// Resolve the baked-in config-editor example bundle ROBUSTLY across dev + Docker
// prod. Mirrors the getPath/getBrandingPath fallback style: try candidate roots
// in order and return the first that contains a plugin.json. An optional
// PLUGIN_EXAMPLES_PATH env override wins (same opt-in pattern as CONFIG_PATH /
// BRANDING_PATH), so an operator — or the focused test — can point it at an
// explicit bundle. Returns null when none exists (seeding is then skipped).
const resolveExamplePluginDir = (): string | null => {
  const override = process.env.PLUGIN_EXAMPLES_PATH

  const candidates: (string | null)[] = [
    // 1. Explicit env override (test fixture / operator-supplied).
    override ? resolve(override) : null,
    // 2. Dev: the socket process runs from packages/socket, so ../../examples
    //    === source/examples (exactly like CONFIG_PATH's ../../config fallback).
    resolve(process.cwd(), "../../examples/plugins/config-editor"),
    // 3. Docker prod paths (baked example bundle).
    "/app/src/examples/plugins/config-editor",
    "/app/examples/plugins/config-editor",
    // 4. cwd-rooted (vitest / repo-root invocations).
    resolve(process.cwd(), "examples/plugins/config-editor"),
  ]

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(resolve(candidate, "plugin.json"))) {
      return candidate
    }
  }

  return null
}

// One-time, idempotent seeding of the first-party config-editor example plugin so
// it appears PRE-INSTALLED in the manager Plugins tab on a fresh config volume.
// Fully guarded: skips when the baked bundle is absent (silent, no crash) and
// never clobbers an existing install (config/plugins/config-editor/ present =>
// no-op), so a manager's edits survive a re-run. Mirrors importPluginZip's record
// shape without running the ZIP pipeline (the files are copied straight in).
const seedExamplePlugin = (): void => {
  const id = "config-editor"
  assertSafeId(id)

  const dest = pluginDir(id)

  // Idempotent at the dir level: an existing install (or user edits) is never
  // touched, and the registry is left exactly as-is.
  if (fs.existsSync(dest)) {
    return
  }

  const src = resolveExamplePluginDir()

  if (!src) {
    return
  }

  copyDirRecursive(src, dest)

  // Defence-in-depth on top of the dir check: skip if already registered.
  if (readPlugins().some((p) => p.id === id)) {
    return
  }

  const entry: InstalledPlugin = {
    id,
    name: "Config Editor",
    version: "1.0.0",
    enabled: true,
    capabilities: ["MANAGER_TAB", "CONFIG"],
    config: {},
  }

  writePlugins([...readPlugins(), entry])
}

export const initConfig = () => {
  const isConfigFolderExists = fs.existsSync(getPath())

  if (!isConfigFolderExists) {
    fs.mkdirSync(getPath())
  }

  const isGameConfigExists = fs.existsSync(getPath("game.json"))

  if (!isGameConfigExists) {
    // Seed includes the lowLatencyMode block (enabled: false) for discoverability
    // so an operator sees the opt-in switches. It is purely documentary: an
    // existing bare `{ managerPassword }` config still validates because every
    // field is zod-defaulted, and enabled=false keeps normal-mode behaviour.
    fs.writeFileSync(
      getPath("game.json"),
      JSON.stringify(
        {
          managerPassword: DEFAULT_MANAGER_PASSWORD,
          lowLatencyMode: {
            enabled: false,
            clockSync: true,
            preloadNextQuestion: true,
            answerAck: true,
            scoreboardBroadcastThrottleMs: 100,
            maxLatencyCompensationMs: 150,
          },
        },
        null,
        2,
      ),
    )
  }

  const isQuizzExists = fs.existsSync(getPath("quizz"))

  if (!isQuizzExists) {
    fs.mkdirSync(getPath("quizz"))

    fs.writeFileSync(
      getPath("quizz/example.json"),
      JSON.stringify(EXAMPLE_QUIZZ, null, 2),
    )
  }

  // Submission moderation queue + AI-generated media store + catalog (question
  // bank). Mirror the quizz dir bootstrap so every folder exists on a fresh
  // config volume.
  const submissionsDir = getPath("submissions")

  if (!fs.existsSync(submissionsDir)) {
    fs.mkdirSync(submissionsDir, { recursive: true })
  }

  ensureMediaDirs()

  if (!fs.existsSync(getPath(MEDIA_MANIFEST))) {
    fs.writeFileSync(getPath(MEDIA_MANIFEST), "[]")
  }

  const catalogDir = getPath("catalog")

  if (!fs.existsSync(catalogDir)) {
    fs.mkdirSync(catalogDir, { recursive: true })
  }

  const themeTemplatesDir = getPath("theme-templates")

  if (!fs.existsSync(themeTemplatesDir)) {
    fs.mkdirSync(themeTemplatesDir, { recursive: true })
  }

  const soloResultsDir = getPath("solo-results")

  if (!fs.existsSync(soloResultsDir)) {
    fs.mkdirSync(soloResultsDir, { recursive: true })
  }

  const assignmentsDir = getPath("assignments")

  if (!fs.existsSync(assignmentsDir)) {
    fs.mkdirSync(assignmentsDir, { recursive: true })
  }

  // Manager-editable achievements config. Seed an empty record so a fresh config
  // volume has the file (and getAchievementsConfig reads {} → registry defaults).
  // An empty {} keeps the SHIPPED hardcoded behaviour: every badge enabled with
  // its default threshold (see mergeAchievementsConfig).
  if (!fs.existsSync(getPath("achievements.json"))) {
    fs.writeFileSync(getPath("achievements.json"), JSON.stringify({}, null, 2))
  }

  // Installed-plugins store. config/plugins/index.json is the InstalledPlugin[]
  // registry; each plugin's extracted files live under config/plugins/<id>/.
  // Mirrors the quizz/theme-templates dir bootstrap.
  const pluginsDir = getPath("plugins")

  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
  }

  if (!fs.existsSync(getPath("plugins/index.json"))) {
    fs.writeFileSync(getPath("plugins/index.json"), JSON.stringify([], null, 2))
  }

  // Pre-install the first-party config-editor example plugin so it shows up in
  // the manager Plugins tab out of the box. Idempotent + crash-safe: skips when
  // the baked bundle is absent and never clobbers an existing install (see
  // seedExamplePlugin). Runs after the plugins dir + index.json exist above.
  seedExamplePlugin()

  // Seed the baked-in Razzoozle brand presets + assets last (the dirs above —
  // theme-templates, media/backgrounds, theme — now exist). Fully idempotent:
  // only writes targets that are missing, so it never overwrites user data and
  // never changes the ACTIVE theme.
  seedBrandingAssets()
}

// ──────────────────────────────────────────────────────────────────────────
// Storage Repository Integration (PHASE 1)
// ──────────────────────────────────────────────────────────────────────────
// Export the storage repository factory for use throughout the application.
// This enables the storage abstraction layer to be used for reading/writing
// game configuration and credentials.

export { storageRepository, resetStorageRepository } from "@razzoozle/socket/services/storage"
export type { StorageRepository } from "@razzoozle/socket/services/storage/storage-repository"

/**
 * Get the manager password using the storage repository.
 * This is the primary consumer of the storage abstraction layer.
 *
 * When DATABASE_MODE is unset (default), this delegates to FileSystemRepository
 * which reads from game.json (preserving existing behavior).
 * When DATABASE_MODE='pg', this reads from Postgres.
 */
export const getManagerPasswordFromStorage = async (): Promise<string> => {
  const repo = require("@razzoozle/socket/services/storage").storageRepository()
  return repo.getManagerPassword()
}
