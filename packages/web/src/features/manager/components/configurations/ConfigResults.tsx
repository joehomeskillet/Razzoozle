import { EVENTS } from "@razzoozle/common/constants"
import type { GameResult } from "@razzoozle/common/types/game"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import ResultModal from "@razzoozle/web/features/manager/components/ResultModal"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
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

// Local YYYY-MM-DD for an ISO timestamp, so a date-picker value (which is local
// and timezone-naive) compares against the same calendar day the user sees in
// the list — not the UTC day.
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
  // The result pending a delete confirmation; drives the AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subject: string
  } | null>(null)
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

  useEvent(
    EVENTS.RESULTS.DATA,
    useCallback((data) => setSelectedResult(data), []),
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

  const handleShare = (id: string) => async () => {
    const url = `${window.location.origin}/r/${id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t("manager:result.share.copied"))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
                className="min-h-11 w-full rounded-xl pl-10"
              />
            </div>
            <div className="sm:w-52">
              <label htmlFor="results-date" className="sr-only">
                {t("manager:result.dateFilter", {
                  defaultValue: "Nach Datum filtern",
                })}
              </label>
              <Input
                id="results-date"
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                aria-label={t("manager:result.dateFilter", {
                  defaultValue: "Nach Datum filtern",
                })}
                className="min-h-11 w-full rounded-xl"
              />
            </div>
          </div>

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
            <motion.div
              className="min-h-0 flex-1 space-y-3 p-0.5"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={
                reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
              }
            >
              {filteredResults.map((r, index) => (
                <motion.div
                  key={r.id}
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
          )}
        </>
      )}

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
