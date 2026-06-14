// File-backed authoring + read layer for the MCP server. This deliberately
// mirrors packages/socket/src/services/config.ts (same dir layout, same
// validators from @razzia/common, same id/slug rules) so a quizz written here
// is byte-compatible with what the live socket server reads from the mounted
// config volume. We re-implement (not import) the socket-only helpers
// `normalizeFilename` / `assertSafeId` because they live in @razzia/socket,
// which we do NOT bundle — the rules below are identical to those modules.
import { gameConfigValidator } from "@razzia/common/validators/game-config"
import type { GameConfig } from "@razzia/common/validators/game-config"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { themeValidator } from "@razzia/common/validators/theme"
import { submissionRecordValidator } from "@razzia/common/validators/submission"
import type {
  GameResult,
  GameResultMeta,
  QuizzMeta,
  QuizzWithId,
} from "@razzia/common/types/game"
import type {
  Submission,
  SubmissionMeta,
} from "@razzia/common/types/submission"
import type { Theme } from "@razzia/common/types/theme"
import { DEFAULT_THEME } from "@razzia/common/types/theme"
import fs from "node:fs"
import { resolve } from "node:path"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

// Local mirror of the socket-only gameResultValidator (which lives in
// @razzia/socket and which we do not bundle). Just enough to validate result
// files on read for `list_results` / `get_result` — questions are passed
// through opaquely. Identical field semantics to the GameResult interface in
// @razzia/common/types/game.
const gameResultValidator = z.object({
  id: z.string(),
  subject: z.string(),
  date: z.string(),
  players: z.array(
    z.object({
      username: z.string(),
      points: z.number(),
      rank: z.number(),
    }),
  ),
  questions: z.array(z.unknown()),
})

// Root of the live config volume. Default matches the host bind-mount that the
// `razzia` container reads, so writes here update the live app immediately.
const CONFIG_DIR =
  process.env.RAHOOT_CONFIG ?? "/nvmetank1/projects/rahoot/config"

const getPath = (p = ""): string => resolve(CONFIG_DIR, p)

// Mirror of @razzia/socket config: ids must be safe slugs/uuids so a caller can
// never escape the quizz/results/submissions dir via path traversal.
const SAFE_ID = /^[A-Za-z0-9_-]+$/
export const assertSafeId = (id: string): void => {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new Error(`Invalid id: ${JSON.stringify(id)}`)
  }
}

// Mirror of @razzia/socket/utils/game normalizeFilename: a <=10-char slug of the
// subject + a short unique suffix. We use a uuid stem (instead of nanoid) for
// the suffix to avoid pulling a second id lib into the bundle; the output is
// still SAFE_ID-conformant, which is all the app requires.
export const normalizeFilename = (subject: string): string => {
  const slug = subject
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .slice(0, 10)

  const shortId = uuidv4().replace(/-/gu, "").slice(0, 8)

  return `${slug}-${shortId}`
}

export const getConfigDir = (): string => CONFIG_DIR

// ── game.json (manager password lives here) ────────────────────────────────

export const getGameConfig = (): GameConfig => {
  const file = getPath("game.json")

  if (!fs.existsSync(file)) {
    throw new Error(`game.json not found at ${file}`)
  }

  const parsed = gameConfigValidator.safeParse(
    JSON.parse(fs.readFileSync(file, "utf-8")),
  )

  // Defaults back-fill a bare `{ managerPassword }`; on a malformed file we
  // surface the error rather than silently using "PASSWORD" (which the server
  // refuses to auth with anyway).
  if (!parsed.success) {
    throw new Error(`Invalid game.json: ${parsed.error.issues[0].message}`)
  }

  return parsed.data
}

// Read the manager password without ever returning it through a tool result.
export const getManagerPassword = (): string => getGameConfig().managerPassword

// ── Quizzes ─────────────────────────────────────────────────────────────────

const quizzDir = (): string => getPath("quizz")

export const getQuizzMeta = (): QuizzMeta[] =>
  getAllQuizzes().map(({ id, subject }) => ({ id, subject }))

export const getAllQuizzes = (): QuizzWithId[] => {
  const dir = quizzDir()

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((file) => {
      try {
        const id = file.replace(/\.json$/u, "")
        const parsed = quizzValidator.safeParse(
          JSON.parse(fs.readFileSync(getPath(`quizz/${file}`), "utf-8")),
        )

        return parsed.success ? [{ id, ...parsed.data }] : []
      } catch {
        return []
      }
    })
}

export const getQuizzById = (id: string): QuizzWithId => {
  assertSafeId(id)

  const file = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(file)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const parsed = quizzValidator.safeParse(
    JSON.parse(fs.readFileSync(file, "utf-8")),
  )

  if (!parsed.success) {
    throw new Error(`Invalid quizz "${id}": ${parsed.error.issues[0].message}`)
  }

  return { id, ...parsed.data }
}

