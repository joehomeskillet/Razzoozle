import { EVENTS } from "@razzia/common/constants"
import type { CatalogEntry } from "@razzia/common/types/catalog"
import type { QuizzWithId } from "@razzia/common/types/game"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { EmptyState } from "@razzia/web/features/manager/components/console"
import QuestionEditorAcceptedAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAcceptedAnswers"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import QuestionEditorType from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorType"
import {
  QuizzEditorProvider,
  useQuizzEditor,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { BookOpen, Library, Pencil, Trash2, X } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const TYPE_LABEL_KEY: Record<string, string> = {
  choice: "quizz:type.choice",
  boolean: "quizz:type.boolean",
  slider: "quizz:type.slider",
  poll: "quizz:type.poll",
  "multiple-select": "quizz:type.multipleSelect",
  "type-answer": "quizz:type.typeAnswer",
}

const formatDate = (iso: string) => {
  const d = new Date(iso)

  return `${d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} - ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)

type CatalogModalMode = "add" | "edit"

interface CatalogQuestionFormProps {
  mode: CatalogModalMode
  editingEntry: CatalogEntry | null
  tagsValue: string
  onTagsChange: (value: string) => void
  onClose: () => void
  onSaveStart: (mode: CatalogModalMode) => void
}

interface CatalogQuestionModalProps {
  open: boolean
  mode: CatalogModalMode
  editingEntry: CatalogEntry | null
  onClose: () => void
  onSaveStart: (mode: CatalogModalMode) => void
}

const CatalogQuestionForm = ({
  mode,
  editingEntry,
  tagsValue,
  onTagsChange,
  onClose,
  onSaveStart,
}: CatalogQuestionFormProps) => {
  const { currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const isSlider = currentQuestion.type === "slider"
  const isTypeAnswer = currentQuestion.type === "type-answer"

  const handleSave = () => {
    const { id: _id, ...question } = currentQuestion
    const tags = parseTags(tagsValue)
    const payloadTags = tags.length > 0 ? tags : undefined

    onSaveStart(mode)

    if (mode === "edit" && editingEntry) {
      socket.emit(EVENTS.CATALOG.UPDATE, {
        id: editingEntry.id,
        question,
        tags: payloadTags,
      })

      return
    }

    socket.emit(EVENTS.CATALOG.ADD, {
      question,
      tags: payloadTags,
      source: "manual",
    })
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-gray-50 p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-6 xl:gap-y-4">
          <section className="flex flex-col gap-2">
            <QuestionEditorTitle />
            <div className="mt-2 rounded-2xl bg-white p-4 shadow-sm">
              <QuestionEditorType />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <label
              htmlFor="catalog-tags"
              className="w-fit text-xs font-semibold tracking-wide text-gray-500 uppercase"
            >
              {t("manager:catalog.tags")}
            </label>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <Input
                id="catalog-tags"
                value={tagsValue}
                onChange={(e) => onTagsChange(e.target.value)}
                placeholder={t("manager:catalog.tagsPlaceholder")}
                className="min-h-11 w-full rounded-xl"
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm [&_audio]:max-w-full [&_img]:max-w-full [&_video]:max-w-full [&>div]:min-h-0">
              <QuestionEditorMedia />
            </div>
          </section>

          {!isSlider && !isTypeAnswer && (
            <section className="flex flex-col gap-2">
              <div className="w-full overflow-hidden [&>div>div:nth-child(2)]:grid-cols-1 sm:[&>div>div:nth-child(2)]:grid-cols-2">
                <QuestionEditorAnswers />
              </div>
            </section>
          )}

          {isTypeAnswer && (
            <section className="flex flex-col gap-2">
              <QuestionEditorAcceptedAnswers />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <div className="rounded-2xl bg-white p-4 shadow-sm [&>aside]:m-0 [&>aside]:w-full [&>aside]:overflow-visible [&>aside]:rounded-none [&>aside]:bg-transparent [&>aside]:p-0 [&>aside]:shadow-none">
              <QuestionEditorConfig />
            </div>
          </section>
        </div>
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("common:cancel")}
        </Button>
        <Button type="button" variant="primary" onClick={handleSave}>
          {t("common:save")}
        </Button>
      </footer>
    </>
  )
}

const CatalogQuestionModal = ({
  open,
  mode,
  editingEntry,
  onClose,
  onSaveStart,
}: CatalogQuestionModalProps) => {
  const { t } = useTranslation()
  const [tagsValue, setTagsValue] = useState("")

  useEffect(() => {
    if (open) {
      setTagsValue((editingEntry?.tags ?? []).join(", "))
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-question-modal-title"
        className="flex max-h-[88svh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl xl:max-w-5xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="catalog-question-modal-title"
              className="truncate text-lg font-semibold text-gray-900"
            >
              {mode === "edit"
                ? t("manager:catalog.edit")
                : t("manager:catalog.addManual")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common:cancel")}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/70 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
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
          />
        </QuizzEditorProvider>
      </section>
    </div>
  )
}

const ConfigCatalog = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [search, setSearch] = useState("")
  const [modalMode, setModalMode] = useState<CatalogModalMode>("add")
  const [editingEntry, setEditingEntry] = useState<CatalogEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingOp, setPendingOp] = useState<CatalogModalMode | null>(null)

  const requestCatalog = useCallback(() => {
    socket.emit(EVENTS.CATALOG.LIST)
  }, [socket])

  useEffect(() => {
    requestCatalog()
  }, [requestCatalog])

  useEvent(
    EVENTS.CATALOG.DATA,
    useCallback((nextEntries: CatalogEntry[]) => {
      setEntries(nextEntries)
    }, []),
  )

  useEvent(
    EVENTS.CATALOG.ERROR,
    useCallback(
      (message: string) => {
        toast.error(t(message))
      },
      [t],
    ),
  )

  useEvent(
    EVENTS.CATALOG.ADD_SUCCESS,
    useCallback(() => {
      setModalOpen(false)
      setEditingEntry(null)
      toast.success(
        t(
          pendingOp === "edit"
            ? "manager:catalog.updated"
            : "manager:catalog.saved",
        ),
      )
      setPendingOp(null)
      requestCatalog()
    }, [pendingOp, requestCatalog, t]),
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

  const openAddModal = () => {
    setModalMode("add")
    setEditingEntry(null)
    setModalOpen(true)
  }

  const openEditModal = (entry: CatalogEntry) => {
    setModalMode("edit")
    setEditingEntry(entry)
    setModalOpen(true)
  }

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingEntry(null)
    setPendingOp(null)
  }, [])

  const handleDelete = (id: string) => {
    socket.emit(EVENTS.CATALOG.DELETE, { id })
    toast.success(t("manager:catalog.deleted"))
    requestCatalog()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("manager:catalog.title")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              {t("manager:catalog.intro")}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 rounded-xl"
            onClick={openAddModal}
          >
            <BookOpen className="size-5" aria-hidden />
            {t("manager:catalog.addManual")}
          </Button>
        </div>

        <label htmlFor="catalog-search" className="sr-only">
          {t("manager:catalog.search")}
        </label>
        <Input
          id="catalog-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("manager:catalog.searchPlaceholder")}
          className="min-h-11 w-full rounded-xl"
        />
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState
            icon={Library}
            headline={t("manager:catalog.emptyHeadline")}
            hint={t("manager:catalog.empty")}
            action={{
              label: t("manager:catalog.addManual"),
              onClick: openAddModal,
            }}
          />
        </div>
      ) : (
        <motion.div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-0.5"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {filteredEntries.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500 outline-2 -outline-offset-2 outline-gray-200">
              {t("manager:catalog.noResults")}
            </p>
          ) : (
            filteredEntries.map((entry, index) => {
              const type = entry.question.type ?? "choice"
              const source = entry.source ?? "manual"

              return (
                <motion.article
                  key={entry.id}
                  className="rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200"
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={
                    reducedMotion
                      ? undefined
                      : {
                          duration: 0.28,
                          ease: "easeOut",
                          delay: Math.min(index, 8) * 0.04,
                        }
                  }
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-gray-900">
                        {entry.question.question}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                          {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                          {t(`manager:catalog.source.${source}`)}
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
                      <p className="mt-2 text-xs text-gray-500">
                        {formatDate(entry.addedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditModal(entry)}
                      >
                        <Pencil className="size-4" aria-hidden />
                        {t("manager:catalog.edit")}
                      </Button>
                      <AlertDialog
                        trigger={
                          <Button type="button" variant="danger" size="sm">
                            <Trash2 className="size-4" aria-hidden />
                            {t("manager:catalog.delete")}
                          </Button>
                        }
                        title={t("manager:catalog.delete")}
                        description={t("manager:catalog.deleteConfirm")}
                        confirmLabel={t("common:delete")}
                        onConfirm={() => handleDelete(entry.id)}
                      />
                    </div>
                  </div>
                </motion.article>
              )
            })
          )}
        </motion.div>
      )}

      <CatalogQuestionModal
        open={modalOpen}
        mode={modalMode}
        editingEntry={editingEntry}
        onClose={closeModal}
        onSaveStart={setPendingOp}
      />
    </div>
  )
}

export default ConfigCatalog
