// ---- Submissions (public question-submission moderation queue) ------------
// Records are validated through submissionRecordValidator on every read; every
// path interpolation is guarded by assertSafeId so a user-supplied id cannot
// escape the submissions dir.
// Extracted verbatim from services/config.ts (SRP split).
import type {
  Submission,
  SubmissionMeta,
} from "@razzoozle/common/types/submission"
import { submissionRecordValidator } from "@razzoozle/common/validators/submission"
import {
  deleteSubmissionPg,
  upsertSubmissionPg,
} from "@razzoozle/socket/services/storage/submissions-pg"
import fs from "fs"
import { assertSafeId, getPath } from "@razzoozle/socket/services/config/shared"

// Cached count of submissions still awaiting moderation. Initialized lazily
// (one-time O(N) scan) and then kept in sync incrementally by save/update/delete
// so the hot public SUBMIT path no longer re-scans the whole submissions dir.
let pendingCount: number | null = null

// DATABASE_MODE=dual/pg/pg-only: files stay the sync read source of truth for
// the submission functions below (they can't become async without breaking their
// call sites), but writes are additionally mirrored to Postgres via services/storage/submissions-pg.ts
// (fire-and-forget, errors logged not thrown — file write remains authoritative and never blocks on the DB).
const isDbBackedSubmissionMode = (): boolean => {
  const mode = process.env.DATABASE_MODE?.toLowerCase()
  return mode === "dual" || mode === "pg" || mode === "pg-only"
}

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

  // Fire-and-forget pg mirror write
  if (isDbBackedSubmissionMode()) {
    upsertSubmissionPg(data).catch((error) => console.error("submissions-pg mirror failed", error))
  }

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

  // Fire-and-forget pg mirror write
  if (isDbBackedSubmissionMode()) {
    upsertSubmissionPg(merged).catch((error) => console.error("submissions-pg mirror failed", error))
  }
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

  // Fire-and-forget pg mirror delete
  if (isDbBackedSubmissionMode()) {
    deleteSubmissionPg(id).catch((error) => console.error("submissions-pg mirror failed", error))
  }
}
