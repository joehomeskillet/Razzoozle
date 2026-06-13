import { EVENTS } from "@razzia/common/constants"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { EmptyState } from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { Check, Inbox } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useState } from "react"
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

const ConfigSubmissions = () => {
  const { socket } = useSocket()
  const { submissions, quizz: quizzList } = useConfig()
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  const pending = submissions.filter((s) => s.status === "pending")

  const handleOpenApprove = (id: string) => () => {
    setEditingId(null)
    setApprovingId((current) => (current === id ? null : id))
  }

  const handleApprove = (id: string, quizzId: string) => () => {
    socket.emit(EVENTS.MANAGER.APPROVE_SUBMISSION, { id, quizzId })
    setApprovingId(null)
    toast.success(t("manager:submissions.approve"))
  }

  const handleOpenEdit = (id: string, question: string) => () => {
    setApprovingId(null)

    if (editingId === id) {
      setEditingId(null)

      return
    }

    setEditingId(id)
    setEditValue(question)
  }

  const handleSaveEdit = (id: string) => () => {
    const trimmed = editValue.trim()

    if (!trimmed) {
      return
    }

    socket.emit(EVENTS.MANAGER.EDIT_SUBMISSION, { id, question: trimmed })
    setEditingId(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleReject = (id: string) => () => {
    socket.emit(EVENTS.MANAGER.REJECT_SUBMISSION, { id })
    toast.success(t("manager:submissions.reject"))
  }

  if (pending.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <EmptyState
          icon={Inbox}
          headline={t("manager:submissions.emptyHeadline")}
          hint={t("manager:submissions.empty")}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <motion.div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-0.5"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={
          reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
        }
      >
        {pending.map((s, index) => (
          <motion.div
            key={s.id}
            className="rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200"
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? undefined
                : { duration: 0.28, ease: "easeOut", delay: index * 0.04 }
            }
          >
            {editingId === s.id ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                variant="sm"
                className="min-h-11 w-full rounded-lg"
                aria-label={t("manager:submissions.edit")}
              />
            ) : (
              <p className="truncate font-semibold text-gray-900">
                {s.question}
              </p>
            )}

            <p className="mt-1 text-sm text-gray-500">
              {t("manager:submissions.submittedBy", { name: s.submittedBy })}
              {" · "}
              {t("manager:submissions.submittedAt", {
                date: formatDate(s.submittedAt),
              })}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-11 rounded-lg"
                onClick={handleOpenApprove(s.id)}
              >
                {t("manager:submissions.approve")}
              </Button>

              <Button
                size="sm"
                className="min-h-11 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                onClick={handleOpenEdit(s.id, s.question)}
              >
                {t("manager:submissions.edit")}
              </Button>

              {editingId === s.id && (
                <>
                  <Button
                    size="sm"
                    className="min-h-11 rounded-lg"
                    onClick={handleSaveEdit(s.id)}
                  >
                    {t("common:save")}
                  </Button>
                  <Button
                    size="sm"
                    className="min-h-11 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                    onClick={handleCancelEdit}
                  >
                    {t("common:cancel")}
                  </Button>
                </>
              )}

              <AlertDialog
                trigger={
                  <Button
                    size="sm"
                    className="min-h-11 rounded-lg bg-red-500 text-white hover:brightness-95 active:brightness-90"
                  >
                    {t("manager:submissions.reject")}
                  </Button>
                }
                title={t("manager:submissions.reject")}
                description={t("manager:submissions.confirmReject")}
                confirmLabel={t("common:delete")}
                onConfirm={handleReject(s.id)}
              />
            </div>

            {approvingId === s.id && (
              <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  {t("manager:submissions.selectQuizz")}
                </p>
                {quizzList.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {t("manager:quizz.notFound")}
                  </p>
                ) : (
                  quizzList.map((quizz) => (
                    <button
                      key={quizz.id}
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-white p-3 text-left outline-2 -outline-offset-2 outline-gray-200 transition-colors hover:outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                      onClick={handleApprove(s.id, quizz.id)}
                    >
                      <span className="min-w-0 truncate font-medium text-gray-900">
                        {quizz.subject}
                      </span>
                      <Check
                        className="size-5 shrink-0 text-[var(--accent-contrast)]"
                        aria-hidden
                      />
                    </button>
                  ))
                )}
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export default ConfigSubmissions
