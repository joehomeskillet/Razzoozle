import type { CatalogSource } from "@razzoozle/common/constants"
import type { Question } from "@razzoozle/common/types/game"

// A reusable question stored in the catalog (question bank). `question` is a
// fully-validated Question, so an entry can be inserted into a quiz as-is.
export interface CatalogEntry {
  id: string
  question: Question
  tags?: string[]
  source?: CatalogSource
  addedAt: string
  // Assigned label ids (klassenEnabled only) — parity with QuizzMeta.labelIds.
  labelIds?: number[]
}

// Lightweight list shape for the picker/management grid (no full question body
// beyond the prompt text + type, so the LIST payload stays small).
