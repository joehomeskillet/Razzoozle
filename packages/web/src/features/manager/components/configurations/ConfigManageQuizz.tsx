import { EVENTS } from "@razzoozle/common/constants"
import type { QuizzWithId } from "@razzoozle/common/types/game"
import { quizzValidator } from "@razzoozle/common/validators/quizz"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useNavigate } from "@tanstack/react-router"
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  ListChecks,
  SearchX,
  SquarePen,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Serialize a quiz to a pretty-printed JSON file and trigger a client-side
// download via a transient object-URL anchor. The `id` field is stripped so the
// exported shape matches quizzValidator, letting export -> import round-trip
// cleanly.
const downloadQuizzJson = (quizz: QuizzWithId) => {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  const { id: _id, ...exportable } = quizz
  const json = JSON.stringify(exportable, null, 2)
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slug(quizz.subject) || "quiz"}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Sort options offered above the quiz list. "created date" is intentionally
// omitted: QuizzMeta carries no timestamp, so there is no field to sort on.
type SortKey = "name-asc" | "count-desc" | "count-asc"

const ConfigManageQuizz = () => {
  const { quizz } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Holds the id of the quiz awaiting a QUIZZ.DATA response for export. The
  // QUIZZ.DATA event is shared (also used by the editor), so we only act on the
  // response whose id matches this pending export request.
  const pendingExportId = useRef<string | null>(null)
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name-asc")
  // The quiz pending a delete confirmation; drives the delete AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subject: string
  } | null>(null)
  // The quiz pending a duplicate confirmation; drives the duplicate AlertDialog.
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    id: string
    subject: string
  } | null>(null)
  // Multi-select state keyed by quiz id (indices would break under filter/sort).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Live search + sort applied to both the active and archived sections.
  const { activeQuizz, archivedQuizz, hasMatches } = useMemo(() => {
    const query = search.trim().toLowerCase()

    const matchesSearch = (subject: string) =>
      query.length === 0 || subject.toLowerCase().includes(query)

    const sortFn = (
      a: { subject: string; questionCount?: number },
      b: { subject: string; questionCount?: number },
    ) => {
      if (sortKey === "name-asc") {
        return a.subject.localeCompare(b.subject)
      }

      const countA = a.questionCount ?? 0
      const countB = b.questionCount ?? 0

      return sortKey === "count-asc" ? countA - countB : countB - countA
    }

    const active = quizz
      .filter((q) => !q.archived && matchesSearch(q.subject))
      .sort(sortFn)
    const archived = quizz
      .filter((q) => q.archived && matchesSearch(q.subject))
      .sort(sortFn)

    return {
      activeQuizz: active,
      archivedQuizz: archived,
      hasMatches: active.length > 0 || archived.length > 0,
    }
  }, [quizz, search, sortKey])

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    toast.error(t(message))
  })

  // Export: when the QUIZZ.DATA response for the quiz we requested arrives,
  // serialize it to JSON and download. Reuses the EXISTING auth-gated QUIZZ.GET
  // event (no new socket event).
  useEvent(EVENTS.QUIZZ.DATA, (data: QuizzWithId) => {
    if (
      pendingExportId.current === null ||
      data.id !== pendingExportId.current
    ) {
      return
    }

    pendingExportId.current = null
    downloadQuizzJson(data)
    toast.success(t("manager:quizz.exported"))
  })

  const handleExport = (id: string) => {
    pendingExportId.current = id
    socket.emit(EVENTS.QUIZZ.GET, id)
  }

  const clearSelection = () => setSelected(new Set())

  // Drop ids that are no longer SELECTABLE — only active (non-archived) rows
  // carry a checkbox, so prune against that set (not the full list). This means
  // archiving a selected quiz removes it from the selection, preventing a later
  // bulk-delete from silently deleting a now-hidden archived quiz.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const selectable = new Set(
        quizz.filter((q) => !q.archived).map((q) => q.id),
      )
      const next = new Set([...prev].filter((id) => selectable.has(id)))

      return next.size === prev.size ? prev : next
    })
  }, [quizz])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  const handleBulkDelete = () => {
    selected.forEach((id) => {
      socket.emit(EVENTS.QUIZZ.DELETE, id)
    })
    toast.success(t("manager:quizz.deleted"))
    clearSelection()
    setBulkDeleteOpen(false)
  }

  const selectionCount = selected.size
  const selectionActive = selectionCount > 0

  const handleDelete = () => {
    if (!pendingDelete) {
      return
    }

    socket.emit(EVENTS.QUIZZ.DELETE, pendingDelete.id)
    toast.success(t("manager:quizz.deleted"))
    setPendingDelete(null)
  }

  const handleDuplicate = () => {
    if (!pendingDuplicate) {
      return
    }

    socket.emit(EVENTS.QUIZZ.DUPLICATE, pendingDuplicate.id)
    toast.success(t("manager:quizz.duplicated"))
    setPendingDuplicate(null)
  }

  const handleArchived = (id: string, archived: boolean) => {
    socket.emit(EVENTS.QUIZZ.SET_ARCHIVED, { id, archived })
    toast.success(
      t(
        archived
          ? "manager:quizz.archivedToast"
          : "manager:quizz.unarchivedToast",
      ),
    )
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = (event) => {
      let data: unknown = null

      try {
        data = JSON.parse(event.target?.result as string)
      } catch {
        toast.error(t("manager:quizz.invalidJson"))

        return
      }

      const result = quizzValidator.safeParse(data)

      if (!result.success) {
        toast.error(t("manager:quizz.invalidJson"))

        return
      }

      socket.emit(EVENTS.QUIZZ.SAVE, result.data)
    }

    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 gap-2">
        <Button
          variant="primary"
          className="flex-1 rounded-xl"
          onClick={() => navigate({ to: "/manager/quizz" })}
        >
          {t("manager:quizz.create")}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-xl"
          onClick={() => fileInputRef.current?.click()}
          title={t("manager:quizz.import")}
          aria-label={t("manager:quizz.import")}
        >
          <Upload className="size-5" aria-hidden />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {quizz.length > 0 && (
        <div className="mb-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label htmlFor="quizz-search" className="sr-only">
              {t("manager:quizz.search", { defaultValue: "Quiz suchen" })}
            </label>
            <Input
              id="quizz-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("manager:quizz.searchPlaceholder", {
                defaultValue: "Nach Thema suchen …",
              })}
              className="min-h-11 w-full rounded-xl"
            />
          </div>
          <div className="shrink-0">
            <label htmlFor="quizz-sort" className="sr-only">
              {t("manager:quizz.sort", { defaultValue: "Sortieren" })}
            </label>
            <select
              id="quizz-sort"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              aria-label={t("manager:quizz.sort", {
                defaultValue: "Sortieren",
              })}
              className="focus-visible:border-primary min-h-11 w-full rounded-xl border-2 border-gray-300 p-2 font-semibold focus-visible:outline-none sm:w-auto"
            >
              <option value="name-asc">
                {t("manager:quizz.sortNameAsc", {
                  defaultValue: "Name A–Z",
                })}
              </option>
              <option value="count-desc">
                {t("manager:quizz.sortCountDesc", {
                  defaultValue: "Meiste Fragen",
                })}
              </option>
              <option value="count-asc">
                {t("manager:quizz.sortCountAsc", {
                  defaultValue: "Wenigste Fragen",
                })}
              </option>
            </select>
          </div>
        </div>
      )}

      {selectionActive && (
        <div
          role="toolbar"
          aria-label={t("manager:quizz.bulkSelected", {
            count: selectionCount,
            defaultValue: "{{count}} ausgewählt",
          })}
          className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 p-2 pl-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t("common:cancel")}
              title={t("common:cancel")}
              className="focus-visible:outline-primary flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X className="size-5" aria-hidden />
            </button>
            <span className="min-w-0 truncate text-sm font-semibold text-gray-700">
              {t("manager:quizz.bulkSelected", {
                count: selectionCount,
                defaultValue: "{{count}} ausgewählt",
              })}
            </span>
          </div>
          <Button
            size="sm"
            variant="danger"
            className="rounded-lg"
            onClick={() => setBulkDeleteOpen(true)}
            classNameContent="min-w-0 gap-1"
          >
            <Trash2 className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              {t("manager:quizz.bulkDelete", { defaultValue: "Löschen" })}
            </span>
          </Button>
        </div>
      )}

      {quizz.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState
            icon={ListChecks}
            headline={t("manager:quizz.none")}
            hint={t("manager:quizz.pleaseCreate")}
            action={{
              label: t("manager:quizz.create"),
              onClick: () => {
                void navigate({ to: "/manager/quizz" })
              },
            }}
          />
        </div>
      ) : !hasMatches ? (
        <EmptyState
          icon={SearchX}
          headline={t("manager:quizz.noResults", {
            defaultValue: "Keine Treffer",
          })}
          hint={t("manager:quizz.noResultsHint", {
            defaultValue: "Passe deinen Suchbegriff an.",
          })}
        />
      ) : (
        <motion.div
          className="min-h-0 flex-1 space-y-3 p-0.5"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {activeQuizz.map((q, index) => (
            <motion.div
              key={q.id}
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
              <div className="flex items-center gap-2">
                <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-gray-100">
                  <span className="sr-only">
                    {t("manager:quizz.selectQuiz", {
                      name: q.subject,
                      defaultValue: '„{{name}}“ auswählen',
                    })}
                  </span>
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => toggleSelect(q.id)}
                    className="size-5 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </label>
                <ListRow
                  title={q.subject}
                  className="min-w-0 flex-1"
                  meta={
                    q.questionCount != null
                      ? t("manager:catalog.count", { count: q.questionCount })
                      : undefined
                  }
                  actions={[
                    {
                      key: "edit",
                      icon: SquarePen,
                      label: t("manager:quizz.edit", { name: q.subject }),
                      onClick: () => {
                        void navigate({
                          to: "/manager/quizz/$quizzId",
                          params: { quizzId: q.id },
                        })
                      },
                    },
                    {
                      key: "duplicate",
                      icon: Copy,
                      label: t("manager:quizz.duplicate", { name: q.subject }),
                      onClick: () =>
                        setPendingDuplicate({ id: q.id, subject: q.subject }),
                    },
                    {
                      key: "export",
                      icon: Download,
                      label: t("manager:quizz.export", { name: q.subject }),
                      onClick: () => handleExport(q.id),
                    },
                    {
                      key: "archive",
                      icon: Archive,
                      label: t("manager:quizz.archive"),
                      onClick: () => handleArchived(q.id, true),
                    },
                    {
                      key: "delete",
                      icon: Trash2,
                      label: t("manager:quizz.delete"),
                      destructive: true,
                      onClick: () =>
                        setPendingDelete({ id: q.id, subject: q.subject }),
                    },
                  ]}
                />
              </div>
            </motion.div>
          ))}

          {archivedQuizz.length > 0 && (
            <div className="space-y-3 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    {t("manager:quizz.archivedSection")}
                  </p>
                  {showArchived && (
                    <p className="mt-1 text-sm text-gray-500">
                      {t("manager:quizz.archivedHint")}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArchived((current) => !current)}
                  aria-expanded={showArchived}
                >
                  {showArchived
                    ? t("manager:quizz.hideArchived")
                    : t("manager:quizz.showArchived")}
                </Button>
              </div>

              {showArchived &&
                archivedQuizz.map((q, index) => (
                  <motion.div
                    key={q.id}
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
                    <ListRow
                      title={q.subject}
                      meta={
                        q.questionCount != null
                          ? t("manager:catalog.count", {
                              count: q.questionCount,
                            })
                          : t("manager:quizz.archived")
                      }
                      className="opacity-85"
                      actions={[
                        {
                          key: "restore",
                          icon: ArchiveRestore,
                          label: t("manager:quizz.unarchive"),
                          onClick: () => handleArchived(q.id, false),
                        },
                        {
                          key: "edit",
                          icon: SquarePen,
                          label: t("manager:quizz.edit", {
                            name: q.subject,
                          }),
                          onClick: () => {
                            void navigate({
                              to: "/manager/quizz/$quizzId",
                              params: { quizzId: q.id },
                            })
                          },
                        },
                        {
                          key: "export",
                          icon: Download,
                          label: t("manager:quizz.export", { name: q.subject }),
                          onClick: () => handleExport(q.id),
                        },
                        {
                          key: "delete",
                          icon: Trash2,
                          label: t("manager:quizz.delete"),
                          destructive: true,
                          onClick: () =>
                            setPendingDelete({
                              id: q.id,
                              subject: q.subject,
                            }),
                        },
                      ]}
                    />
                  </motion.div>
                ))}
            </div>
          )}
        </motion.div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
        title={t("manager:quizz.delete")}
        description={t("manager:quizz.deleteConfirm", {
          name: pendingDelete?.subject ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDelete}
      />

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("manager:quizz.bulkDeleteTitle", {
          defaultValue: "Quizze löschen",
        })}
        description={t("manager:quizz.bulkDeleteConfirm", {
          count: selectionCount,
          defaultValue:
            "{{count}} ausgewählte Quizze werden dauerhaft gelöscht.",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleBulkDelete}
      />

      <AlertDialog
        open={pendingDuplicate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDuplicate(null)
          }
        }}
        title={t("manager:quizz.duplicateTitle", {
          defaultValue: "Quiz duplizieren",
        })}
        description={t("manager:quizz.duplicateConfirm", {
          name: pendingDuplicate?.subject ?? "",
          defaultValue:
            'Eine Kopie von „{{name}}“ wird mit dem Zusatz „(Kopie)“ erstellt.',
        })}
        confirmLabel={t("manager:quizz.duplicateAction", {
          defaultValue: "Duplizieren",
        })}
        onConfirm={handleDuplicate}
      />
    </div>
  )
}

export default ConfigManageQuizz
