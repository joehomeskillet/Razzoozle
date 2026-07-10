import { z } from "zod"
import { SUBMISSION_CATEGORIES } from "@razzoozle/common/constants"

// A pending question submission (public user via /submit). No auth gate.
export const submissionValidator = z.object({
  subject: z.string().min(1).max(200),
  answers: z.array(z.string().min(1).max(200)).min(2).max(4),
  correct: z.number().int().min(0),
  category: z.enum(SUBMISSION_CATEGORIES),
  language: z.string().min(2).max(8).optional(),
  sources: z.array(z.string().url()).optional(),
})

export type Submission = z.infer<typeof submissionValidator>

// Stored submission record (persisted in config/submissions.json or DB).
// Extends the client submission with approval metadata + timestamps.
export const submissionRecordValidator = submissionValidator.extend({
  id: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  approvedAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
  createdAt: z.string().datetime(),
})

export type SubmissionRecord = z.infer<typeof submissionRecordValidator>
