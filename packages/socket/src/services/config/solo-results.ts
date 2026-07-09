// Extracted verbatim from services/config.ts (SRP split).
import fs from "fs"
import { assertSafeId, ensureDir, getPath } from "@razzoozle/socket/services/config/shared"
import { insertSoloResultPg } from "@razzoozle/socket/services/storage/solo-results-pg"

// ---- Solo-play leaderboard (config/solo-results/:quizzId.json) ------------
// Each file is a JSON array of SoloScoreEntry objects (playerName, score,
// answeredAt). Reads are tolerant of missing / corrupt files (returns []).
// Writes are safe read-modify-write with ensureDir so a fresh config volume
// never errors on the first submission.

export interface SoloScoreEntry {
  playerName: string
  score: number
  answeredAt: string
  assignmentId?: string
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

// Guard: only mirror to PG if DATABASE_MODE is dual/pg/pg-only
const isDbBackedSoloMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
}

export const appendSoloResult = (id: string, entry: SoloScoreEntry, assignmentId?: string): Promise<void> => {
  assertSafeId(id)

  const dir = getPath("solo-results")
  ensureDir(dir)

  const existing = getSoloResults(id)
  if (assignmentId) {
    entry.assignmentId = assignmentId
  }
  existing.push(entry)

  const capped =
    existing.length > SOLO_RESULTS_MAX_ENTRIES
      ? existing.slice(-SOLO_RESULTS_MAX_ENTRIES)
      : existing

  fs.writeFileSync(
    getPath(`solo-results/${id}.json`),
    JSON.stringify(capped, null, 2),
  )

  // PG mirror write. Callers that await this get read-your-write consistency
  // against the PG-native read path; callers that don't await keep today's
  // fire-and-forget behavior (the .catch below means the promise never
  // rejects, so awaiting it is always safe).
  if (isDbBackedSoloMode()) {
    return insertSoloResultPg(id, entry).catch((error) =>
      console.error("solo-results-pg mirror failed", error),
    )
  }
  return Promise.resolve()
}
