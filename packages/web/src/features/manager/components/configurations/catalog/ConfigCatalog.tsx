import { EVENTS } from "@razzoozle/common/constants"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Badge from "@razzoozle/web/components/manager/Badge"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import LabelFilterPills from "@razzoozle/web/components/labels/LabelFilterPills"
import { ActionFooter } from "@razzoozle/web/components/ui"
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
    <>
      <div className="flex min-h-0 flex-1 flex-col pb-20">
        <div className="mb-4 flex shrink-0 flex-col gap-3">
          <PageHeader
            title={t("manager:catalog.title")}
            subtitle={t("manager:catalog.intro")}
          />

          <label htmlFor="catalog-search" className="sr-only">
            {t("manager:catalog.search")}
          </label>
          <Input
            id="catalog-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:catalog.searchPlaceholder")}
            className="min-h-11 w-full rounded-[var(--radius-theme)]"
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
            ).map((entry) => (
              <FilterPill
                key={entry.key}
                active={scope === entry.key}
                onClick={() => setScope(entry.key)}
              >
                {entry.label}
              </FilterPill>
            ))}
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
              const entryTags = entry.tags ?? []
              const hasFooter =
                entryTags.length > 0 || (klassenEnabled && entryLabelIds.length > 0)

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
                    leading={
                      <Library className="size-5 shrink-0 text-[var(--ink-muted)]" />
                    }
                    title={entry.question.question}
                    meta={
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge>
                          {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
                        </Badge>
                        <Badge className="bg-[var(--surface-3)] text-[var(--ink-medium)]">
                          {t(`manager:catalog.source.${source}`)}
                        </Badge>
                        <span className="text-xs text-[var(--ink-subtle)]">
                          {formatDate(entry.addedAt)}
                        </span>
                      </span>
                    }
                    footer={
                      hasFooter && (
                        <span className="flex flex-wrap gap-2">
                          {klassenEnabled &&
                            entryLabelIds.length > 0 &&
                            labels
                              .filter((label) => entryLabelIds.includes(label.id))
                              .map((label) => (
                                <LabelChip key={label.id} label={label} />
                              ))}
                          {entryTags.map((tag, tagIndex) => (
                            <Badge
                              key={`${tag}-${tagIndex}`}
                              className="bg-[var(--surface-3)] text-[var(--ink-medium)]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      )
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

      <ActionFooter>
        <Button
          data-testid="catalog-create-btn"
          variant="primary"
          size="lg"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={openAddModal}
        >
          <BookOpen className="size-5" aria-hidden />
          <span>{t("manager:catalog.addManual")}</span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigCatalog
