import type { CatalogEntry } from "@razzoozle/common/types/catalog"

export type CatalogModalMode = "add" | "edit"

export interface CatalogQuestionFormProps {
  mode: CatalogModalMode
  editingEntry: CatalogEntry | null
  tagsValue: string
  onTagsChange: (value: string) => void
  onClose: () => void
  onSaveStart: (mode: CatalogModalMode) => void
}

export interface CatalogQuestionModalProps {
  open: boolean
  mode: CatalogModalMode
  editingEntry: CatalogEntry | null
  onClose: () => void
  onSaveStart: (mode: CatalogModalMode) => void
}
