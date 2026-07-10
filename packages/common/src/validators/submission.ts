import { SUBMISSION_CATEGORIES } from "@razzoozle/common/constants"
import { z } from "zod"
import { usernameValidator } from "./auth"
import { questionValidator } from "./quizz"

// Used on both socket server (input guard) and web client (pre-submit validation)
export const submissionValidator = z.object({
  submittedBy: usernameValidator,
  question: questionValidator,
  // WP-17 — INPUT: enforce a known category, but optional (old clients send none).
  category: z.enum(SUBMISSION_CATEGORIES).optional(),
})

// Server-side full-record validator (used when reading back from disk)
export const submissionRecordValidator = submissionValidator.extend({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  submittedAt: z.string().datetime(),
  status: z.enum(["pending", "approved", "rejected"]),
  // WP-17 — ON DISK: drop-safe. category is a free string here (NOT z.enum) so a
  // future enum rename never silently drops a persisted record on read.
  rejectionReason: z.string().max(500).optional(),
  category: z.string().max(40).optional(),
})

export type SubmissionRecord = z.infer<typeof submissionRecordValidator>
