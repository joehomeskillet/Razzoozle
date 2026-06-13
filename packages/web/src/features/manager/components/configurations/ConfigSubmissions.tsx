import { EVENTS } from "@razzia/common/constants"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import clsx from "clsx"
import { Check } from "lucide-react"
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {pending.map((s) => (
          <div
            key={s.id}
            className="rounded-md px-3 py-2.5 outline outline-gray-300"
          >
            {editingId === s.id ? (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="focus-visible:outline-primary w-full rounded-md px-3 py-2 outline outline-gray-300 focus-visible:outline-2"
                aria-label={t("manager:submissions.edit")}
              />
            ) : (
              <p className="truncate font-medium">{s.question}</p>
            )}

            <p className="mt-0.5 text-xs text-gray-400">
              {t("manager:submissions.submittedBy", { name: s.submittedBy })}
              {" · "}
              {t("manager:submissions.submittedAt", {
                date: formatDate(s.submittedAt),
              })}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={handleOpenApprove(s.id)}>
                {t("manager:submissions.approve")}
              </Button>

              <Button
                size="sm"
                className="bg-gray-200 text-gray-700"
                onClick={handleOpenEdit(s.id, s.question)}
              >
                {t("manager:submissions.edit")}
              </Button>

              {editingId === s.id && (
                <>
                  <Button size="sm" onClick={handleSaveEdit(s.id)}>
                    {t("common:save")}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gray-200 text-gray-700"
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
                    className="bg-red-500 text-white hover:brightness-95 active:brightness-90"
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
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-gray-500">
                  {t("manager:submissions.selectQuizz")}
                </p>
                {quizzList.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    {t("manager:quizz.notFound")}
                  </p>
                ) : (
                  quizzList.map((quizz) => (
                    <button
                      key={quizz.id}
                      type="button"
                      className={clsx(
                        "flex w-full items-center justify-between rounded-md p-2.5 text-left outline outline-gray-300",
                        "focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2",
                        "hover:outline-primary",
                      )}
                      onClick={handleApprove(s.id, quizz.id)}
                    >
                      <span className="min-w-0 truncate">{quizz.subject}</span>
                      <Check className="text-primary size-4 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ))}

        {pending.length === 0 && (
          <p className="my-8 text-center text-gray-500">
            {t("manager:submissions.empty")}
          </p>
        )}
      </div>
    </div>
  )
}

export default ConfigSubmissions
