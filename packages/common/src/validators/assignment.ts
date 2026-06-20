import { z } from "zod"

// Welle-2 assignment contract: quiz allocation with optional identifiers,
// deadline, and attempt caps. Used for distributing quizzes to cohorts with
// pseudonymous opt-in tracking.
export const assignmentValidator = z.object({
  id: z.string(),
  quizzId: z.string(),
  createdAt: z.number(), // epoch ms
  deadline: z.number().nullable().optional(), // epoch ms, null = no deadline
  maxAttempts: z.number().int().min(1).nullable().optional(), // null = unlimited
  requireIdentifier: z.boolean().optional(), // default false; true → guest must provide pseudonym
  showCorrectAnswers: z.boolean().optional(), // default false; true → reveal answers after attempt
})

export type Assignment = z.infer<typeof assignmentValidator>
