import {
  AI_PROVIDER_OFF,
  AI_TEXT_PROVIDER_PRESETS,
  AVATAR_MAX_BYTES,
  DEFAULT_MANAGER_PASSWORD,
  EXAMPLE_QUIZZ,
  MEDIA_CATEGORIES,
  SOUND_SLOTS,
  THEME_REVISIONS_MAX,
  THEME_SLOTS,
  type MediaCategory,
  type SoundSlot,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import type {
  GameResult,
  GameResultMeta,
  QuizzMeta,
  QuizzWithId,
} from "@razzoozle/common/types/game"
import type {
  AIProviderPublic,
  AISettings,
  AISettingsPublic,
} from "@razzoozle/common/types/ai"
import type { CatalogEntry } from "@razzoozle/common/types/catalog"
import { quizzValidator } from "@razzoozle/common/validators/quizz"
import {
  catalogAddValidator,
  catalogEntryValidator,
} from "@razzoozle/common/validators/catalog"
import { aiSettingsValidator } from "@razzoozle/common/validators/ai"
import {
  achievementsConfigValidator,
  type AchievementsConfig,
} from "@razzoozle/common/validators/achievements"
import {
  mergeAchievementsConfig,
  type MergedAchievement,
} from "@razzoozle/common/achievements"
import {
  type GameConfig,
  gameConfigValidator,
} from "@razzoozle/common/validators/game-config"
import {
  DEFAULT_THEME,
  type Theme,
  type ThemeRevision,
  type ThemeTemplate,
  type ThemeTemplateMeta,
} from "@razzoozle/common/types/theme"
import {
  themeRevisionValidator,
  themeTemplateValidator,
  themeValidator,
} from "@razzoozle/common/validators/theme"
import {
  pluginManifestValidator,
  type InstalledPlugin,
  type PluginManifest,
} from "@razzoozle/common/validators/plugin"
import { hasKey } from "@razzoozle/socket/services/ai-secrets"
import { gameResultValidator } from "@razzoozle/socket/services/validators"
import { toWebp, webpDimensions } from "@razzoozle/socket/services/webp"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import { submissionRecordValidator } from "@razzoozle/common/validators/submission"
import {
  renderSkeletonCss,
  renderSkeletonDoc,
  renderSkeletonJs,
} from "@razzoozle/common/skeleton-doc"
import { renderSkeletonDemo } from "@razzoozle/common/skeleton-demo"
import { z } from "zod"
import type {
  Submission,
  SubmissionMeta,
} from "@razzoozle/common/types/submission"
import type { MediaMeta } from "@razzoozle/common/types/media"
import fs from "fs"
import { basename, extname, relative, resolve } from "path"
import { nanoid } from "nanoid"
import JSZip from "jszip"

export type { GameConfig } from "@razzoozle/common/validators/game-config"

const inContainerPath = process.env.CONFIG_PATH

const getPath = (path = "") =>
  inContainerPath
    ? resolve(inContainerPath, path)
    : resolve(process.cwd(), "../../config", path)

// RAZZOOLE_DEV — fail-closed dev/observability gate. Mirrors the
// `RAHOOT_SIM_MODE !== "1"` pattern (services/game/index.ts): the ABILITY is in
// the prod bundle, but every dev-only HTTP surface (OpenAPI, Scalar docs,
// /metrics, observability + client-events endpoints) is absent (404) unless the
// operator explicitly opts in. Default OFF, any value other than "1" is OFF.
export const isDevMode = (): boolean => process.env.RAZZOOLE_DEV === "1"

// Optional DEV-route API key. When set (and dev mode is on), the DEV-gated
// HTTP routes additionally require this token (header X-Manager-Token or
// ?token= query). Unset/empty -> dev-gate only (unchanged behaviour).
export const devApiKey = (): string | undefined =>
  process.env.DEV_API_KEY || undefined

// Read-only seed assets baked into the image (presets + brand backgrounds/logo).
// Mirrors getPath: BRANDING_PATH is set in Docker (=/app/branding via Dockerfile)
// and falls back to the repo-relative `source/branding` in dev (the socket dev
// process runs from packages/socket, so ../../branding === source/branding,
// exactly like CONFIG_PATH's ../../config fallback).
const brandingRoot = process.env.BRANDING_PATH

const getBrandingPath = (path = "") =>
  brandingRoot
    ? resolve(brandingRoot, path)
    : resolve(process.cwd(), "../../branding", path)

// Quizz/result ids are server-generated uuids / safe slugs. Reject anything that
// could escape the quizz/results dir (path traversal) before using it in a path.
const SAFE_ID = /^[A-Za-z0-9_-]+$/
// Even though these literals pass SAFE_ID, reject them outright: used as object
// keys downstream they enable prototype pollution. Additive guard on top of the
// regex test (same error type as the regex path).
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"])
export const assertSafeId = (id: string): void => {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new Error("Invalid id")
  }

  if (RESERVED_IDS.has(id)) {
    throw new Error("Invalid id")
  }
}

const MEDIA_MANIFEST = "media-manifest.json"
const MEDIA_ROOT = "media"
const MEDIA_IMAGE_MIME = /^image\/(?:png|jpeg|webp)$/u
const MEDIA_AUDIO_MIME = /^audio\/(?:mpeg|mp3|wav|ogg)$/u
const MEDIA_VIDEO_MIME = /^video\/(?:mp4|webm|ogg)$/u
const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/u
const SKELETON_FORMAT_VERSION = 1
const SKELETON_ASSET_MAX_BYTES = 512 * 1024
const SKELETON_TOTAL_MAX_BYTES = 32 * 1024 * 1024
const SKELETON_ENTRY_MAX = 200
const SKELETON_ASSET_EXT = new Set([
  "svg",
  "webp",
  "png",
  "jpg",
  "jpeg",
  "woff2",
  "mp3",
  "wav",
  "ogg",
])
const SKELETON_BACKGROUND_SLOTS = ["auth", "managerGame", "playerGame"] as const

const ensureDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const ensureMediaDirs = (): void => {
  ensureDir(getPath(MEDIA_ROOT))

  for (const category of MEDIA_CATEGORIES) {
    ensureDir(getPath(`${MEDIA_ROOT}/${category}`))
  }
}

const isMediaCategory = (value: string): value is MediaCategory =>
  MEDIA_CATEGORIES.includes(value as MediaCategory)

const safeAssetPath = (value: string): boolean => {
  if (/^\/theme\/[\w.-]+$/u.test(value)) {
    return true
  }

  if (!value.startsWith("/media/")) {
    return false
  }

  const segments = value.slice("/media/".length).split("/")

  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        /^[A-Za-z0-9_.-]+$/u.test(segment),
    )
  )
}

const assetRef = z
  .string()
  .refine(safeAssetPath, "errors:theme.invalidAsset")
  .nullable()

