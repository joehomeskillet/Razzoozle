import { EVENTS } from "@razzoozle/common/constants"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import LabelFilterPills from "@razzoozle/web/components/labels/LabelFilterPills"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import { useLabelManager } from "@razzoozle/web/features/manager/components/configurations/labels/useLabelManager"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { BookOpen, Library, Pencil, SearchX, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { CatalogQuestionModal } from "./CatalogQuestionModal"
import { TYPE_LABEL_KEY } from "./constants"
import type { CatalogEntry, CatalogModalMode } from "./types"
import { formatDate } from "./utils"

type CatalogScope = "own" | "global" | "all"

const ConfigCatalog = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<CatalogScope>("all")
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null)
  const [modalMode, setModalMode] = useState<CatalogModalMode>("add")
  const [editingEntry, setEditingEntry] = useState<CatalogEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingOp, setPendingOp] = useState<CatalogModalMode | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    question: string
  } | null>(null)

  const { labels } = useLabelManager()
  const klassenEnabled = useManagerStore((s) => s.config?.klassenEnabled ?? false)

  const requestCatalog = useCallback(() => {
    socket.emit(EVENTS.CATALOG.LIST, { scope })
  }, [socket, scope])

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
        setPendingOp(null)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEvent(EVENTS.LABEL.ASSIGNED as any, useCallback((payload: any) => {
    if (payload.entityType === "catalog") {
      requestCatalog()
    }
  }, [requestCatalog]))

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    let results = entries

    // Filter by search text
    if (q) {
      results = results.filter((entry) => {
        const question = entry.question.question.toLowerCase()
        const tags = entry.tags ?? []
        return (
          question.includes(q) ||
          tags.some((tag) => tag.toLowerCase().includes(q))
        )
      })
    }

    // Filter by selected label
    if (selectedLabelId !== null && klassenEnabled) {
      results = results.filter((entry) => {
        const entryLabelIds = entry.labelIds ?? []
        return entryLabelIds.includes(selectedLabelId)
      })
    }

    return results
  }, [entries, search, selectedLabelId, klassenEnabled])

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

  const handleDelete = () => {
    if (!pendingDelete) {
      return
    }

    socket.emit(EVENTS.CATALOG.DELETE, { id: pendingDelete.id })
    toast.success(t("manager:catalog.deleted"))
    setPendingDelete(null)
    requestCatalog()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--ink)]">
              {t("manager:catalog.title")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-subtle)]">
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

        <div
          role="group"
          aria-label={t("manager:catalog.scope.label", {
            defaultValue: "Sichtbarkeit",
          })}
          className="flex flex-wrap items-center gap-2"
        >
          {(
            [
              { key: "own", label: t("manager:catalog.scope.own", { defaultValue: "Eigene" }) },
              { key: "global", label: t("manager:catalog.scope.global", { defaultValue: "Global" }) },
              { key: "all", label: t("manager:catalog.scope.all", { defaultValue: "Alle" }) },
            ] as const
          ).map((entry) => {
            const active = scope === entry.key

            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setScope(entry.key)}
                aria-pressed={active}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-full bg-[var(--accent-tint)] px-3 text-sm font-semibold text-[var(--accent-contrast)] outline-2 -outline-offset-2 outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                    : "inline-flex min-h-11 items-center rounded-full bg-[var(--surface-3)] px-3 text-sm font-semibold text-[var(--ink-medium)] hover:bg-[var(--surface-4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                }
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        {klassenEnabled && (
          <LabelFilterPills
            labels={labels}
            activeId={selectedLabelId}
            onChange={setSelectedLabelId}
          />
        )}
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
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          icon={SearchX}
          headline={t("manager:catalog.noResults")}
          hint={t("manager:catalog.search")}
        />
      ) : (
        <motion.div
          className="flex min-h-0 flex-1 flex-col space-y-3 p-0.5"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {filteredEntries.map((entry, index) => {
            const type = entry.question.type ?? "choice"
            const source = entry.source ?? "manual"
            const entryLabelIds = entry.labelIds ?? []

            return (
              <motion.div
                key={entry.id}
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
                  title={entry.question.question}
                  meta={
                    <span className="flex flex-col gap-2 whitespace-normal">
                      <span className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-4)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">
                          {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-3)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-medium)]">
                          {t(`manager:catalog.source.${source}`)}
                        </span>
                        {klassenEnabled && entryLabelIds.length > 0 && (
                          <>
                            {labels
                              .filter((label) => entryLabelIds.includes(label.id))
                              .map((label) => (
                                <LabelChip key={label.id} label={label} />
                              ))}
                          </>
                        )}
                        {(entry.tags ?? []).map((tag, tagIndex) => (
                          <span
                            key={`${tag}-${tagIndex}`}
                            className="inline-flex items-center rounded-full bg-[var(--surface-3)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-medium)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                      <span className="text-xs text-[var(--ink-subtle)]">
                        {formatDate(entry.addedAt)}
                      </span>
                    </span>
                  }
                  actions={[
                    {
                      key: "edit",
                      icon: Pencil,
                      label: t("manager:catalog.edit"),
                      onClick: () => openEditModal(entry),
                    },
                    {
                      key: "delete",
                      icon: Trash2,
                      label: t("manager:catalog.delete"),
                      destructive: true,
                      onClick: () =>
                        setPendingDelete({
                          id: entry.id,
                          question: entry.question.question,
                        }),
                    },
                  ]}
                />
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <CatalogQuestionModal
        open={modalOpen}
        mode={modalMode}
        editingEntry={editingEntry}
        onClose={closeModal}
        onSaveStart={setPendingOp}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
        title={t("manager:catalog.delete")}
        description={t("manager:catalog.deleteConfirm")}
        confirmLabel={t("common:delete")}
        onConfirm={handleDelete}
      />
    </div>
  )
}

export default ConfigCatalog
