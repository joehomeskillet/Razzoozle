import { EVENTS } from "@razzoozle/common/constants"
import type { GameResult } from "@razzoozle/common/types/game"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Checkbox from "@razzoozle/web/components/Checkbox"
import DateInput from "@razzoozle/web/components/DateInput"
import Input from "@razzoozle/web/components/Input"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import {
  listContainerMotion,
  listItemMotion,
} from "@razzoozle/web/features/manager/components/console/listMotion"
import ResultModal from "@razzoozle/web/features/manager/components/ResultModal"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import { BarChart3, Search, SearchX, Share2, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const formatDate = (iso: string) => {
  const d = new Date(iso)

  return `${d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

const localDateKey = (iso: string) => {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")

  return `${d.getFullYear()}-${month}-${day}`
}

const ConfigResults = () => {
  const { socket } = useSocket()
  const { results } = useConfig()
  const [selectedResult, setSelectedResult] = useState<GameResult | null>(null)
  const [search, setSearch] = useState("")
  const [dateFilter, setDateFilter] = useState("")
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subject: string
  } | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [typeConfirmValue, setTypeConfirmValue] = useState("")
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  const filteredResults = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q && !dateFilter) {
      return results
    }

    return results.filter((r) => {
      const matchesSearch = !q || r.subject.toLowerCase().includes(q)
      const matchesDate = !dateFilter || localDateKey(r.date) === dateFilter

      return matchesSearch && matchesDate
    })
  }, [results, search, dateFilter])

  const selection = useEntitySelection<string>(filteredResults.map((r) => r.id))

  useEvent(
    EVENTS.RESULTS.DATA,
    useCallback((data) => setSelectedResult(data), []),
  )

  // Socket listener for bulk delete completion. Decoupled from selection via
  // useCallback (only t in deps) to avoid re-registration on every filter change.
  useEvent(
    EVENTS.RESULTS.BULK_DELETED,
    useCallback(
      (data: { succeeded: string[]; failed: Array<{ id: string; reason: string }> }) => {
        const succeeded = data.succeeded.length
        const failed = data.failed.length

        let message = ""
        if (succeeded > 0) {
          message += t("manager:bulk.resultSucceeded", { count: succeeded })
        }
        if (failed > 0) {
          message += (message ? ", " : "") + t("manager:bulk.resultFailed", { count: failed })
        }

        toast.success(message || t("manager:bulk.resultCompleted"))
        selection.clear()
        setBulkConfirm(false)
        setTypeConfirmValue("")
        setBulkProcessing(false)
      },
      [t],
    ),
  )

  const handleOpen = (id: string) => () => {
    socket.emit(EVENTS.RESULTS.GET, id)
  }

  const handleDelete = () => {
    if (!pendingDelete) {
      return
    }

    socket.emit(EVENTS.RESULTS.DELETE, pendingDelete.id)
    toast.success(t("manager:result.deleted"))
    setPendingDelete(null)
  }

  const handleBulkDelete = () => {
    if (selection.selected.size === 0 || bulkProcessing) return

    setBulkProcessing(true)
    socket.emit(EVENTS.RESULTS.BULK_DELETE, {
      ids: Array.from(selection.selected),
    })
  }

  const handleShare = (id: string) => async () => {
    const url = `${window.location.origin}/r/${id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t("manager:result.share.copied"))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  const hasFilter = search.trim() !== "" || dateFilter !== ""
  const filterText = search.trim() || dateFilter
  const needsTypeConfirm =
    selection.allSelected && !hasFilter && selection.selected.size >= 20
  const confirmPhrase = t("manager:result.confirmAllPhrase")
  // Guard against empty confirm phrase (i18n missing/fallback) with strict validation.
  // Type-confirm gate requires both: i18n-key must exist + user must type exact phrase.
  const isConfirmPhraseValid = confirmPhrase && confirmPhrase.length > 0
  const isTypeConfirmValid =
    needsTypeConfirm ? isConfirmPhraseValid && typeConfirmValue === confirmPhrase : true

  const getBulkLabel = () => {
    if (!selection.selectionActive) return ""
    const count = selection.selected.size

    if (selection.allSelected) {
      if (hasFilter) {
        // Filtered scope: show "Alle gefilterten ausgewählt" + count of visible results.
        // Implementation sends only visible IDs; semantics: "all within filter scope".
        return t("manager:bulk.allFilteredSelected", { count })
      }
      // No filter: all results in list are selected.
      // Implementation sends all IDs; semantics: "all results".
      return t("manager:bulk.allSelected", { count })
    }

    // Partial selection: show count of selected items within filtered results.
    return t("manager:bulk.selected", { count })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("manager:tabs.results")}
          subtitle={t("manager:result.intro")}
        />
      </div>

      {results.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState
            icon={BarChart3}
            headline={t("manager:result.emptyHeadline")}
            hint={t("manager:result.none")}
          />
        </div>
      ) : (
        <>
          <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[var(--ink-faint)]"
                aria-hidden
              />
              <label htmlFor="results-search" className="sr-only">
                {t("manager:result.searchPlaceholder", {
                  defaultValue: "Ergebnisse durchsuchen",
                })}
              </label>
              <Input
                id="results-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("manager:result.searchPlaceholder", {
                  defaultValue: "Ergebnisse durchsuchen",
                })}
                className="min-h-11 w-full rounded-[var(--radius-theme)] pl-10"
              />
            </div>
            <div className="sm:w-52">
              <label htmlFor="results-date" className="sr-only">
                {t("manager:result.dateFilter", {
                  defaultValue: "Nach Datum filtern",
                })}
              </label>
              <DateInput
                id="results-date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                aria-label={t("manager:result.dateFilter", {
                  defaultValue: "Nach Datum filtern",
                })}
              />
            </div>
          </div>

          {/* Bulk action toolbar */}
          {selection.selectionActive && (
            <BulkActionToolbar
              data-testid="results-bulk-toolbar"
              count={selection.selected.size}
              label={getBulkLabel()}
              onClear={selection.clear}
            >
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setBulkConfirm(true)
                  setTypeConfirmValue("")
                }}
                disabled={bulkProcessing}
              >
                {t("manager:bulk.deleteSelected")}
              </Button>
            </BulkActionToolbar>
          )}

          {filteredResults.length === 0 ? (
            <EmptyState
              icon={SearchX}
              headline={t("manager:result.noResults", {
                defaultValue: "Keine passenden Ergebnisse",
              })}
              hint={t("manager:result.noResultsHint", {
                defaultValue: "Suche oder Datumsfilter anpassen.",
              })}
            />
          ) : (
            <>
              {/* Select-all header */}
              <div className="text-xs font-semibold text-[var(--ink-muted)] px-3 py-2">
                <Checkbox
                  data-testid="results-select-all"
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selection.someSelected && !selection.allSelected
                      el.checked = selection.allSelected
                    }
                  }}
                  onChange={() => selection.toggleAll()}
                  aria-label="Alle auswählen"
                />
                {selection.selectionActive && (
                  <span className="ml-2">{getBulkLabel()}</span>
                )}
              </div>

              <motion.div
                className="min-h-0 flex-1 space-y-3 p-0.5"
                {...listContainerMotion(reducedMotion)}
              >
                {filteredResults.map((r, index) => (
                  <motion.div
                    key={r.id}
                    {...listItemMotion(index, reducedMotion)}
                  >
                    <ListRow
                      selection={
                        <Checkbox
                          data-testid={`result-select-${r.id}`}
                          checked={selection.isSelected(r.id)}
                          onChange={() => selection.toggle(r.id)}
                          aria-label={`Auswahl: ${r.subject} · ${formatDate(r.date)}`}
                        />
                      }
                      title={r.subject}
                      meta={
                        <>
                          {formatDate(r.date)}
                          {" · "}
                          <span className="tabular-nums">
                            {t("manager:result.playerCount", {
                              count: r.playerCount,
                            })}
                          </span>
                        </>
                      }
                      onClick={handleOpen(r.id)}
                      bodyLabel={t("manager:result.open", { name: r.subject })}
                      density="compact"
                      actions={[
                        {
                          key: "share",
                          icon: Share2,
                          label: t("manager:result.share.action"),
                          onClick: handleShare(r.id),
                        },
                        {
                          key: "delete",
                          icon: Trash2,
                          label: t("manager:result.delete"),
                          destructive: true,
                          onClick: () =>
                            setPendingDelete({ id: r.id, subject: r.subject }),
                        },
                      ]}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </>
          )}
        </>
      )}

      {/* Single delete dialog */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
        title={t("manager:result.delete")}
        description={t("manager:result.deleteConfirm", {
          name: pendingDelete?.subject ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDelete}
      />

      {/* Bulk delete dialog */}
      <AlertDialog
        open={bulkConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setBulkConfirm(false)
            setTypeConfirmValue("")
          }
        }}
        title={t("manager:result.bulkDeleteTitle", {
          count: selection.selected.size,
        })}
        description={
          <>
            <p>{t("manager:result.bulkDeleteWarning")}</p>
            {hasFilter && (
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                {t("manager:result.bulkDeleteFilterHint", { filter: filterText })}
              </p>
            )}
            {needsTypeConfirm && (
              <>
                <p className="mt-4 text-sm">
                  {t("manager:result.typeToConfirm", { phrase: confirmPhrase })}
                </p>
                <input
                  data-testid="results-bulk-confirm-input"
                  type="text"
                  value={typeConfirmValue}
                  onChange={(e) => setTypeConfirmValue(e.target.value)}
                  placeholder={confirmPhrase}
                  className="mt-2 w-full rounded border border-[var(--border-hairline)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </>
            )}
          </>
        }
        confirmLabel={t("manager:bulk.deleteSelected")}
        onConfirm={handleBulkDelete}
        confirmDisabled={bulkProcessing || !isTypeConfirmValid}
      />

      {selectedResult && (
        <ResultModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}

export default ConfigResults