const socketThemeValidator = z.object({
  style: z.enum(["flat", "glass"]).default("flat"),
  colorPrimary: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
  colorSecondary: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
  colorText: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")
    .default("#ffffff"),
  answerColors: z.tuple([
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
    z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "errors:theme.invalidColor",
      ),
  ]),
  answerTextColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")
    .default("#ffffff"),
  accentColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor")
    .default("#ff9900"),
  radius: z.number().min(0).max(40).default(16),
  scrim: z.number().min(0).max(100).default(40),
  appTitle: z.string().max(40).nullable().default(null),
  logo: assetRef.default(null),
  showBranding: z.boolean().default(true),
  backgrounds: z.object({
    auth: assetRef,
    managerGame: assetRef,
    playerGame: assetRef,
  }),
})

const parseTheme = (data: unknown): Theme => {
  const commonResult = themeValidator.safeParse(data)

  if (commonResult.success) {
    return commonResult.data
  }

  const socketResult = socketThemeValidator.safeParse(data)

  if (!socketResult.success) {
    throw socketResult.error
  }

  // The lenient socket fallback validator predates the extended theme fields;
  // merge over DEFAULT_THEME so the result is always a complete Theme.
  return {
    ...DEFAULT_THEME,
    ...socketResult.data,
    backgrounds: {
      ...DEFAULT_THEME.backgrounds,
      ...socketResult.data.backgrounds,
    },
  }
}

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

export const getGameConfig = (): GameConfig => {
  const isExists = fs.existsSync(getPath("game.json"))

  if (!isExists) {
    throw new Error("Game config not found")
  }

  // Parse through the zod validator so every field is defaulted/back-filled.
  // A bare `{ managerPassword: "PASSWORD" }` back-fills the whole lowLatencyMode
  // block with `enabled: false`, so existing configs validate unchanged and the
  // auth gate (managerPassword) passes through. On any failure we fall back to
  // the schema defaults (`gameConfigValidator.parse({})`) so the server never
  // crashes on a malformed file — it just behaves as normal mode.
  try {
    const raw = fs.readFileSync(getPath("game.json"), "utf-8")
    const result = gameConfigValidator.safeParse(JSON.parse(raw))

    if (result.success) {
      return result.data
    }

    console.warn("Invalid game.json, using defaults:", result.error.issues)
  } catch (error) {
    console.error("Failed to read game config:", error)
  }

  return gameConfigValidator.parse({})
}

export const updateGameConfig = (patch: {
  teamMode?: boolean
  // The `lowLatencyMode.enabled` master switch, flattened for the manager
  // toggle. Deep-merged below so the other lowLatencyMode sub-fields are kept.
  lowLatencyEnabled?: boolean
}): GameConfig => {
  const current = getGameConfig()
  const { lowLatencyEnabled, ...flatPatch } = patch
  const merged = {
    ...current,
    ...flatPatch,
    // Only touch the nested enabled flag when the caller provided it; keep the
    // rest of the persisted lowLatencyMode block intact.
    ...(lowLatencyEnabled === undefined
      ? {}
      : {
          lowLatencyMode: { ...current.lowLatencyMode, enabled: lowLatencyEnabled },
        }),
  }
  const result = gameConfigValidator.safeParse(merged)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  fs.writeFileSync(getPath("game.json"), JSON.stringify(result.data, null, 2))

  return result.data
}

// ---- Achievements config (config/achievements.json) -----------------------
// Persisted shape: { [id]: { enabled?, name?, description?, threshold? } }.
// Reads never throw — a missing/corrupt file yields {} (registry defaults). The
// merged list (mergeAchievementsConfig) clamps every threshold and back-fills
// the defaults, so an empty record reproduces the SHIPPED hardcoded behaviour.
// Mirrors the getGameConfig + saveResult patterns (zod-validate, safe-write).

export const getAchievementsConfig = (): AchievementsConfig => {
  const filePath = getPath("achievements.json")

  if (!fs.existsSync(filePath)) {
    return {}
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = achievementsConfigValidator.safeParse(JSON.parse(raw))

    if (result.success) {
      return result.data
    }

    console.warn(
      "Invalid achievements.json, using defaults:",
      result.error.issues,
    )
  } catch (error) {
    console.error("Failed to read achievements config:", error)
  }

  return {}
}

export const getMergedAchievements = (): MergedAchievement[] =>
  mergeAchievementsConfig(getAchievementsConfig())

// Deep-merge a partial patch into the stored record (per-id object merge so a
// patch that only flips `enabled` keeps an existing name/description override),
// validate the merged record, then safe-write it. ensureDir on the config root
// so a fresh volume never errors on the first save.
export const saveAchievementsConfig = (
  patch: AchievementsConfig,
): AchievementsConfig => {
  const current = getAchievementsConfig()
  const merged: AchievementsConfig = { ...current }

  for (const [id, override] of Object.entries(patch)) {
    merged[id] = { ...(current[id] ?? {}), ...override }
  }

  const result = achievementsConfigValidator.safeParse(merged)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  ensureDir(getPath())
  fs.writeFileSync(
    getPath("achievements.json"),
    JSON.stringify(result.data, null, 2),
  )

  return result.data
}

export const getQuizzMeta = (): QuizzMeta[] =>
  getQuizz().map(
    (q): QuizzMeta => ({
      id: q.id,
      subject: q.subject,
      archived: !!q.archived,
      questionCount: q.questions.length,
    }),
  )

export const getQuizzById = (id: string) => {
  assertSafeId(id)

  const filePath = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const data = fs.readFileSync(filePath, "utf-8")
  const result = quizzValidator.safeParse(JSON.parse(data))

  if (!result.success) {
    throw new Error(`Invalid quizz "${id}"`)
  }

  return { id, ...result.data }
}

export const getQuizz = () => {
  const isExists = fs.existsSync(getPath("quizz"))

  if (!isExists) {
    return []
  }

  try {
    const files = fs
      .readdirSync(getPath("quizz"))
      .filter((file) => file.endsWith(".json"))

    const quizz: QuizzWithId[] = files.flatMap((file) => {
      const data = fs.readFileSync(getPath(`quizz/${file}`), "utf-8")
      const id = file.replace(".json", "")
      const result = quizzValidator.safeParse(JSON.parse(data))

      if (!result.success) {
        console.warn(`Invalid quizz config "${file}":`, result.error.issues)

        return []
      }

      return [{ id, ...result.data }]
    })

    return quizz
  } catch (error) {
    console.error("Failed to read quizz config:", error)

    return []
  }
}

export const updateQuizz = (id: string, data: unknown): { id: string } => {
  assertSafeId(id)

  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  const oldPath = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  fs.writeFileSync(oldPath, JSON.stringify(result.data, null, 2))

  return { id }
}