// Validate `data` through quizzValidator, then write a NEW quizz file (id from
// the subject slug). Returns the generated id. Mirrors socket saveQuizz.
export const saveQuizz = (data: unknown): { id: string } => {
  const parsed = quizzValidator.safeParse(data)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const id = normalizeFilename(parsed.data.subject)
  assertSafeId(id)

  const dir = quizzDir()

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(
    getPath(`quizz/${id}.json`),
    JSON.stringify(parsed.data, null, 2),
  )

  return { id }
}

// Validate + overwrite an EXISTING quizz (id stays the same). Mirrors socket
// updateQuizz.
export const updateQuizz = (id: string, data: unknown): { id: string } => {
  assertSafeId(id)

  const file = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(file)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const parsed = quizzValidator.safeParse(data)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2))

  return { id }
}

export const deleteQuizz = (id: string): void => {
  assertSafeId(id)

  const file = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(file)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  fs.unlinkSync(file)
}

// ── Results ─────────────────────────────────────────────────────────────────

export const getResultsMeta = (): GameResultMeta[] => {
  const dir = getPath("results")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((file) => {
      try {
        const parsed = gameResultValidator.safeParse(
          JSON.parse(fs.readFileSync(getPath(`results/${file}`), "utf-8")),
        )

        if (!parsed.success) {
          return []
        }

        return [
          {
            id: parsed.data.id,
            subject: parsed.data.subject,
            date: parsed.data.date,
            playerCount: parsed.data.players.length,
          },
        ]
      } catch {
        return []
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export const getResultById = (id: string): GameResult => {
  assertSafeId(id)

  const file = getPath(`results/${id}.json`)

  if (!fs.existsSync(file)) {
    throw new Error(`Result "${id}" not found`)
  }

  const parsed = gameResultValidator.safeParse(
    JSON.parse(fs.readFileSync(file, "utf-8")),
  )

  if (!parsed.success) {
    throw new Error(`Result "${id}" not found (invalid file)`)
  }

  return parsed.data as GameResult
}

// ── Submissions (public question-submission moderation queue, feature #5) ────

export const getSubmissions = (): Submission[] => {
  const dir = getPath("submissions")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((file) => {
      try {
        const parsed = submissionRecordValidator.safeParse(
          JSON.parse(fs.readFileSync(getPath(`submissions/${file}`), "utf-8")),
        )

        return parsed.success ? [parsed.data as Submission] : []
      } catch {
        return []
      }
    })
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

  const file = getPath(`submissions/${id}.json`)

  if (!fs.existsSync(file)) {
    return null
  }

  try {
    const parsed = submissionRecordValidator.safeParse(
      JSON.parse(fs.readFileSync(file, "utf-8")),
    )

    return parsed.success ? (parsed.data as Submission) : null
  } catch {
    return null
  }
}

const saveSubmission = (data: Submission): void => {
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

// Approve a pending submission by appending its question to an existing quizz
// and flipping its status — the exact same effect as the socket
// APPROVE_SUBMISSION handler, done file-side so it works without a live game.
export const approveSubmission = (
  id: string,
  quizzId: string,
): { quizzId: string } => {
  assertSafeId(id)
  assertSafeId(quizzId)

  const submission = getSubmissionById(id)

  if (!submission) {
    throw new Error(`Submission "${id}" not found`)
  }

  const quizz = getQuizzById(quizzId)

  updateQuizz(quizzId, {
    subject: quizz.subject,
    questions: [
      ...quizz.questions,
      { ...submission.question, submittedBy: submission.submittedBy },
    ],
  })

  saveSubmission({ ...submission, status: "approved" })

  return { quizzId }
}

export const rejectSubmission = (id: string): void => {
  assertSafeId(id)

  const submission = getSubmissionById(id)

  if (!submission) {
    throw new Error(`Submission "${id}" not found`)
  }

  saveSubmission({ ...submission, status: "rejected" })
}

// ── Theme ─────────────────────────────────────────────────────────────────

export const getTheme = (): Theme => {
  const file = getPath("theme/theme.json")

  if (!fs.existsSync(file)) {
    return DEFAULT_THEME
  }

  try {
    const parsed = themeValidator.safeParse(
      JSON.parse(fs.readFileSync(file, "utf-8")),
    )

    return parsed.success ? parsed.data : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export const setTheme = (data: unknown): Theme => {
  const parsed = themeValidator.safeParse(data)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const dir = getPath("theme")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(
    getPath("theme/theme.json"),
    JSON.stringify(parsed.data, null, 2),
  )

  return parsed.data
}

// ── AI-generated media persistence ──────────────────────────────────────────

// Persist WebP bytes into config/media under a server-generated name and return
// its public "/media/<file>" path (served by nginx from the config volume,
// mirroring saveGeneratedImageBytes in @razzia/socket).
export const saveGeneratedImageBytes = (
  buffer: Buffer,
  destName: string,
): string => {
  assertSafeId(destName.replace(/\.[a-z0-9]+$/u, ""))

  const dir = getPath("media")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(getPath(`media/${destName}`), buffer)

  return `/media/${destName}`
}
