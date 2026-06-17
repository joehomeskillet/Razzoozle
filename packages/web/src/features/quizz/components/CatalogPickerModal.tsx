import { EVENTS } from "@razzoozle/common/constants"
import type { CatalogEntry } from "@razzoozle/common/types/catalog"
import type { Question } from "@razzoozle/common/types/game"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

interface CatalogPickerModalProps {
  open: boolean
  onClose: () => void
  onPick: (q: Question) => void
}

const TYPE_LABEL_KEY: Record<string, string> = {
  choice: "quizz:type.choice",
  boolean: "quizz:type.boolean",
  slider: "quizz:type.slider",
  poll: "quizz:type.poll",
  "multiple-select": "quizz:type.multipleSelect",
  "type-answer": "quizz:type.typeAnswer",
}

const CatalogPickerModal = ({
  open,
  onClose,
  onPick,
}: CatalogPickerModalProps) => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [search, setSearch] = useState("")

  const requestCatalog = useCallback(() => {
    socket.emit(EVENTS.CATALOG.LIST)
  }, [socket])

  useEffect(() => {
    if (open) {
      requestCatalog()
    }
  }, [open, requestCatalog])

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

  useEvent(
    EVENTS.CATALOG.DATA,
    useCallback((nextEntries: CatalogEntry[]) => {
      setEntries(nextEntries)
    }, []),
  )

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) {
      return entries
    }

    return entries.filter((entry) => {
      const question = entry.question.question.toLowerCase()
      const tags = entry.tags ?? []

      return (
        question.includes(q) ||
        tags.some((tag) => tag.toLowerCase().includes(q))
      )
    })
  }, [entries, search])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-picker-title"
        className="flex max-h-[88svh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 sm:px-6">
          <h2
            id="catalog-picker-title"
            className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900"
          >
            {t("manager:catalog.insertTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common:cancel")}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-gray-50 p-4 sm:p-6">
          <label htmlFor="catalog-picker-search" className="sr-only">
            {t("manager:catalog.search")}
          </label>
          <Input
            id="catalog-picker-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:catalog.searchPlaceholder")}
            className="min-h-11 w-full rounded-xl bg-white"
          />

          {entries.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500 outline-2 -outline-offset-2 outline-gray-200">
              {t("manager:catalog.empty")}
            </p>
          ) : filteredEntries.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500 outline-2 -outline-offset-2 outline-gray-200">
              {t("manager:catalog.noResults")}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry) => {
                const type = entry.question.type ?? "choice"

                return (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-gray-900">
                        {entry.question.question}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                          {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
                        </span>
                        {(entry.tags ?? []).map((tag, tagIndex) => (
                          <span
                            key={`${tag}-${tagIndex}`}
                            className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        onPick(entry.question)
                        onClose()
                      }}
                    >
                      {t("manager:catalog.insert")}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common:cancel")}
          </Button>
        </footer>
      </section>
    </div>
  )
}

export default CatalogPickerModal