// Archive toggle: flip the `archived` flag on a quizz without deleting it.
// Reads the on-disk file through quizzValidator (so the rest of the record is
// re-validated), sets the flag, and writes it back. assertSafeId guards the path.
export const setQuizzArchived = (id: string, archived: boolean): void => {
  assertSafeId(id)

  const filePath = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const result = quizzValidator.safeParse(
    JSON.parse(fs.readFileSync(filePath, "utf-8")),
  )

  if (!result.success) {
    throw new Error(`Invalid quizz "${id}"`)
  }

  fs.writeFileSync(
    filePath,
    JSON.stringify({ ...result.data, archived }, null, 2),
  )
}

export const deleteQuizz = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  fs.unlinkSync(filePath)
}

export const saveResult = (data: GameResult): void => {
  try {
    const resultsPath = getPath("results")

    if (!fs.existsSync(resultsPath)) {
      fs.mkdirSync(resultsPath)
    }

    fs.writeFileSync(
      getPath(`results/${data.id}.json`),
      JSON.stringify(data, null, 2),
    )

    console.log(`Saved result for "${data.subject}"`)
  } catch (error) {
    console.error("Failed to save result:", error)
  }
}

export const getResultsMeta = (): GameResultMeta[] => {
  const resultsPath = getPath("results")

  if (!fs.existsSync(resultsPath)) {
    return []
  }

  const readMeta = (file: string): GameResultMeta | null => {
    try {
      const data = fs.readFileSync(getPath(`results/${file}`), "utf-8")
      const result = gameResultValidator.safeParse(JSON.parse(data))

      if (!result.success) {
        return null
      }

      return {
        id: result.data.id,
        subject: result.data.subject,
        date: result.data.date,
        playerCount: result.data.players.length,
      }
    } catch {
      return null
    }
  }

  try {
    return fs
      .readdirSync(resultsPath)
      .filter((file) => file.endsWith(".json"))
      .map(readMeta)
      .filter((meta): meta is GameResultMeta => meta !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
}

export const getResultById = (id: string): GameResult => {
  assertSafeId(id)

  const filePath = getPath(`results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Result "${id}" not found`)
  }

  // Validate the on-disk file instead of a bare cast, consistent with the
  // quizz/theme readers. A malformed/corrupt file is treated as not found.
  const result = gameResultValidator.safeParse(
    JSON.parse(fs.readFileSync(filePath, "utf-8")),
  )

  if (!result.success) {
    throw new Error(`Result "${id}" not found`)
  }

  return result.data as GameResult
}

export const deleteResult = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Result "${id}" not found`)
  }

  fs.unlinkSync(filePath)
}

// ---- Submissions (public question-submission moderation queue) ------------
// Records are validated through submissionRecordValidator on every read; every
// path interpolation is guarded by assertSafeId so a user-supplied id cannot
// escape the submissions dir.

// Cached count of submissions still awaiting moderation. Initialized lazily
// (one-time O(N) scan) and then kept in sync incrementally by save/update/delete
// so the hot public SUBMIT path no longer re-scans the whole submissions dir.
let pendingCount: number | null = null

export const saveSubmission = (data: Submission): void => {
  assertSafeId(data.id)

  const dir = getPath("submissions")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(
    getPath(`submissions/${data.id}.json`),
    JSON.stringify(data, null, 2),
  )

  // A fresh public submission is always "pending". Keep the cached counter in
  // sync only once it has been initialized (null = not yet primed).
  if (pendingCount !== null && data.status === "pending") {
    pendingCount += 1
  }
}

export const getSubmissions = (): Submission[] => {
  const dir = getPath("submissions")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const raw = fs.readFileSync(getPath(`submissions/${file}`), "utf-8")
        const result = submissionRecordValidator.safeParse(JSON.parse(raw))

        if (!result.success) {
          console.warn(
            `Invalid submission file "${file}":`,
            result.error.issues,
          )

          return []
        }

        return [result.data as Submission]
      } catch {
        return []
      }
    })
}

// Count submissions still awaiting moderation. Used by the public SUBMIT path
// to enforce a hard pending-queue cap so the moderation backlog cannot be
// flooded. The first call primes the cache with a one-time O(N) disk scan;
// every later call is O(1) because save/update/delete keep the counter in sync.
export const countPendingSubmissions = (): number => {
  if (pendingCount === null) {
    pendingCount = getSubmissions().filter((s) => s.status === "pending").length
  }

  return pendingCount
}

export const getSubmissionsMeta = (): SubmissionMeta[] =>
  getSubmissions().map(
    ({ id, submittedBy, submittedAt, status, question }) => ({
      id,
      submittedBy,
      submittedAt,
      status,
      question: question.question,
    }),
  )

export const getSubmissionById = (id: string): Submission | null => {
  assertSafeId(id)

  const filePath = getPath(`submissions/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = submissionRecordValidator.safeParse(JSON.parse(raw))

    return result.success ? (result.data as Submission) : null
  } catch {
    return null
  }
}

export const updateSubmission = (
  id: string,
  data: Partial<Submission>,
): void => {
  assertSafeId(id)

  const existing = getSubmissionById(id)

  if (!existing) {
    throw new Error(`Submission "${id}" not found`)
  }

  const merged = { ...existing, ...data, id }

  // Adjust the cached pending counter by the status TRANSITION (old → new).
  // saveSubmission below only increments when it writes a fresh "pending"
  // record (existing record never primes the cache twice), so apply the delta
  // here against the old status and skip saveSubmission's own bump.
  if (pendingCount !== null) {
    const wasPending = existing.status === "pending"
    const isPending = merged.status === "pending"

    if (wasPending && !isPending) {
      pendingCount = Math.max(0, pendingCount - 1)
    } else if (!wasPending && isPending) {
      pendingCount += 1
    }
  }

  // Force the id back to the validated one so a Partial can never repoint it.
  // Write directly (not via saveSubmission) so its own pending++ does not
  // double-count on top of the transition delta applied above.
  fs.writeFileSync(
    getPath(`submissions/${id}.json`),
    JSON.stringify(merged, null, 2),
  )
}

export const deleteSubmission = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`submissions/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return
  }

  // Decrement the cached counter if the record being removed was pending.
  if (pendingCount !== null) {
    const existing = getSubmissionById(id)

    if (existing?.status === "pending") {
      pendingCount = Math.max(0, pendingCount - 1)
    }
  }

  fs.unlinkSync(filePath)
}

// ---- Catalog (reusable question bank) -------------------------------------
// Each entry is a config/catalog/<id>.json CatalogEntry. Reads validate every
// file through catalogEntryValidator (skipping invalid ones, like getSubmissions).
// Every path interpolation is guarded by assertSafeId so a user-supplied id can
// never escape the catalog dir.

export const getCatalog = (): CatalogEntry[] => {
  const dir = getPath("catalog")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const raw = fs.readFileSync(getPath(`catalog/${file}`), "utf-8")
        const result = catalogEntryValidator.safeParse(JSON.parse(raw))

        if (!result.success) {
          console.warn(`Invalid catalog file "${file}":`, result.error.issues)

          return []
        }

        const id = file.replace(".json", "")

        return [{ ...result.data, id } as CatalogEntry]
      } catch {
        return []
      }
    })
}

export const getCatalogById = (id: string): CatalogEntry | null => {
  assertSafeId(id)

  const filePath = getPath(`catalog/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = catalogEntryValidator.safeParse(JSON.parse(raw))

    return result.success ? ({ ...result.data, id } as CatalogEntry) : null
  } catch {
    return null
  }
}

