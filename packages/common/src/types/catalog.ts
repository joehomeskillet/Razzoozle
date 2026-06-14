import type { CatalogSource } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"

// A reusable question stored in the catalog (question bank). `question` is a
// fully-validated Question, so an entry can be inserted into a quiz as-is.
export interface CatalogEntry {
  id: string
  question: Question
  tags?: string[]
  source?: CatalogSource
  addedAt: string
}

// Lightweight list shape for the picker/management grid (no full question body
// beyond the prompt text + type, so the LIST payload stays small).
export interface CatalogMeta {
  id: string
  question: string
  type?: Question["type"]
  tags?: string[]
  source?: CatalogSource
  addedAt: string
}
