import { EVENTS } from "@razzia/common/constants"
import { quizzValidator } from "@razzia/common/validators/quizz"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  EmptyState,
  ListRow,
} from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { useNavigate } from "@tanstack/react-router"
import {
  Archive,
  ArchiveRestore,
  Copy,
  ListChecks,
  SearchX,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ChangeEvent, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Sort options offered above the quiz list. "created date" is intentionally
// omitted: QuizzMeta carries no timestamp, so there is no field to sort on.
type SortKey = "name-asc" | "count-desc" | "count-asc"

const ConfigManageQuizz = () => {
  const { quizz } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
              <ListRow
                title={q.subject}
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
