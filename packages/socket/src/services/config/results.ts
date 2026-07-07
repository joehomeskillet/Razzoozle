// Game results (config/results/:id.json). Extracted verbatim from
// services/config.ts (SRP split).
import type { GameResult, GameResultMeta } from "@razzoozle/common/types/game"
import { gameResultValidator } from "@razzoozle/socket/services/validators"
import { deleteResultPg, updateResultPg } from "@razzoozle/socket/services/storage/results-pg"
import fs from "fs"
import { assertSafeId, getPath } from "@razzoozle/socket/services/config/shared"

// DATABASE_MODE=dual/pg/pg-only: files stay the sync read source of truth for
// the result functions below (they can't become async without breaking their
// call sites), but writes are additionally mirrored to Postgres via
// services/storage/results-pg.ts (fire-and-forget, errors logged not thrown —
// file write remains authoritative and never blocks on the DB).
const isDbBackedResultsMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
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

    if (isDbBackedResultsMode()) {
      updateResultPg(data).catch((error) =>
        console.error(`results-pg mirror write failed for "${data.id}":`, error),
      )
    }
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

  if (isDbBackedResultsMode()) {
    deleteResultPg(id).catch((error) =>
      console.error(`results-pg mirror delete failed for "${id}":`, error),
    )
  }
}
