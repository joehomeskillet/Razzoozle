import type { QuizzWithId } from "@razzoozle/common/types/game"
import { QuizzEditorProvider } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { CatalogQuestionForm } from "./CatalogQuestionForm"
import type { CatalogQuestionModalProps } from "./types"

export const CatalogQuestionModal = ({
  open,
  mode,
  editingEntry,
  onClose,
  onSaveStart,
}: CatalogQuestionModalProps) => {
  const { t } = useTranslation()
  const [tagsValue, setTagsValue] = useState("")
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([])
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      setTagsValue((editingEntry?.tags ?? []).join(", "))
      setSelectedLabelIds((editingEntry?.labelIds ?? []))
    }
  }, [editingEntry, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) {
      return
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeButtonRef.current?.focus()

    return () => {
      previousFocusRef.current?.focus()
    }
  }, [open])

  const handleFocusTrap = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return
    }

    const dialog = dialogRef.current

    if (!dialog) {
      return
    }

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )

    if (focusable.length === 0) {
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault()
        last.focus()
      }

      return
    }

    if (active === last || !dialog.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) {
    return null
  }

  const initialData: QuizzWithId | undefined = editingEntry
    ? {
        id: editingEntry.id,
        subject: "catalog",
        questions: [editingEntry.question],
      }
    : undefined
  const providerKey =
    mode === "edit" && editingEntry ? `edit-${editingEntry.id}` : "add"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 sm:px-6 lg:px-8 py-3 sm:py-6 lg:py-8">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-question-modal-title"
        onKeyDown={handleFocusTrap}
        className="flex max-h-[88svh] min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface)] shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="catalog-question-modal-title"
              className="truncate text-lg font-semibold text-[var(--ink)]"
            >
              {mode === "edit"
                ? t("manager:catalog.edit")
                : t("manager:catalog.addManual")}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("common:cancel")}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <QuizzEditorProvider key={providerKey} initialData={initialData}>
          <CatalogQuestionForm
            mode={mode}
            editingEntry={editingEntry}
            tagsValue={tagsValue}
            onTagsChange={setTagsValue}
            onClose={onClose}
            onSaveStart={onSaveStart}
            selectedLabelIds={selectedLabelIds}
            onLabelIdsChange={setSelectedLabelIds}
          />
        </QuizzEditorProvider>
      </section>
    </div>
  )
}
