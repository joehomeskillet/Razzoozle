import { EVENTS } from "@razzia/common/constants"
import { quizzValidator } from "@razzia/common/validators/quizz"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
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
import { Copy, ListChecks, SquarePen, Trash2, Upload } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigManageQuizz = () => {
  const { quizz } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  // The quiz pending a delete confirmation; drives the AlertDialog.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subject: string
  } | null>(null)

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

  const handleDuplicate = (id: string) => {
    socket.emit(EVENTS.QUIZZ.DUPLICATE, id)
    toast.success(t("manager:quizz.duplicated"))
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
      ) : (
        <motion.div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-0.5"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {quizz.map((q, index) => (
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
                    onClick: () => handleDuplicate(q.id),
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
    </div>
  )
}

export default ConfigManageQuizz
