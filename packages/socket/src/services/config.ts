import {
  DEFAULT_MANAGER_PASSWORD,
  EXAMPLE_QUIZZ,
  THEME_SLOTS,
  type ThemeSlot,
} from "@razzia/common/constants"
import type {
  GameResult,
  GameResultMeta,
  QuizzWithId,
} from "@razzia/common/types/game"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  type GameConfig,
  gameConfigValidator,
} from "@razzia/common/validators/game-config"
import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"
import { themeValidator } from "@razzia/common/validators/theme"
import { gameResultValidator } from "@razzia/socket/services/validators"
import { normalizeFilename } from "@razzia/socket/utils/game"
import { submissionRecordValidator } from "@razzia/common/validators/submission"
import type {
  Submission,
  SubmissionMeta,
} from "@razzia/common/types/submission"
import fs from "fs"
import { resolve } from "path"

export type { GameConfig } from "@razzia/common/validators/game-config"

const inContainerPath = process.env.CONFIG_PATH

const getPath = (path = "") =>
  inContainerPath
    ? resolve(inContainerPath, path)
    : resolve(process.cwd(), "../../config", path)

// Quizz/result ids are server-generated uuids / safe slugs. Reject anything that
// could escape the quizz/results dir (path traversal) before using it in a path.
const SAFE_ID = /^[A-Za-z0-9_-]+$/
export const assertSafeId = (id: string): void => {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new Error("Invalid id")
  }
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

  // Submission moderation queue + AI-generated media store. Mirror the quizz
  // dir bootstrap so both folders exist on a fresh config volume.
  const submissionsDir = getPath("submissions")

  if (!fs.existsSync(submissionsDir)) {
    fs.mkdirSync(submissionsDir, { recursive: true })
  }

  const mediaDir = getPath("media")

  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true })
  }
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

export const getQuizzMeta = () =>
  getQuizz().map(({ id, subject }) => ({ id, subject }))

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

  // Force the id back to the validated one so a Partial can never repoint it.
  saveSubmission({ ...existing, ...data, id })
}

export const deleteSubmission = (id: string): void => {
  assertSafeId(id)

  const filePath = getPath(`submissions/${id}.json`)

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

// Copy a ComfyUI-produced PNG into config/media under a server-generated name
// and return its public "/media/<file>" path (served by nginx from the config
// volume, mirroring saveBackgroundImage's /theme/ mechanism). `destName` is
// server-generated (gen-<nanoid>.png) and re-checked with assertSafeId stem.
export const saveGeneratedImage = (
  srcFilename: string,
  destName: string,
): string => {
  // destName is server-generated; guard its stem so it can never escape /media.
  assertSafeId(destName.replace(/\.png$/u, ""))

  const srcDir =
    process.env.COMFYUI_OUTPUT_DIR ?? "/nvmetank1/AI/comfyui/output"
  const srcPath = resolve(srcDir, srcFilename)

  // Keep the copy inside the source dir — defend against a maliciously crafted
  // history filename trying to read outside the ComfyUI output directory.
  if (!srcPath.startsWith(resolve(srcDir))) {
    throw new Error("errors:submission.imageGenFailed")
  }

  const mediaDir = getPath("media")

  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true })
  }

  fs.copyFileSync(srcPath, getPath(`media/${destName}`))

  return `/media/${destName}`
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
// THEME_SLOTS / ThemeSlot are imported from @razzia/common (single source of
// truth shared with the web client). The runtime guard below is unchanged.

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export const getTheme = (): Theme => {
  const filePath = getPath("theme/theme.json")

  if (!fs.existsSync(filePath)) {
    return DEFAULT_THEME
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    const result = themeValidator.safeParse(data)

    if (!result.success) {
      console.warn("Invalid theme.json, using default:", result.error.issues)

      return DEFAULT_THEME
    }

    return result.data
  } catch (error) {
    console.error("Failed to read theme:", error)

    return DEFAULT_THEME
  }
}

export const setTheme = (data: unknown): Theme => {
  const result = themeValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  const themeDir = getPath("theme")

  if (!fs.existsSync(themeDir)) {
    fs.mkdirSync(themeDir)
  }

  fs.writeFileSync(
    getPath("theme/theme.json"),
    JSON.stringify(result.data, null, 2),
  )

  return result.data
}

// Persist an uploaded background image (data URL) for a slot and return its
// public "/theme/<file>" path (served by nginx from the config volume).
export const saveBackgroundImage = (
  slot: ThemeSlot,
  dataUrl: string,
): string => {
  if (!THEME_SLOTS.includes(slot)) {
    throw new Error("errors:theme.invalidSlot")
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl)

  if (!match) {
    throw new Error("errors:theme.invalidImage")
  }

  const mime = match[1]
  const ext = MIME_EXT[mime] ?? "png"
  const buffer = Buffer.from(match[2], "base64")

  // 8 MB hard cap
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("errors:theme.imageTooLarge")
  }

  const themeDir = getPath("theme")

  if (!fs.existsSync(themeDir)) {
    fs.mkdirSync(themeDir)
  }

  // Remove previous files for this slot so the folder doesn't grow unbounded.
  for (const file of fs.readdirSync(themeDir)) {
    if (file.startsWith(`${slot}-`)) {
      fs.unlinkSync(resolve(themeDir, file))
    }
  }

  const filename = `${slot}-${Date.now()}.${ext}`
  fs.writeFileSync(resolve(themeDir, filename), buffer)

  return `/theme/${filename}`
}
