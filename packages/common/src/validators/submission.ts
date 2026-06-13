import { z } from "zod"
import { usernameValidator } from "./auth"
import { questionValidator } from "./quizz"

// Used on both socket server (input guard) and web client (pre-submit validation)
export const submissionValidator = z.object({
  submittedBy: usernameValidator,
  question: questionValidator,
})

export type SubmissionInput = z.infer<typeof submissionValidator>

// Server-side full-record validator (used when reading back from disk)
export const submissionRecordValidator = submissionValidator.extend({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  submittedAt: z.string().datetime(),
  status: z.enum(["pending", "approved", "rejected"]),
})
