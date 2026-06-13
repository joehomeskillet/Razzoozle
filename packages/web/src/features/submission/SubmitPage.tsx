import { EVENTS } from "@razzia/common/constants"
import { submissionValidator } from "@razzia/common/validators/submission"
import Background from "@razzia/web/components/Background"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import QuestionEditorAcceptedAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAcceptedAnswers"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import QuestionEditorType from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorType"
import {
  QuizzEditorProvider,
  useQuizzEditor,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { CheckCircle2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface SubmitInnerProps {
  onReset: () => void
}

interface RevealSectionProps {
  children: ReactNode
  index: number
  label: string
}

const RevealSection = ({ children, index, label }: RevealSectionProps) => {
  const reducedMotion = useReducedMotion()

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? undefined
          : { duration: 0.32, ease: "easeOut", delay: index * 0.06 }
      }
      className="flex flex-col gap-2"
    >
      <p className="w-fit rounded-full bg-white/90 px-3 py-1 text-xs font-semibold tracking-wide text-gray-500 uppercase shadow-sm backdrop-blur">
        {label}
      </p>
      {children}
    </motion.section>
  )
}

const SubmitInner = ({ onReset }: SubmitInnerProps) => {
  const { currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [submittedBy, setSubmittedBy] = useState("")
  const [status, setStatus] = useState<"idle" | "success">("idle")
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [awaiting, setAwaiting] = useState(false)

  const isSlider = currentQuestion.type === "slider"
  const isTypeAnswer = currentQuestion.type === "type-answer"

  useEvent(EVENTS.MANAGER.SUBMIT_SUCCESS, () => {
    setAwaiting(false)
    setStatus("success")
  })

  useEvent(EVENTS.MANAGER.SUBMISSION_ERROR, (message) => {
    setAwaiting(false)
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
    setAwaiting(true)
    socket.emit(EVENTS.MANAGER.SUBMIT_QUESTION, parsed.data)
  }

  const handleReset = () => {
    setSubmittedBy("")
    setStatus("idle")
    setFieldError(null)
    setAwaiting(false)
    onReset()
  }

  if (status === "success") {
    return (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={
          reducedMotion ? undefined : { duration: 0.28, ease: "easeOut" }
        }
        className="z-10 mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-2xl bg-white p-8 text-center shadow-lg"
      >
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
          animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.28, ease: "easeOut", delay: 0.08 }
          }
          className="flex size-16 items-center justify-center rounded-full bg-green-100 text-green-600"
        >
          <CheckCircle2 className="size-10" strokeWidth={2.5} />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-800">
          {t("submit:success.title")}
        </h2>
        <p className="text-sm leading-6 text-gray-600">
          {t("submit:success.body")}
        </p>
        <Button
          onClick={handleReset}
          className="min-h-11 w-full rounded-xl"
          size="md"
        >
          {t("submit:success.again")}
        </Button>
      </motion.div>
    )
  }

  return (
    <div className="z-10 flex max-h-[calc(100dvh-7.5rem)] w-full max-w-xl flex-col px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
        <div className="flex flex-col gap-4">
          <header className="mb-1 text-center text-white drop-shadow-lg">
            <h2 className="text-3xl font-extrabold tracking-tight">
              {t("submit:form.title")}
            </h2>
            <p className="mt-2 text-sm leading-6 font-semibold text-white/90">
              {t("submit:form.subtitle")}
            </p>
          </header>

          <RevealSection index={0} label={t("submit:form.section.name")}>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <label htmlFor="submit-submitted-by" className="sr-only">
                {t("submit:form.namePlaceholder")}
              </label>
              <Input
                id="submit-submitted-by"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
                placeholder={t("submit:form.namePlaceholder")}
                className="min-h-11 w-full rounded-xl"
                autoComplete="name"
              />
            </div>
          </RevealSection>

          <RevealSection index={1} label={t("submit:form.section.question")}>
            <QuestionEditorTitle />
            <div className="rounded-2xl bg-white p-4 shadow-sm [&>div>div:first-child]:-mx-1 [&>div>div:first-child]:overflow-x-auto [&>div>div:first-child]:px-1 [&>div>div:first-child]:pb-1 [&>div>div:first-child>button]:min-h-11 [&>div>div:first-child>button]:shrink-0">
              <QuestionEditorType />
            </div>
          </RevealSection>

          <RevealSection index={2} label={t("submit:form.section.media")}>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm [&_audio]:max-w-full [&_img]:max-w-full [&_video]:max-w-full [&>div]:min-h-0">
              <QuestionEditorMedia />
            </div>
          </RevealSection>

          {!isSlider && !isTypeAnswer && (
            <RevealSection index={3} label={t("submit:form.section.answers")}>
              <div className="w-full overflow-hidden [&>div>div:nth-child(2)]:grid-cols-1 sm:[&>div>div:nth-child(2)]:grid-cols-2">
                <QuestionEditorAnswers />
              </div>
            </RevealSection>
          )}

          {isTypeAnswer && (
            <RevealSection index={3} label="Akzeptierte Antworten">
              <QuestionEditorAcceptedAnswers />
            </RevealSection>
          )}

          <RevealSection index={4} label={t("submit:form.section.settings")}>
            <div className="rounded-2xl bg-white p-4 shadow-sm [&>aside]:m-0 [&>aside]:w-full [&>aside]:p-0 [&>aside]:shadow-none">
              <QuestionEditorConfig />
            </div>
          </RevealSection>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 shrink-0 border-t border-white/40 bg-white/80 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-16px_30px_rgba(15,23,42,0.16)] backdrop-blur">
        {fieldError && (
          <p
            role="alert"
            className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-600 shadow-sm"
          >
            {t(fieldError)}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={awaiting}
          aria-busy={awaiting}
          className="min-h-11 w-full rounded-xl"
          size="md"
        >
          {awaiting && <Loader className="size-5 text-white" />}
          <span>{t("submit:form.submitButton")}</span>
        </Button>
      </div>
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
