import { EVENTS } from "@razzia/common/constants"
import { quizzValidator } from "@razzia/common/validators/quizz"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useNavigate } from "@tanstack/react-router"
import { useState, type ChangeEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const SUBJECT_INPUT_ID = "quizz-subject-input"
const SUBJECT_ERROR_ID = "quizz-subject-error"

const QuizzEditorHeader = () => {
  const { quizzId, subject, setSubject, questions, setCurrentIndex } =
    useQuizzEditor()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [isSaving, setIsSaving] = useState(false)
  const [subjectError, setSubjectError] = useState<string | null>(null)

  const handleChangeSubject = (e: ChangeEvent<HTMLInputElement>) => {
    setSubject(e.target.value)

    if (subjectError) {
      setSubjectError(null)
    }
  }

  const handleSave = () => {
    if (isSaving) {
      return
    }

    setSubjectError(null)

    const result = quizzValidator.safeParse({ subject, questions })

    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const { path } = firstIssue

      if (path[0] === "subject") {
        setSubjectError(firstIssue.message)
        document.getElementById(SUBJECT_INPUT_ID)?.focus()
      } else if (path[0] === "questions" && typeof path[1] === "number") {
        // Jump to the first question that failed so its field is visible.
        setCurrentIndex(path[1])
      }

      toast.error(t(firstIssue.message))

      return
    }

    setIsSaving(true)

    if (quizzId) {
      socket.emit(EVENTS.QUIZZ.UPDATE, { id: quizzId, subject, questions })
    } else {
      socket.emit(EVENTS.QUIZZ.SAVE, { subject, questions })
    }
  }

  useEvent(EVENTS.QUIZZ.SAVE_SUCCESS, () => {
    setIsSaving(false)
    toast.success(t("quizz:quizzSaved"))
    navigate({ to: "/manager/config" })
  })

  useEvent(EVENTS.QUIZZ.UPDATE_SUCCESS, (_data) => {
    setIsSaving(false)
    toast.success(t("quizz:quizzUpdated"))
    navigate({ to: "/manager/config" })
  })

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    setIsSaving(false)
    toast.error(t(message))
  })

  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 shadow-sm sm:px-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <Input
          id={SUBJECT_INPUT_ID}
          variant="sm"
          className="min-h-11 w-full max-w-xs"
          value={subject}
          onChange={handleChangeSubject}
          placeholder={t("quizz:titleQuizzPlaceholder")}
          aria-label={t("quizz:subjectInputLabel")}
          aria-invalid={subjectError ? true : undefined}
          aria-errormessage={subjectError ? SUBJECT_ERROR_ID : undefined}
        />
        {subjectError && (
          <span
            id={SUBJECT_ERROR_ID}
            className="mt-0.5 text-xs font-semibold text-red-500"
          >
            {t(subjectError)}
          </span>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          className="focus-visible:outline-primary min-h-11 bg-gray-100 px-4 font-semibold text-gray-700 hover:bg-gray-200"
          onClick={() => navigate({ to: "/manager" })}
        >
          {t("common:exit")}
        </Button>
        <Button
          size="sm"
          className="min-h-11 px-4"
          onClick={handleSave}
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {isSaving && <Loader className="size-5 text-white" />}
          {t("common:save")}
        </Button>
      </div>
    </header>
  )
}

export default QuizzEditorHeader