export const saveCatalogEntry = (
  payload: z.infer<typeof catalogAddValidator>,
): CatalogEntry => {
  // Re-validate the inbound payload so callers passing a hand-built object (e.g.
  // approve-to-catalog) get the SAME superRefine guarantees as a wire ADD.
  const parsed = catalogAddValidator.safeParse(payload)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const dir = getPath("catalog")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Derive a safe id from the question text; dedupe with a -2/-3 suffix so two
  // entries with identical text don't clobber each other.
  const baseId = normalizeFilename(parsed.data.question.question)
  let id = baseId
  let suffix = 2

  while (fs.existsSync(getPath(`catalog/${id}.json`))) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  assertSafeId(id)

  const entry: CatalogEntry = {
    id,
    question: parsed.data.question,
    tags: parsed.data.tags,
    source: parsed.data.source ?? "manual",
    addedAt: new Date().toISOString(),
  }

  // Validate the fully-assembled entry before persisting.
  const validated = catalogEntryValidator.safeParse(entry)

  if (!validated.success) {
    throw new Error(validated.error.issues[0].message)
  }

  fs.writeFileSync(
    getPath(`catalog/${id}.json`),
    JSON.stringify(entry, null, 2),
  )

  return entry
}

export const updateCatalogEntry = (
  id: string,
  data: { question: CatalogEntry["question"]; tags?: string[] },
): CatalogEntry => {
  assertSafeId(id)

  const existing = getCatalogById(id)

  if (!existing) {
    throw new Error("errors:catalog.notFound")
  }

  const entry: CatalogEntry = {
    ...existing,
    id,
    question: data.question,
    tags: data.tags,
  }

  const validated = catalogEntryValidator.safeParse(entry)

  if (!validated.success) {
    throw new Error(validated.error.issues[0].message)
  }

  fs.writeFileSync(
    getPath(`catalog/${id}.json`),
    JSON.stringify(entry, null, 2),
  )

  return entry
}

export const deleteCatalogEntry = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`catalog/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error("errors:catalog.notFound")
  }

  fs.unlinkSync(filePath)
}

// ---- Theme templates (named theme presets) --------------------------------
// Each preset is a config/theme-templates/<id>.json ThemeTemplate { id, name,
// theme }. Reads validate every file through themeTemplateValidator (skipping
// invalid ones, like getCatalog/getSubmissions). The id is a server-derived safe
// slug of the name; every path interpolation is guarded by assertSafeId so a
// user-supplied id can never escape the theme-templates dir.

const themeTemplatesDir = () => getPath("theme-templates")

export const getThemeTemplates = (): ThemeTemplate[] => {
  const dir = themeTemplatesDir()

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const raw = fs.readFileSync(getPath(`theme-templates/${file}`), "utf-8")
        const result = themeTemplateValidator.safeParse(JSON.parse(raw))

        if (!result.success) {
          console.warn(
            `Invalid theme-template file "${file}":`,
            result.error.issues,
          )

          return []
        }

        const id = file.replace(".json", "")

        return [{ ...result.data, id } as ThemeTemplate]
      } catch {
        return []
      }
    })
}

export const getThemeTemplatesMeta = (): ThemeTemplateMeta[] =>
  getThemeTemplates().map(({ id, name }) => ({ id, name }))

export const getThemeTemplateById = (id: string): ThemeTemplate | null => {
  assertSafeId(id)

  const filePath = getPath(`theme-templates/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = themeTemplateValidator.safeParse(JSON.parse(raw))

    return result.success ? ({ ...result.data, id } as ThemeTemplate) : null
  } catch {
    return null
  }
}

export const saveThemeTemplate = (payload: {
  name: string
  theme: Theme
}): { id: string } => {
  // Dedupe-on-save: if a template already exists under the same display name
  // (normalized + trimmed + case-insensitive), reuse its id so a re-save
  // overwrites in place instead of creating a duplicate. Only a genuinely new
  // name gets a fresh slug+nanoid id.
  const normalizedName = payload.name.trim().toLowerCase()
  const existing = getThemeTemplates().find(
    (t) => t.name.trim().toLowerCase() === normalizedName,
  )
  const id = existing ? existing.id : normalizeFilename(payload.name)
  assertSafeId(id)

  const record: ThemeTemplate = { id, name: payload.name, theme: payload.theme }

  // Re-validate the fully-assembled record before persisting so a hand-built
  // payload gets the same guarantees as a wire SAVE.
  const validated = themeTemplateValidator.safeParse(record)

  if (!validated.success) {
    throw new Error(validated.error.issues[0].message)
  }

  const dir = themeTemplatesDir()

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(
    getPath(`theme-templates/${id}.json`),
    JSON.stringify(record, null, 2),
  )

  return { id }
}

