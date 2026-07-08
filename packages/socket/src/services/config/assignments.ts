// Extracted verbatim from services/config.ts (SRP split).
import {
  assignmentValidator,
  type Assignment,
} from "@razzoozle/common/validators/assignment"
import { upsertAssignmentPg } from "@razzoozle/socket/services/storage/assignments-pg"
import fs from "fs"
import { assertSafeId, ensureDir, getPath } from "@razzoozle/socket/services/config/shared"

// ---- Assignments (config/assignments/:id.json) --------------------------------
// Each file is a JSON Assignment object (id, quizzId, createdAt, deadline?,
// maxAttempts?, requireIdentifier?, showCorrectAnswers?). Mirrors solo-results
// persistence: reads are tolerant of missing/corrupt files, writes use ensureDir.

// DATABASE_MODE=dual/pg/pg-only: files stay the sync read source of truth for
// the assignment functions below (they can't become async without breaking their
// call sites), but writes are additionally mirrored to Postgres via services/storage/assignments-pg.ts
// (fire-and-forget, errors logged not thrown — file write remains authoritative and never blocks on the DB).
const isDbBackedAssignmentMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
}

export const saveAssignment = (assignment: Assignment): void => {
  assertSafeId(assignment.id)

  const dir = getPath("assignments")
  ensureDir(dir)

  fs.writeFileSync(
    getPath(`assignments/${assignment.id}.json`),
    JSON.stringify(assignment, null, 2),
  )

  // Fire-and-forget pg mirror write
  if (isDbBackedAssignmentMode()) {
    upsertAssignmentPg(assignment).catch((error) =>
      console.error("assignments-pg mirror failed", error),
    )
  }
}

export const getAssignment = (id: string): Assignment | null => {
  assertSafeId(id)

  const filePath = getPath(`assignments/${id}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = assignmentValidator.safeParse(JSON.parse(raw))

    return result.success ? result.data : null
  } catch {
    return null
  }
}

export const listAssignments = (): Assignment[] => {
  const dir = getPath("assignments")

  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const raw = fs.readFileSync(getPath(`assignments/${file}`), "utf-8")
        const result = assignmentValidator.safeParse(JSON.parse(raw))

        return result.success ? [result.data] : []
      } catch {
        return []
      }
    })
}
