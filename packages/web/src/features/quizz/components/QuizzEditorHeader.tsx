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
      const path = firstIssue.path

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
    <header className="z-20 flex h-14 items-center justify-between gap-4 bg-white px-4 shadow-sm">
      <div className="flex items-center gap-6">
        <div className="flex flex-col">
          <Input
            id={SUBJECT_INPUT_ID}
            variant="sm"
            className="w-64"
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
      </div>

      <div className="flex gap-2">
        <Button
          className="text-md bg-gray-200 px-4 py-2 font-semibold text-gray-600"
          onClick={() => navigate({ to: "/manager" })}
        >
          {t("common:exit")}
        </Button>
        <Button
          className="bg-primary text-md px-4 py-2"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving && <Loader className="size-5" />}
          {t("common:save")}
        </Button>
      </div>
    </header>
  )
}

export default QuizzEditorHeader
