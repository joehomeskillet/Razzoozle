import type { CatalogEntry as CommonCatalogEntry } from "@razzoozle/common/types/catalog"

export type CatalogModalMode = "add" | "edit"

// Local extension of CatalogEntry to include labelIds (received from server)
export interface CatalogEntry extends CommonCatalogEntry {
  labelIds?: number[]
}

export interface CatalogQuestionFormProps {
  mode: CatalogModalMode
  editingEntry: CatalogEntry | null
  tagsValue: string
  onTagsChange: (value: string) => void
  onClose: () => void
  onSaveStart: (mode: CatalogModalMode) => void
  selectedLabelIds?: number[]
  onLabelIdsChange?: (ids: number[]) => void
}

export interface CatalogQuestionModalProps {
  open: boolean
  mode: CatalogModalMode
  editingEntry: CatalogEntry | null
  onClose: () => void
  onSaveStart: (mode: CatalogModalMode) => void
}
