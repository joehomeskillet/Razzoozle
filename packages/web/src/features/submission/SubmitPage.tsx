import { EVENTS } from "@razzia/common/constants"
import { submissionValidator } from "@razzia/common/validators/submission"
import Background from "@razzia/web/components/Background"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import QuestionEditorType from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorType"
import {
  QuizzEditorProvider,
  useQuizzEditor,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface SubmitInnerProps {
  onReset: () => void
}

const SubmitInner = ({ onReset }: SubmitInnerProps) => {
  const { currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [submittedBy, setSubmittedBy] = useState("")
  const [status, setStatus] = useState<"idle" | "success">("idle")
  const [fieldError, setFieldError] = useState<string | null>(null)

  const isSlider = currentQuestion.type === "slider"

  useEvent(EVENTS.MANAGER.SUBMIT_SUCCESS, () => {
    setStatus("success")
  })

  useEvent(EVENTS.MANAGER.SUBMISSION_ERROR, (message) => {
    toast.error(t(message))
  })

  const handleSubmit = () => {
    const { id: _id, ...question } = currentQuestion
    const parsed = submissionValidator.safeParse({ submittedBy, question })

    if (!parsed.success) {
      const message = parsed.error.issues[0].message
      setFieldError(message)
      toast.error(t(message))

      return
    }

    setFieldError(null)
    socket.emit(EVENTS.MANAGER.SUBMIT_QUESTION, parsed.data)
  }

  const handleReset = () => {
    setSubmittedBy("")
    setStatus("idle")
    setFieldError(null)
    onReset()
  }

  if (status === "success") {
    return (
      <div className="z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-xl bg-white p-8 text-center shadow-sm">
        <h2 className="text-2xl font-bold text-gray-800">
          {t("submit:success.title")}
        </h2>
        <p className="text-gray-600">{t("submit:success.body")}</p>
        <Button onClick={handleReset}>{t("submit:success.again")}</Button>
      </div>
    )
  }

  return (
    <div className="z-10 flex max-h-svh w-full max-w-2xl flex-col gap-4 overflow-y-auto px-4 pb-10">
      <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg">
        {t("submit:form.title")}
      </h2>

      <Input
        value={submittedBy}
        onChange={(e) => setSubmittedBy(e.target.value)}
        placeholder={t("submit:form.namePlaceholder")}
      />

      <QuestionEditorTitle />
      <QuestionEditorType />
      <QuestionEditorMedia />
      {!isSlider && <QuestionEditorAnswers />}
      <QuestionEditorConfig />

      {fieldError && (
        <p className="text-center text-sm font-semibold text-red-200">
          {t(fieldError)}
        </p>
      )}

      <Button onClick={handleSubmit}>{t("submit:form.submitButton")}</Button>
    </div>
  )
}

const SubmitPage = () => {
  const [formKey, setFormKey] = useState(0)

  return (
    <Background>
      <QuizzEditorProvider key={formKey}>
        <SubmitInner onReset={() => setFormKey((k) => k + 1)} />
      </QuizzEditorProvider>
    </Background>
  )
}

export default SubmitPage
