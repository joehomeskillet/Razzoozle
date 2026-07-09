// Quizz CRUD (config/quizz/:id.json) — includes the mtime-validated in-module
// cache and the DATABASE_MODE quizz-pg mirror-writes (WP-1a). Extracted
// verbatim from services/config.ts (SRP split).
import type { QuizzMeta, QuizzWithId } from "@razzoozle/common/types/game"
import { quizzValidator } from "@razzoozle/common/validators/quizz"
import {
  deleteQuizzPg,
  setQuizzArchivedPg,
  updateQuizzPg,
} from "@razzoozle/socket/services/storage/quizz-pg"
import { normalizeFilename } from "@razzoozle/socket/utils/game"
import fs from "fs"
import { assertSafeId, getPath } from "@razzoozle/socket/services/config/shared"

// In-module cache for quizz files with mtime validation
interface QuizzCache {
  data: QuizzWithId
  mtime: number
}
const quizzCache = new Map<string, QuizzCache>()

// DATABASE_MODE=dual/pg/pg-only: files stay the sync read source of truth for
// the 6 quizz functions below (they can't become async without breaking their
// ~20 existing sync call sites), but writes are additionally mirrored to
// Postgres via services/storage/quizz-pg.ts (fire-and-forget, errors logged
// not thrown — file write remains authoritative and never blocks on the DB).
const isDbBackedQuizzMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
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

  const stat = fs.statSync(filePath)
  // dual/pg: skip the in-memory cache so a DB-mirrored write never leaves a
  // stale cached read behind (file read below is always fresh either way).
  const cached = isDbBackedQuizzMode() ? undefined : quizzCache.get(filePath)

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.data
  }

  const data = fs.readFileSync(filePath, "utf-8")
  const result = quizzValidator.safeParse(JSON.parse(data))

  if (!result.success) {
    throw new Error(`Invalid quizz "${id}"`)
  }

  const parsed = { id, ...result.data }
  quizzCache.set(filePath, { data: parsed, mtime: stat.mtimeMs })
  return parsed
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

// NOTE: kept a plain (non-async) function so validation/not-found errors still
// throw SYNCHRONOUSLY (existing callers/tests rely on `expect(() =>
// updateQuizz(...)).toThrow(...)`); only the trailing PG-mirror + resolved id
// are wrapped in a Promise so same-request read-backs (emitConfig ->
// readQuizzMeta) can await it (the .catch below means it never rejects).
export const updateQuizz = (id: string, data: unknown): Promise<{ id: string }> => {
  assertSafeId(id)

  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  const oldPath = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  quizzCache.delete(oldPath)
  fs.writeFileSync(oldPath, JSON.stringify(result.data, null, 2))

  if (isDbBackedQuizzMode()) {
    return updateQuizzPg(id, result.data)
      .catch((error) => console.error(`quizz-pg mirror write failed for "${id}":`, error))
      .then(() => ({ id }))
  }

  return Promise.resolve({ id })
}

// Archive toggle: flip the `archived` flag on a quizz without deleting it.
// Reads the on-disk file through quizzValidator (so the rest of the record is
// re-validated), sets the flag, and writes it back. assertSafeId guards the path.
export const setQuizzArchived = (id: string, archived: boolean): Promise<void> => {
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

  if (isDbBackedQuizzMode()) {
    return setQuizzArchivedPg(id, archived).catch((error) =>
      console.error(`quizz-pg mirror archive failed for "${id}":`, error),
    )
  }
  return Promise.resolve()
}

export const deleteQuizz = (id: string): Promise<void> => {
  assertSafeId(id)

  const filePath = getPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  quizzCache.delete(filePath)
  fs.unlinkSync(filePath)

  if (isDbBackedQuizzMode()) {
    return deleteQuizzPg(id).catch((error) =>
      console.error(`quizz-pg mirror delete failed for "${id}":`, error),
    )
  }
  return Promise.resolve()
}

export const saveQuizz = (data: unknown): Promise<{ id: string }> => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  const id = normalizeFilename(result.data.subject)
  const filePath = getPath(`quizz/${id}.json`)

  fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))

  if (isDbBackedQuizzMode()) {
    return updateQuizzPg(id, result.data)
      .catch((error) => console.error(`quizz-pg mirror write failed for "${id}":`, error))
      .then(() => ({ id }))
  }

  return Promise.resolve({ id })
}
