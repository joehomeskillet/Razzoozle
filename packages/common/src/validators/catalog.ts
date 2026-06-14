import { CATALOG_SOURCES } from "@razzia/common/constants"
import { questionValidator } from "@razzia/common/validators/quizz"
import { z } from "zod"

// A catalog entry wraps a full (validated) question with light metadata. The
// question goes through the SAME questionValidator superRefine as quizzes, so a
// catalog question can be dropped into a quiz without re-checking.
export const catalogEntryValidator = z.object({
  // Server-generated (slug of question text); optional on the wire for ADD.
  id: z.string().optional(),
  question: questionValidator,
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  source: z.enum(CATALOG_SOURCES).optional(),
  // ISO timestamp; server stamps it on save.
  addedAt: z.string().optional(),
})

// ADD payload (id/addedAt are server-assigned, ignored if sent).
export const catalogAddValidator = z.object({
  question: questionValidator,
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  source: z.enum(CATALOG_SOURCES).optional(),
})

// UPDATE payload — full question (questionValidator is a ZodEffects, no .partial()).
export const catalogUpdateValidator = z.object({
  id: z.string(),
  question: questionValidator,
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
})
