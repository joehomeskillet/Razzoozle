import { EVENTS } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import type { Submission } from "@razzia/common/types/submission"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { EmptyState } from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import clsx from "clsx"
import { Check, ChevronDown, Clock, Inbox, Timer } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
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

// Map the question kind to the existing quizz editor type-label keys so the
// preview names the type with the same wording the editor uses.
const TYPE_LABEL_KEY: Record<string, string> = {
  choice: "quizz:type.choice",
  boolean: "quizz:type.boolean",
  slider: "quizz:type.slider",
  poll: "quizz:type.poll",
  "multiple-select": "quizz:type.multipleSelect",
  "type-answer": "quizz:type.typeAnswer",
}

// Read-only render of the full question for the moderator to vet correctness.
// Manager-auth only — showing the solution(s) is intended here.
const QuestionPreview = ({ question }: { question: Question }) => {
  const { t } = useTranslation()

  const type = question.type ?? "choice"
  const isPoll = type === "poll"
  const isSlider = type === "slider"
  const isTypeAnswer = type === "type-answer"
  const solutions = question.solutions ?? []
  const unit = question.unit ? ` ${question.unit}` : ""

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
      {/* Type badge */}
      <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
        {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
      </span>

      <p className="font-semibold text-gray-900">{question.question}</p>

      {question.media && (
        <div className="flex justify-start">
          <QuestionMedia media={question.media} alt={question.question} />
        </div>
      )}

      {/* Choice / boolean / poll / multiple-select: answer grid with the
          correct option(s) highlighted. Poll has no correct answer. */}
      {!isSlider && !isTypeAnswer && (question.answers?.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(question.answers ?? []).map((answer, ai) => {
            const correct = solutions.includes(ai)

            return (
              <div
                key={ai}
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                  ANSWERS_COLORS[ai % ANSWERS_COLORS.length],
                  correct
                    ? "outline-2 -outline-offset-2 outline-green-600"
                    : "opacity-90",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-black/20 text-xs font-bold">
                  {ANSWERS_LABELS[ai % ANSWERS_LABELS.length]}
                </span>
                <span className="min-w-0 flex-1 break-words">{answer}</span>
                {!isPoll && correct && (
                  <Check className="size-5 shrink-0" aria-hidden />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Type-answer: accepted-answers legend */}
      {isTypeAnswer && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {t("quizz:typeAnswer.acceptedAnswersLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(question.acceptedAnswers ?? []).map((a) => (
              <span
                key={a}
                className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Slider: min / max / correct */}
      {isSlider && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-white px-3 py-1.5 text-gray-700 outline-1 -outline-offset-1 outline-gray-200">
            {t("quizz:slider.min")}: {question.min}
            {unit}
          </span>
          <span className="rounded-lg bg-white px-3 py-1.5 text-gray-700 outline-1 -outline-offset-1 outline-gray-200">
            {t("quizz:slider.max")}: {question.max}
            {unit}
          </span>
          <span className="rounded-lg bg-green-100 px-3 py-1.5 font-semibold text-green-700">
            {t("manager:result.slider.correctAnswer")} {question.correct}
            {unit}
          </span>
        </div>
      )}

      {/* Timing */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          {question.time}
          {t("manager:result.timeLimitSuffix")}
        </span>
        <span className="flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden />
          {t("manager:submissions.previewLabels.cooldown")}: {question.cooldown}
          s
        </span>
      </div>
    </div>
  )
}

const ConfigSubmissions = () => {
  const { socket } = useSocket()
  const { submissions, quizz: quizzList } = useConfig()
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [previewId, setPreviewId] = useState<string | null>(null)
  // Full submissions (with the complete question object) fetched over the
  // existing socket contract; the config-context list is meta-only (text).
  const [full, setFull] = useState<Submission[]>([])
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  // Request the full submissions on mount; refresh after any moderation action
  // so a just-approved/rejected/edited question drops out of the preview cache.
  const requestFull = useCallback(() => {
    socket.emit(EVENTS.MANAGER.LIST_SUBMISSIONS)
  }, [socket])

  useEffect(() => {
    requestFull()
  }, [requestFull])

  useEvent(
    EVENTS.MANAGER.SUBMISSIONS_DATA,
    useCallback((subs: Submission[]) => {
      setFull(subs)
    }, []),
  )

  const fullById = (id: string) => full.find((s) => s.id === id)?.question

  const pending = submissions.filter((s) => s.status === "pending")

  const handleOpenApprove = (id: string) => () => {
    setEditingId(null)
    setApprovingId((current) => (current === id ? null : id))
  }

  const handleApprove = (id: string, quizzId: string) => () => {
    socket.emit(EVENTS.MANAGER.APPROVE_SUBMISSION, { id, quizzId })
    setApprovingId(null)
    setPreviewId(null)
    requestFull()
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

    // The server validates the FULL questionValidator object, not a bare
    // string. The inline editor only changes the question TEXT, so merge the
    // edited text back into the complete question object (from SUBMISSIONS_DATA)
    // and emit that — otherwise inline edits fail server-side validation.
    const fullQuestion = fullById(id)

    if (!fullQuestion) {
      return
    }

    socket.emit(EVENTS.MANAGER.EDIT_SUBMISSION, {
      id,
      question: { ...fullQuestion, question: trimmed },
    })
    setEditingId(null)
    requestFull()
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleReject = (id: string) => () => {
    socket.emit(EVENTS.MANAGER.REJECT_SUBMISSION, { id })
    setPreviewId(null)
    requestFull()
    toast.success(t("manager:submissions.reject"))
  }

  const handleTogglePreview = (id: string) => () => {
    setPreviewId((current) => (current === id ? null : id))
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
        {pending.map((s, index) => {
          const previewOpen = previewId === s.id
          const fullQuestion = fullById(s.id)

          return (
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
                  variant="primary"
                  size="sm"
                  className="min-h-11"
                  onClick={handleOpenApprove(s.id)}
                >
                  {t("manager:submissions.approve")}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  onClick={handleOpenEdit(s.id, s.question)}
                >
                  {t("manager:submissions.edit")}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={handleTogglePreview(s.id)}
                  aria-expanded={previewOpen}
                  classNameContent="gap-1.5"
                >
                  {previewOpen
                    ? t("manager:submissions.hidePreview")
                    : t("manager:submissions.preview")}
                  <ChevronDown
                    className={clsx(
                      "size-4 transition-transform",
                      previewOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </Button>

                {editingId === s.id && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-11"
                      onClick={handleSaveEdit(s.id)}
                    >
                      {t("common:save")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      onClick={handleCancelEdit}
                    >
                      {t("common:cancel")}
                    </Button>
                  </>
                )}

                <AlertDialog
                  trigger={
                    <Button variant="danger" size="sm" className="min-h-11">
                      {t("manager:submissions.reject")}
                    </Button>
                  }
                  title={t("manager:submissions.reject")}
                  description={t("manager:submissions.confirmReject")}
                  confirmLabel={t("common:delete")}
                  onConfirm={handleReject(s.id)}
                />
              </div>

              {previewOpen &&
                (fullQuestion ? (
                  <QuestionPreview question={fullQuestion} />
                ) : (
                  <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                    {t("manager:submissions.previewLabels.loading")}
                  </p>
                ))}

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
                      <Button
                        key={quizz.id}
                        variant="secondary"
                        size="sm"
                        type="button"
                        className="min-h-11 w-full p-3 font-medium"
                        classNameContent="w-full justify-between gap-2"
                        onClick={handleApprove(s.id, quizz.id)}
                      >
                        <span className="min-w-0 truncate text-gray-900">
                          {quizz.subject}
                        </span>
                        <Check
                          className="size-5 shrink-0 text-[var(--accent-contrast)]"
                          aria-hidden
                        />
                      </Button>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

export default ConfigSubmissions
