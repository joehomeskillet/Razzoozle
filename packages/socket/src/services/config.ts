import {
  AI_PROVIDER_OFF,
  AI_TEXT_PROVIDER_PRESETS,
  AVATAR_MAX_BYTES,
  DEFAULT_MANAGER_PASSWORD,
  EXAMPLE_QUIZZ,
  MEDIA_CATEGORIES,
  THEME_REVISIONS_MAX,
  THEME_SLOTS,
  type MediaCategory,
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
import { hasKey } from "@razzoozle/socket/services/ai-secrets"
import { gameResultValidator } from "@razzoozle/socket/services/validators"
import { toWebp, webpDimensions } from "@razzoozle/socket/services/webp"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import { submissionRecordValidator } from "@razzoozle/common/validators/submission"
import { z } from "zod"
import type {
  Submission,
  SubmissionMeta,
} from "@razzoozle/common/types/submission"
import type { MediaMeta } from "@razzoozle/common/types/media"
import fs from "fs"
import { basename, extname, relative, resolve } from "path"
import { nanoid } from "nanoid"

export type { GameConfig } from "@razzoozle/common/validators/game-config"

const inContainerPath = process.env.CONFIG_PATH

const getPath = (path = "") =>
  inContainerPath
    ? resolve(inContainerPath, path)
    : resolve(process.cwd(), "../../config", path)

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
const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/u

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

  ensureDir(getPath(`${MEDIA_ROOT}/avatars/generic`))
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
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
    z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
    z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
    z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "errors:theme.invalidColor"),
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

  return socketResult.data
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
          console.warn(`Skipping invalid brand preset "${file}":`, parsed.error.issues)

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

export const updateGameConfig = (patch: { teamMode?: boolean }): GameConfig => {
  const current = getGameConfig()
  const merged = { ...current, ...patch }
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
          console.warn(`Invalid submission file "${file}":`, result.error.issues)

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
  getSubmissions().map(({ id, submittedBy, submittedAt, status, question }) => ({
    id,
    submittedBy,
    submittedAt,
    status,
    question: question.question,
  }))

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
        (candidate.type !== "image" && candidate.type !== "audio") ||
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
        (candidate.height !== undefined &&
          typeof candidate.height !== "number")
      ) {
        return []
      }

      // Strip any dims off the carried row, then re-attach only when BOTH are
      // numbers — so a pre-existing row keeps loading and a stray single dim never
      // leaks back out on a re-write (matches existing cast-through style here).
      const { width: _w, height: _h, ...rest } = candidate
      const base = rest as unknown as MediaMeta

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

  if (rel.startsWith("..") || rel === "" || resolve(mediaRoot, rel) !== target) {
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
  type: "image" | "audio"
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
    /^(?:image|audio)\//u,
    "errors:media.invalidDataUrl",
  )
  const inferredType = mime.startsWith("audio/") ? "audio" : "image"
  const resolvedCategory = category ?? (inferredType === "audio" ? "audio" : "questions")

  if (!isMediaCategory(resolvedCategory)) {
    throw new Error("errors:media.invalidCategory")
  }

  if (inferredType === "image" && !MEDIA_IMAGE_MIME.test(mime)) {
    throw new Error("errors:media.invalidDataUrl")
  }

  if (inferredType === "audio" && !MEDIA_AUDIO_MIME.test(mime)) {
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

  fs.writeFileSync(
    getPath("theme/theme.json"),
    JSON.stringify(theme, null, 2),
  )

  return theme
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

export const appendSoloResult = (
  id: string,
  entry: SoloScoreEntry,
): void => {
  assertSafeId(id)

  const dir = getPath("solo-results")
  ensureDir(dir)

  const existing = getSoloResults(id)
  existing.push(entry)

  fs.writeFileSync(
    getPath(`solo-results/${id}.json`),
    JSON.stringify(existing, null, 2),
  )
}
