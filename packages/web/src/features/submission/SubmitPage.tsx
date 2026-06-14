import { EVENTS } from "@razzia/common/constants"
import { submissionValidator } from "@razzia/common/validators/submission"
import Background from "@razzia/web/components/Background"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
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
import { useThemeStore } from "@razzia/web/features/theme/store"
import defaultLogo from "@razzia/web/assets/logo.svg"
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

// Mirrors the console header brand (logo → appTitle → bundled logo).
const SubmitBrand = () => {
  const { theme } = useThemeStore()
  const appTitle = theme.appTitle?.trim()

  if (theme.logo) {
    return (
      <img
        src={theme.logo}
        alt={appTitle ?? "logo"}
        className="h-7 w-auto shrink-0 object-contain"
      />
    )
  }

  if (appTitle) {
    return <span className="truncate">{appTitle}</span>
  }

  return <img src={defaultLogo} alt="logo" className="h-7 w-auto shrink-0" />
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
      <p className="w-fit text-xs font-semibold tracking-wide text-gray-500 uppercase">
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
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.32, ease: "easeOut" }
      }
      className="z-10 mx-auto flex max-h-[88svh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-lg xl:max-w-5xl"
    >
      {/* Branded header band — same treatment as the /manager/config console. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 font-bold text-gray-900">
            <SubmitBrand />
          </div>
          <span aria-hidden className="hidden h-5 w-px bg-gray-300 sm:block" />
          <h1 className="hidden truncate text-lg font-semibold text-gray-700 sm:block">
            {t("submit:form.title")}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
        </div>
        <h1 className="w-full truncate text-base font-semibold text-gray-700 sm:hidden">
          {t("submit:form.title")}
        </h1>
      </header>

      {/* Body — sunken gray surface so the white form cards read clearly. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-gray-50 p-4 sm:p-6">
        <p className="mb-4 text-sm leading-6 text-gray-600">
          {t("submit:form.subtitle")}
        </p>

        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-6 xl:gap-y-4">
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
            <div className="mt-2 rounded-2xl bg-white p-4 shadow-sm">
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
            <RevealSection index={3} label={t("submit:form.section.answers")}>
              <QuestionEditorAcceptedAnswers />
            </RevealSection>
          )}

          <RevealSection index={4} label={t("submit:form.section.settings")}>
            <div className="rounded-2xl bg-white p-4 shadow-sm [&>aside]:m-0 [&>aside]:w-full [&>aside]:overflow-visible [&>aside]:rounded-none [&>aside]:bg-transparent [&>aside]:p-0 [&>aside]:shadow-none">
              <QuestionEditorConfig />
            </div>
          </RevealSection>
        </div>
      </div>

      {/* Footer submit bar — pinned to the panel bottom. */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        {fieldError && (
          <p
            role="alert"
            className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-600"
          >
            {t(fieldError)}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={awaiting}
          aria-busy={awaiting}
          className="min-h-11 w-full rounded-xl xl:mx-auto xl:block xl:max-w-lg"
          size="md"
        >
          {awaiting && <Loader className="size-5 text-white" />}
          <span>{t("submit:form.submitButton")}</span>
        </Button>
      </div>
    </motion.section>
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