export const deleteThemeTemplate = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`theme-templates/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error("errors:themeTemplate.notFound")
  }

  fs.unlinkSync(filePath)
}

// ---- AI settings (config/ai-settings.json) --------------------------------
// Never carries any secret (those live in ai-secrets.json). On a missing/corrupt
// file we SEED from the constants presets so the KI tab is populated out of the
// box; the active text provider defaults to "off" (generation disabled).

const seedAISettings = (): AISettings => {
  const localOverride = process.env.RAHOOT_AI_LOCAL_URL

  return {
    text: {
      activeProvider: AI_PROVIDER_OFF,
      providers: AI_TEXT_PROVIDER_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        // The "local" provider's baseUrl is overridable server-side so an
        // operator can point Ollama elsewhere without editing the file.
        baseUrl:
          p.id === "local" && localOverride
            ? localOverride
            : "baseUrl" in p
              ? p.baseUrl
              : undefined,
        model: p.model,
      })),
    },
    image: {
      activeProvider: "comfyui",
      providers: [{ id: "comfyui", label: "ComfyUI / Z-Image" }],
    },
  }
}

export const getAISettings = (): AISettings => {
  const filePath = getPath("ai-settings.json")

  if (!fs.existsSync(filePath)) {
    return seedAISettings()
  }

  // Mirror getGameConfig: never throw on a malformed file — fall back to the
  // seed so the server keeps booting and the KI tab stays usable.
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = aiSettingsValidator.safeParse(JSON.parse(raw))

    if (result.success) {
      return result.data
    }

    console.warn("Invalid ai-settings.json, using seed:", result.error.issues)
  } catch (error) {
    console.error("Failed to read ai settings:", error)
  }

  return seedAISettings()
}

export const setAISettings = (payload: unknown): AISettings => {
  const result = aiSettingsValidator.safeParse(payload)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  fs.writeFileSync(
    getPath("ai-settings.json"),
    JSON.stringify(result.data, null, 2),
  )

  return result.data
}

// Map persisted settings to the wire shape: each text provider gains a
// `keyConfigured` boolean (derived from ai-secrets) and NEVER carries the key
// itself. Image providers are unchanged (no secrets).
export const toPublicAISettings = (s: AISettings): AISettingsPublic => ({
  text: {
    activeProvider: s.text.activeProvider,
    providers: s.text.providers.map(
      (p): AIProviderPublic => ({ ...p, keyConfigured: hasKey(p.id) }),
    ),
  },
  image: s.image,
})

const manifestPath = () => getPath(MEDIA_MANIFEST)

const readMediaManifest = (): MediaMeta[] => {
  const file = manifestPath()

  if (!fs.existsSync(file)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((item): MediaMeta[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("id" in item) ||
        !("filename" in item) ||
        !("url" in item) ||
        !("size" in item) ||
        !("type" in item) ||
        !("category" in item) ||
        !("source" in item) ||
        !("uploadedAt" in item)
      ) {
        return []
      }

      const candidate = item as Record<string, unknown>

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.filename !== "string" ||
        typeof candidate.url !== "string" ||
        typeof candidate.size !== "number" ||
        (candidate.type !== "image" &&
          candidate.type !== "audio" &&
          candidate.type !== "video") ||
        typeof candidate.category !== "string" ||
        !isMediaCategory(candidate.category) ||
        (candidate.source !== "upload" &&
          candidate.source !== "ai" &&
          candidate.source !== "theme") ||
        typeof candidate.uploadedAt !== "string" ||
        // WP-6 — width/height are optional; only reject when present-but-not-number
        // (pre-existing rows without them MUST still load — no new required key).
        (candidate.width !== undefined &&
          typeof candidate.width !== "number") ||
        (candidate.height !== undefined && typeof candidate.height !== "number")
      ) {
        return []
      }

      // Construct the MediaMeta explicitly from the fields the guard above has
      // already narrowed (no `as unknown as MediaMeta` laundering — a stray
      // extra key on the manifest row never leaks back out on a re-write).
      const base: MediaMeta = {
        id: candidate.id,
        filename: candidate.filename,
        url: candidate.url,
        size: candidate.size,
        type: candidate.type,
        category: candidate.category,
        source: candidate.source,
        uploadedAt: candidate.uploadedAt,
      }

      // WP-6 — copy dims through only when both are numbers (clean JSON, no
      // undefined keys leaking back out on a re-write).
      return [
        typeof candidate.width === "number" &&
        typeof candidate.height === "number"
          ? { ...base, width: candidate.width, height: candidate.height }
          : base,
      ]
    })
  } catch {
    return []
  }
}

const writeMediaManifest = (items: MediaMeta[]): void => {
  fs.writeFileSync(manifestPath(), JSON.stringify(items, null, 2))
}

export const getMediaList = (): MediaMeta[] => readMediaManifest()

const normalizeMediaStem = (filename: string): string => {
  const stem = basename(filename, extname(filename))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64)

  return stem || "media"
}

const extensionForMime = (mime: string): string => {
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return ".webp"
  }

  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return ".mp3"
  }

  if (mime === "audio/wav") {
    return ".wav"
  }

  if (mime === "audio/ogg") {
    return ".ogg"
  }

  if (mime === "video/mp4") {
    return ".mp4"
  }

  if (mime === "video/webm") {
    return ".webm"
  }

  if (mime === "video/ogg") {
    return ".ogv"
  }

  throw new Error("errors:media.invalidDataUrl")
}

const decodeDataUrl = (
  dataUrl: string,
  accepted: RegExp,
  invalidMessage: string,
): { mime: string; buffer: Buffer } => {
  const match = DATA_URL_RE.exec(dataUrl)

  if (!match || !accepted.test(match[1])) {
    throw new Error(invalidMessage)
  }

  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  }
}

const assertSafeFilename = (filename: string): void => {
  if (filename.startsWith("/") || filename.includes("\\")) {
    throw new Error("Invalid id")
  }

  for (const segment of filename.split("/")) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("Invalid id")
    }

    const stem = segment.replace(/\.[a-z0-9]+$/iu, "")
    assertSafeId(stem)
  }
}

const mediaFilePath = (category: MediaCategory, filename: string): string => {
  assertSafeFilename(filename)

  const mediaRoot = resolve(getPath(MEDIA_ROOT))
  const target = resolve(mediaRoot, category, filename)
  const rel = relative(mediaRoot, target)

  if (
    rel.startsWith("..") ||
    rel === "" ||
    resolve(mediaRoot, rel) !== target
  ) {
    throw new Error("Invalid id")
  }

  return target
}

const upsertMediaMeta = (meta: MediaMeta): MediaMeta => {
  const manifest = readMediaManifest().filter((item) => item.id !== meta.id)
  writeMediaManifest([...manifest, meta])

  return meta
}

const removeManifestWhere = (
  predicate: (_item: MediaMeta) => boolean,
): void => {
  writeMediaManifest(readMediaManifest().filter((item) => !predicate(item)))
}

const createMediaMeta = (input: {
  filename: string
  category: MediaCategory
  size: number
  type: "image" | "audio" | "video"
  source: MediaMeta["source"]
  // WP-6 — optional image dimensions; only written when both are present.
  width?: number
  height?: number
}): MediaMeta => {
  const id = `${input.category}-${input.filename.replace(/\.[a-z0-9]+$/iu, "")}`
  assertSafeId(id)

  return {
    id,
    filename: input.filename,
    url: `/media/${input.category}/${input.filename}`,
    size: input.size,
    type: input.type,
    category: input.category,
    source: input.source,
    uploadedAt: new Date().toISOString(),
    // WP-6 — only set dims when both are provided (no undefined keys in the JSON).
    ...(input.width !== undefined && input.height !== undefined
      ? { width: input.width, height: input.height }
      : {}),
  }
}

export const saveMediaFile = async (
  dataUrl: string,
  filename: string,
  category?: MediaCategory,
): Promise<MediaMeta> => {
  const { mime, buffer } = decodeDataUrl(
    dataUrl,
    /^(?:image|audio|video)\//u,
    "errors:media.invalidDataUrl",
  )
  const inferredType = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : "image"
  const resolvedCategory =
    category ?? (inferredType === "audio" ? "audio" : "questions")

  if (!isMediaCategory(resolvedCategory)) {
    throw new Error("errors:media.invalidCategory")
  }

  if (inferredType === "image" && !MEDIA_IMAGE_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  if (inferredType === "audio" && !MEDIA_AUDIO_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  if (inferredType === "video" && !MEDIA_VIDEO_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  ensureMediaDirs()

  const safeStem = normalizeMediaStem(filename)
  const storedFilename = `${safeStem}-${nanoid(8)}${extensionForMime(mime)}`
  const output =
    inferredType === "image" ? await toWebp(buffer) : Buffer.from(buffer)
  const target = mediaFilePath(resolvedCategory, storedFilename)
  fs.writeFileSync(target, output)

  // WP-6 — for images, probe the WebP output buffer for its pixel dimensions.
  // Pure-JS parse; null on an unrecognized buffer → dims are simply omitted.
  const dims = inferredType === "image" ? webpDimensions(output) : null

  return upsertMediaMeta(
    createMediaMeta({
      filename: storedFilename,
      category: resolvedCategory,
      size: output.byteLength,
      type: inferredType,
      source: "upload",
      width: dims?.width,
      height: dims?.height,
    }),
  )
}

export const deleteMediaFile = (id: string): void => {
  assertSafeId(id)

  const manifest = readMediaManifest()
  const item = manifest.find((entry) => entry.id === id)

  if (!item) {
    throw new Error("errors:media.notFound")
  }

  const target = mediaFilePath(item.category, item.filename)

  if (fs.existsSync(target)) {
    fs.unlinkSync(target)
  }

  writeMediaManifest(manifest.filter((entry) => entry.id !== id))
}

export const saveEphemeralAvatar = async (
  gameId: string,
  playerId: string,
  dataUrl: string,
): Promise<string> => {
  assertSafeId(gameId)
  assertSafeId(playerId)

  const { buffer } = decodeDataUrl(
    dataUrl,
    MEDIA_IMAGE_MIME,
    "errors:avatar.invalid",
  )

  if (buffer.byteLength > AVATAR_MAX_BYTES) {
    throw new Error("errors:avatar.tooLarge")
  }

  const webp = await toWebp(buffer)

  if (webp.byteLength > AVATAR_MAX_BYTES) {
    throw new Error("errors:avatar.tooLarge")
  }

  const dir = getPath(`${MEDIA_ROOT}/avatars/${gameId}`)
  ensureDir(dir)
  fs.writeFileSync(resolve(dir, `${playerId}.webp`), webp)

  return `/media/avatars/${gameId}/${playerId}.webp`
}

export const deleteGameAvatars = (gameId: string): void => {
  assertSafeId(gameId)
  fs.rmSync(getPath(`${MEDIA_ROOT}/avatars/${gameId}`), {
    recursive: true,
    force: true,
  })
}

export const cleanupStaleAvatars = (activeGameIds: Iterable<string>): void => {
  const active = new Set(activeGameIds)
  const root = getPath(`${MEDIA_ROOT}/avatars`)

  if (!fs.existsSync(root)) {
    return
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "generic") {
      continue
    }

    if (!active.has(entry.name)) {
      fs.rmSync(resolve(root, entry.name), { recursive: true, force: true })
    }
  }
}

// Persist ComfyUI-produced WebP bytes into config/media/generated under a
// server-generated name and return its public "/media/generated/<file>" path.
// The bytes are fetched over HTTP by the caller so the socket container never
// needs to reach the ComfyUI host filesystem. `destName` is server-generated
// (gen-<nanoid>.webp) and re-checked with assertSafeId stem.
export const saveGeneratedImageBytes = (
  buffer: Buffer,
  destName: string,
): string => {
  const stem = destName.replace(/\.[a-z0-9]+$/u, "")
  assertSafeId(stem)

  ensureMediaDirs()
  const target = mediaFilePath("generated", destName)
  fs.writeFileSync(target, buffer)

  upsertMediaMeta(
    createMediaMeta({
      filename: destName,
      category: "generated",
      size: buffer.byteLength,
      type: "image",
      source: "ai",
    }),
  )

  return `/media/generated/${destName}`
}

export const saveQuizz = (data: unknown): { id: string } => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  const id = normalizeFilename(result.data.subject)
  const filePath = getPath(`quizz/${id}.json`)

  fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))

  return { id }
}

// ---- Theme (backgrounds + colors) ---------------------------------------
// THEME_SLOTS / ThemeSlot are imported from @razzoozle/common (single source of
// truth shared with the web client). The runtime guard below is unchanged.

export const getTheme = (): Theme => {
  const filePath = getPath("theme/theme.json")

  if (!fs.existsSync(filePath)) {
    return DEFAULT_THEME
  }

  try {
    return parseTheme(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  } catch (error) {
    console.error("Failed to read theme:", error)

    return DEFAULT_THEME
  }
}

export const setTheme = (
  data: unknown,
  opts?: { snapshot?: boolean },
): Theme => {
  let theme: Theme

  try {
    theme = parseTheme(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(error.issues[0].message)
    }

    throw error
  }

  // WP-18 — capture the CURRENT on-disk theme as a revision BEFORE overwriting it.
  // Defaults to true: the only callsite is the auth-gated admin SET_THEME path,
  // so every admin save (and every restore) is snapshotted and undoable. A
  // future non-admin auto-apply callsite must pass { snapshot: false } to avoid
  // polluting the ring. parseTheme already validated `data`, so the snapshot
  // happens only on a save we know will succeed.
  if (opts?.snapshot ?? true) {
    saveThemeRevision(getTheme())
  }

  const themeDir = getPath("theme")

  if (!fs.existsSync(themeDir)) {
    fs.mkdirSync(themeDir)
  }

  fs.writeFileSync(getPath("theme/theme.json"), JSON.stringify(theme, null, 2))

  return theme
}

const skeletonSourcePath = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  if (value.startsWith("/media/") || value.startsWith("/theme/")) {
    return getPath(value.slice(1))
  }

  return null
}

export const buildSkeletonZip = async (): Promise<Buffer> => {
  const theme = getTheme()
  const zip = new JSZip()

  zip.file(
    "skeleton.json",
    JSON.stringify(
      {
        formatVersion: SKELETON_FORMAT_VERSION,
        name: theme.appTitle || "razzoozle",
        theme,
      },
      null,
      2,
    ),
  )

  const addAsset = (value: string | null, entryDir: string): void => {
    const src = skeletonSourcePath(value)

    if (!src || !fs.existsSync(src) || !value) {
      return
    }

    zip.file(`${entryDir}/${basename(value)}`, fs.readFileSync(src))
  }

  addAsset(theme.logo, "assets")
  addAsset(theme.backgrounds.auth, "assets/backgrounds")
  addAsset(theme.backgrounds.managerGame, "assets/backgrounds")
  addAsset(theme.backgrounds.playerGame, "assets/backgrounds")

  // Sound-pack overrides → assets/sounds/ (mirrors the backgrounds branch). A
  // null slot has no asset to ship; addAsset no-ops on null/missing files.
  for (const slot of SOUND_SLOTS) {
    addAsset(theme.sounds[slot], "assets/sounds")
  }

  // Always ship theme.css / theme.js: the saved custom override if one exists,
  // otherwise a generated scaffold (the bundle is meant to carry css + js, and
  // the scaffold gives an LLM a concrete starting point).
  const cssFile = getPath("theme/skeleton.css")
  zip.file(
    "theme.css",
    fs.existsSync(cssFile)
      ? fs.readFileSync(cssFile, "utf-8")
      : renderSkeletonCss(theme),
  )

  const jsFile = getPath("theme/skeleton.js")
  zip.file(
    "theme.js",
    fs.existsSync(jsFile)
      ? fs.readFileSync(jsFile, "utf-8")
      : renderSkeletonJs(),
  )

  zip.file("SKELETON.md", renderSkeletonDoc(theme))

  // Themed + animated preview pages (phone-game / lobby / presentation) plus the
  // animation stylesheet, so an LLM that receives the ZIP can open demo/*.html
  // and visually test the theme it authored. Export-only (ignored on import).
  for (const file of renderSkeletonDemo(theme)) {
    zip.file(file.path, file.content)
  }

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer
}

export const importSkeletonZip = async (buf: Buffer): Promise<Theme> => {
  const zip = await JSZip.loadAsync(buf)
  const entries = Object.values(zip.files)

  if (entries.length > SKELETON_ENTRY_MAX) {
    throw new Error("errors:skeleton.tooManyEntries")
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
      throw new Error("errors:skeleton.tooLarge")
    }

    buffers.set(entry.name, entryBuffer)
  }

  const manifest = buffers.get("skeleton.json")

  if (!manifest) {
    throw new Error("errors:skeleton.missingManifest")
  }

  const parsedJson = JSON.parse(manifest.toString("utf-8")) as unknown
  const theme: Theme = themeValidator.parse(
    (parsedJson as { theme?: unknown }).theme,
  )

  for (const entry of entries) {
    if (entry.dir || !entry.name.startsWith("assets/")) {
      continue
    }

    const content = buffers.get(entry.name)
    const base = basename(entry.name)
    const expectedBase = entry.name.replace(
      /^assets\/(backgrounds\/|sounds\/)?/u,
      "",
    )

    if (
      !content ||
      base !== expectedBase ||
      base.includes("/") ||
      base.includes("\\") ||
      base.includes("..") ||
      base === ""
    ) {
      continue
    }

    const ext = extname(base).slice(1).toLowerCase()

    if (!SKELETON_ASSET_EXT.has(ext)) {
      continue
    }

    const isBackground = entry.name.startsWith("assets/backgrounds/")
    const isSound = entry.name.startsWith("assets/sounds/")
    const dest = isBackground
      ? getPath(`media/backgrounds/${base}`)
      : isSound
        ? getPath(`media/sounds/${base}`)
        : getPath(`theme/${base}`)
    ensureDir(resolve(dest, ".."))
    fs.writeFileSync(dest, content)

    if (!isBackground && !isSound && basename(theme.logo ?? "") === base) {
      theme.logo = `/theme/${base}`
    }

    if (isBackground) {
      for (const slot of SKELETON_BACKGROUND_SLOTS) {
        if (basename(theme.backgrounds[slot] ?? "") === base) {
          theme.backgrounds[slot] = `/media/backgrounds/${base}`
        }
      }
    }

    if (isSound) {
      for (const slot of SOUND_SLOTS) {
        if (basename(theme.sounds[slot] ?? "") === base) {
          theme.sounds[slot] = `/media/sounds/${base}`
        }
      }
    }
  }

  const css = buffers.get("theme.css")
  if (css) {
    if (css.byteLength > SKELETON_ASSET_MAX_BYTES) {
      throw new Error("errors:skeleton.assetTooLarge")
    }

    ensureDir(getPath("theme"))
    fs.writeFileSync(getPath("theme/skeleton.css"), css.toString("utf-8"))
    theme.customCssEnabled = true
  }

  const js = buffers.get("theme.js")
  if (js) {
    if (js.byteLength > SKELETON_ASSET_MAX_BYTES) {
      throw new Error("errors:skeleton.assetTooLarge")
    }

    ensureDir(getPath("theme"))
    fs.writeFileSync(getPath("theme/skeleton.js"), js.toString("utf-8"))
    theme.customJsEnabled = true
  }

  theme.skeletonVersion = (theme.skeletonVersion ?? 0) + 1

  return setTheme(theme)
}

export const getSkeletonAsset = (kind: "css" | "js"): string => {
  const file = getPath(
    kind === "css" ? "theme/skeleton.css" : "theme/skeleton.js",
  )

  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : ""
}

export const setSkeletonAsset = (
  kind: "css" | "js",
  content: string,
): Theme => {
  if (typeof content !== "string") {
    throw new Error("errors:skeleton.invalidContent")
  }

  if (Buffer.byteLength(content) > SKELETON_ASSET_MAX_BYTES) {
    throw new Error("errors:skeleton.assetTooLarge")
  }

  ensureDir(getPath("theme"))
  fs.writeFileSync(
    getPath(kind === "css" ? "theme/skeleton.css" : "theme/skeleton.js"),
    content,
  )

  const theme = getTheme()

  if (kind === "css") {
    theme.customCssEnabled = true
  } else {
    theme.customJsEnabled = true
  }

  theme.skeletonVersion = (theme.skeletonVersion ?? 0) + 1

  return setTheme(theme)
}

// Factory-reset the look: discard the active theme + any custom skeleton CSS/JS
// and re-persist the bundled DEFAULT_THEME. setTheme snapshots the prior theme to
// the revision ring first, so a reset stays undoable. Backs the manager's
// "reset to standard" action.
export const resetSkeleton = (): Theme => {
  for (const name of ["skeleton.css", "skeleton.js"]) {
    const file = getPath(`theme/${name}`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }

  return setTheme({ ...DEFAULT_THEME })
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
const pluginDir = (id: string): string => getPath(`plugins/${id}`)
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
}

// Merge a config bag into the index entry for <id>. Snapshots first.
export const setPluginConfig = (
  id: string,
  config: Record<string, unknown>,
): void => {
  assertSafeId(id)
  savePluginRevision()

  writePlugins(
    readPlugins().map((p) =>
      p.id === id
        ? { ...p, config: { ...(p.config ?? {}), ...config } }
        : p,
    ),
  )
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


// ---- Theme revisions (per-save version ring) ------------------------------
// A single rolling config/theme-revisions.json array (newest-first), capped at
// THEME_REVISIONS_MAX. Each prior theme is snapshotted before an admin SET_THEME
// (see setTheme). Reads validate every entry via themeRevisionValidator and drop
// invalid ones (like getThemeTemplates); a missing file yields []. No per-file id
// slugging → no extra path-traversal surface (single fixed filename).

const themeRevisionsFile = () => getPath("theme-revisions.json")

export const getThemeRevisions = (): ThemeRevision[] => {
  const file = themeRevisionsFile()

  if (!fs.existsSync(file)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown
    // Tolerate both a bare array and a { revisions: [...] } wrapper.
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { revisions?: unknown })?.revisions)
        ? (parsed as { revisions: unknown[] }).revisions
        : []

    return arr.flatMap((entry) => {
      const result = themeRevisionValidator.safeParse(entry)

      if (!result.success) {
        console.warn("Invalid theme revision entry:", result.error.issues)

        return []
      }

      return [result.data as ThemeRevision]
    })
  } catch (error) {
    console.error("Failed to read theme revisions:", error)

    return []
  }
}

export const getThemeRevisionById = (id: string): ThemeRevision | null =>
  getThemeRevisions().find((rev) => rev.id === id) ?? null

export const saveThemeRevision = (theme: Theme): { id: string } => {
  const id = `rev-${Date.now()}`
  const record: ThemeRevision = {
    id,
    createdAt: new Date().toISOString(),
    theme,
  }

  // unshift newest, cap at THEME_REVISIONS_MAX (oldest dropped).
  const next = [record, ...getThemeRevisions()].slice(0, THEME_REVISIONS_MAX)

  fs.writeFileSync(themeRevisionsFile(), JSON.stringify(next, null, 2))

  return { id }
}

// Persist an uploaded background image (data URL) for a slot and return its
// public "/media/backgrounds/<file>" path (served by nginx from the config
// volume).
export const saveBackgroundImage = async (
  slot: ThemeSlot,
  dataUrl: string,
): Promise<string> => {
  if (!THEME_SLOTS.includes(slot)) {
    throw new Error("errors:theme.invalidSlot")
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl)

  if (!match) {
    throw new Error("errors:theme.invalidImage")
  }

  const buffer = Buffer.from(match[2], "base64")

  // 8 MB hard cap
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("errors:theme.imageTooLarge")
  }

  ensureMediaDirs()
  const backgroundsDir = getPath(`${MEDIA_ROOT}/backgrounds`)

  // Remove previous files for this slot so the folder doesn't grow unbounded.
  for (const file of fs.readdirSync(backgroundsDir)) {
    if (file.startsWith(`${slot}-`)) {
      fs.unlinkSync(resolve(backgroundsDir, file))
    }
  }
  removeManifestWhere(
    (item) =>
      item.category === "backgrounds" &&
      item.source === "theme" &&
      item.filename.startsWith(`${slot}-`),
  )

  // Transcode every upload to WebP so served theme assets are WebP-only.
  const webp = await toWebp(buffer)
  const filename = `${slot}-${Date.now()}.webp`
  fs.writeFileSync(mediaFilePath("backgrounds", filename), webp)

  upsertMediaMeta(
    createMediaMeta({
      filename,
      category: "backgrounds",
      size: webp.byteLength,
      type: "image",
      source: "theme",
    }),
  )

  return `/media/backgrounds/${filename}`
}

// Persist an uploaded sound (data URL) for a SOUND_SLOT and return its public
// "/media/sounds/<file>" path (served by nginx from the config volume). Unlike
// saveBackgroundImage (which transcodes to WebP), audio bytes are written AS-IS
// — only the container extension is derived from the MIME (mp3/wav/ogg).
export const saveSoundFile = async (
  slot: SoundSlot,
  dataUrl: string,
): Promise<string> => {
  if (!SOUND_SLOTS.includes(slot)) {
    throw new Error("errors:theme.invalidSlot")
  }

  const { mime, buffer } = decodeDataUrl(
    dataUrl,
    MEDIA_AUDIO_MIME,
    "errors:theme.invalidAudio",
  )

  // 4 MB hard cap
  if (buffer.byteLength > 4 * 1024 * 1024) {
    throw new Error("errors:theme.audioTooLarge")
  }

  ensureMediaDirs()
  const soundsDir = getPath(`${MEDIA_ROOT}/sounds`)
  ensureDir(soundsDir)

  // Remove previous files for this slot so the folder doesn't grow unbounded.
  for (const file of fs.readdirSync(soundsDir)) {
    if (file.startsWith(`${slot}-`)) {
      fs.unlinkSync(resolve(soundsDir, file))
    }
  }
  removeManifestWhere(
    (item) =>
      item.category === "audio" &&
      item.source === "theme" &&
      item.filename.startsWith(`${slot}-`),
  )

  // Audio is NOT transcoded: write the decoded bytes verbatim, pick the
  // container ext from the MIME (.mp3/.wav/.ogg). Compute the timestamp ONCE so
  // the filename and the manifest id can never drift apart.
  const stamp = Date.now()
  const filename = `${slot}-${stamp}${extensionForMime(mime)}`
  fs.writeFileSync(resolve(soundsDir, filename), buffer)

  // Track in the manifest like backgrounds do, reusing createMediaMeta for the
  // id/uploadedAt fields. Files live under media/sounds/; the manifest
  // `category` is the closest valid MediaCategory ("audio"), so we override the
  // helper's derived `url` to point at the real /media/sounds/<file> location.
  upsertMediaMeta({
    ...createMediaMeta({
      filename,
      category: "audio",
      size: buffer.byteLength,
      type: "audio",
      source: "theme",
    }),
    url: `/media/sounds/${filename}`,
  })

  return `/media/sounds/${filename}`
}

// ---- Solo-play leaderboard (config/solo-results/:quizzId.json) ------------
// Each file is a JSON array of SoloScoreEntry objects (playerName, score,
// answeredAt). Reads are tolerant of missing / corrupt files (returns []).
// Writes are safe read-modify-write with ensureDir so a fresh config volume
// never errors on the first submission.

export interface SoloScoreEntry {
  playerName: string
  score: number
  answeredAt: string
}

export const getSoloResults = (id: string): SoloScoreEntry[] => {
  assertSafeId(id)

  const filePath = getPath(`solo-results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return []
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((item): SoloScoreEntry[] => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as Record<string, unknown>).playerName !== "string" ||
        typeof (item as Record<string, unknown>).score !== "number" ||
        typeof (item as Record<string, unknown>).answeredAt !== "string"
      ) {
        return []
      }

      return [item as SoloScoreEntry]
    })
  } catch {
    return []
  }
}

// Bound unbounded per-quiz solo-results growth: keep only the most recent entries
const SOLO_RESULTS_MAX_ENTRIES = 1000

export const appendSoloResult = (id: string, entry: SoloScoreEntry): void => {
  assertSafeId(id)

  const dir = getPath("solo-results")
  ensureDir(dir)

  const existing = getSoloResults(id)
  existing.push(entry)

  const capped =
    existing.length > SOLO_RESULTS_MAX_ENTRIES
      ? existing.slice(-SOLO_RESULTS_MAX_ENTRIES)
      : existing

  fs.writeFileSync(
    getPath(`solo-results/${id}.json`),
    JSON.stringify(capped, null, 2),
  )
}
