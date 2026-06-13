import { EVENTS } from "@razzia/common/constants"
import type { GameResult } from "@razzia/common/types/game"
import AlertDialog from "@razzia/web/components/AlertDialog"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  EmptyState,
  ListRow,
} from "@razzia/web/features/manager/components/console"
import ResultModal from "@razzia/web/features/manager/components/ResultModal"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { BarChart3, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useState } from "react"
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

const ConfigResults = () => {
  const { socket } = useSocket()
  const { results } = useConfig()
  const [selectedResult, setSelectedResult] = useState<GameResult | null>(null)
  // The result pending a delete confirmation; drives the AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subject: string
  } | null>(null)
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

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
        <motion.div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-0.5"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {results.map((r, index) => (
            <motion.div
              key={r.id}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={
                reducedMotion
                  ? undefined
                  : { duration: 0.28, ease: "easeOut", delay: index * 0.04 }
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
